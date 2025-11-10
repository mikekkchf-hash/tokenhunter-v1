// .github/scripts/wallet_calibrator.js
// این اسکریپت باید در محیط Node.js اجرا شود (مثلاً در GitHub Actions)

// require('dotenv').config(); // معمولاً در GitHub Actions لازم نیست

const fetch = require('node-fetch'); // اگر با Node 18 یا بالاتر اجرا می‌شود، ممکن است نیاز به نصب node-fetch نباشد

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const WORKER_NAMESPACE_ID = process.env.WORKER_NAMESPACE_ID; // KV ID

// فرض: یک لیست اولیه از ولت‌ها برای بررسی
const initialWallets = [
    "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", // مثال
    "0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8", // مثال
    // ... بقیه
];

async function fetchWalletTransactions(address) {
    // تأیید وجود کلید API
    if (!ETHERSCAN_API_KEY) {
        throw new Error("ETHERSCAN_API_KEY is not set in environment variables.");
    }

    // برای اتریوم: api.etherscan.io
    // برای بی‌اس‌سی: api.bscscan.com
    // اطمینان از اینکه کلید برای زنجیره صحیح است
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    console.log(`Fetching transactions for ${address} from ${url}`); // لاگ برای اشکال‌زدایی

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== '1') {
        console.error(`Etherscan API Error for ${address}:`, data.message);
        return []; // یا می‌توانید یک خطا پرتاب کنید
    }

    return data.result;
}

function calculateWalletScore(transactions) {
    // الگوریتم ساده: تعداد تراکنش‌های موفق / کل، میانگین ROI فرضی
    if (transactions.length === 0) {
        return 0; // اگر تراکنشی نبود، امتیاز صفر
    }

    const successful = transactions.filter(tx => tx.isError === '0');
    const successRate = successful.length / transactions.length;
    // ... محاسبات پیچیده‌تر
    // فرض می‌کنیم میانگین ROI یا سایر معیارها محاسبه شده‌اند (در اینجا فقط success rate است)
    const score = successRate * 10; // مثلاً نمره 0-10
    return Math.min(10, Math.max(0, score)); // اطمینان از محدوده 0-10
}

async function updateKVWithSmartWallets(smartWallets) {
    // تأیید وجود کلیدهای ضروری
    if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !WORKER_NAMESPACE_ID) {
        throw new Error("One or more Cloudflare credentials (API_TOKEN, ACCOUNT_ID, NAMESPACE_ID) are not set in environment variables.");
    }

    // URL اصلاح شده: حذف فاصله‌های اضافی
    const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${WORKER_NAMESPACE_ID}/values/calibrated_wallets`;

    const headers = {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
    };

    // ممکن است KV بخواهد یک آبجکت یا آرایه JSON ذخیره کند
    // توجه: محتوای ارسالی باید متن ساده یا یک مقدار پشت کلید باشد
    // در اینجا ما لیست آدرس‌ها را به عنوان یک آرایه JSON ذخیره می‌کنیم
    const body = JSON.stringify(smartWallets);

    console.log(`Updating KV with ${smartWallets.length} wallets...`); // لاگ برای اشکال‌زدایی
    console.log(`URL: ${url}`); // لاگ برای اشکال‌زدایی

    const response = await fetch(url, {
        method: 'PUT', // یا 'POST' بسته به نیاز
        headers,
        body
    });

    if (response.ok) {
        console.log('KV updated successfully with new calibrated wallets.');
    } else {
        const errorText = await response.text();
        console.error('Failed to update KV:', errorText);
        console.error('Response Status:', response.status);
        // ممکن است بخواهید یک خطا پرتاب کنید تا workflow متوقف شود
        // throw new Error(`Failed to update KV: ${errorText}`);
    }
}

async function main() {
    console.log('Starting wallet calibration...');
    const scores = {};

    for (const addr of initialWallets) {
        try {
            console.log(`Fetching transactions for ${addr}...`);
            const txs = await fetchWalletTransactions(addr);
            const score = calculateWalletScore(txs);
            scores[addr] = score;
            console.log(`${addr}: Score ${score}`);
        } catch (e) {
            console.error(`Error processing ${addr}:`, e.message); // فقط پیام خطا
            // ادامه دادن به پردازش ولت بعدی
        }
    }

    // فیلتر کردن ولت‌های با امتیاز بالا
    const highScoreWallets = Object.entries(scores)
        .filter(([addr, score]) => score >= 7) // آستانه
        .map(([addr, score]) => addr);

    console.log('High score wallets:', highScoreWallets);

    if (highScoreWallets.length > 0) {
        // ذخیره در KV فقط اگر لیست خالی نبود
        await updateKVWithSmartWallets(highScoreWallets);
    } else {
        console.log("No wallets met the score threshold. KV will not be updated.");
    }

    console.log('Calibration finished.');
}

main().catch(console.error);
