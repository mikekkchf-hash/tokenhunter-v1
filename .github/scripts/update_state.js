// github/scripts/update_state.js
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// اسکریپت ساده برای commit کردن فایل‌های وضعیت در GitHub
// توجه: این کار در محیط محلی شما یا GitHub Actions انجام می‌شود
// اینجا فقط یک نمونه از نحوه استفاده از `git` command در Node.js آورده شده است.
// برای استفاده در Actions، از `actions/checkout` و `git config`, `git add`, `git commit`, `git push` استفاده می‌شود.

async function commitStateFiles() {
    const filesToCommit = [
        path.join(__dirname, '..', '..', 'data', 'profitable_tokens.csv'),
        path.join(__dirname, '..', '..', 'data', 'smart_wallets.csv'),
        path.join(__dirname, '..', '..', 'data', 'last_seen.json')
    ];

    const commitMessage = `Update state files - $(date)`;

    console.log(`Committing files: ${filesToCommit.join(', ')}`);

    const { exec } = require('child_process');
    const execProm = (cmd) => new Promise((resolve, reject) => exec(cmd, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
    }));

    try {
        await execProm('git add ' + filesToCommit.join(' '));
        await execProm(`git commit -m "${commitMessage}"`);
        await execProm('git push');
        console.log('✅ State files committed and pushed to GitHub.');
    } catch (e) {
        console.error('Error committing state files:', e);
        // در صورت خطا، می‌توان یک فایل `pending.json` ساخت یا یک Issue گیت‌هاب ایجاد کرد
        console.log('Consider writing to pending file or creating GitHub issue.');
    }
}

if (require.main === module) {
    commitStateFiles().catch(console.error);
}

module.exports = { commitStateFiles };