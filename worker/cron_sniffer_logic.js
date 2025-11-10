// worker/cron_sniffer_logic.js (پَچ شده)
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen
// SOURCE_FOR: DEPLOY

// ... [کد قبلی] ...

export async function runCronSniffer(env) {
    console.log(`✅ Cron Run Started!`);
    
    // 📋 گرفتن تنظیمات
    const config = await getConfig(env);

    // 📊 1. تشخیص حالت بازار (Market Regime)
    console.log("📊 Detecting market regime...");
    let marketRegime = { regime: 'NEUTRAL', multipliers: { risk: 1.0, opportunity: 1.0 } };
    try {
        marketRegime = await detectMarketRegime({ cfg: config, env });
    } catch (e) {
        console.error("Failed to detect market regime, using default:", e.message);
        // ادامه با حالت پیش‌فرض
    }
    console.log(`Regime detected: ${marketRegime.regime}`);

    // 🛡️ 2. تصمیم حالت ایمن (Safe Mode)
    const safeMode = decideSafeMode(marketRegime.regime, marketRegime.metrics, config, env);
    if (safeMode.safeMode) {
        console.log("🛡️ Safe Mode Active. Sending daily summary only.");
        const summaryMessage = `<b>🛡️ Daily Summary (Safe Mode Active)</b>\n` +
            `<b>Regime:</b> ${marketRegime.regime}\n` +
            `<b>Actions:</b> ${safeMode.actions.join(', ')}\n` +
            `<b>Time:</b> ${new Date().toISOString()}`;
        await sendTelegramAlert(summaryMessage, env);
        return 0; // خروج زودهنگام
    }

    // 🔍 3. اسکن از طریق DexScreener (برای توکن‌های جدید)
    console.log("🔍 Fetching new pairs from DexScreener...");
    const newPairs = await fetchNewPairsFromDexScreener(env);
    
    // 🔍 4. چک کردن تراکنش‌های ولت‌های کالیبره (Monitor Incremental)
    console.log("🔍 Checking transactions for calibrated wallets...");
    try {
        await pollWalletsIncremental(env, config);
    } catch (e) {
        console.error("Error in incremental wallet monitor:", e);
    }

    console.log(`✅ Cron Run Finished!`);
    return 1;
}