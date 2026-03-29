const logger = require('../utils/logger'); // 💡 確保路徑正確指向你的 logger
const rateCache = {}; // 💡 必須在函式外宣告，匯率快取才能跨次使用
let yahooFinance; // 💡 預留給動態 import 使用

async function getExchangeRate(fromCurrency, toCurrency = 'TWD') {
  if (fromCurrency === toCurrency) return 1;
  const pair = `${fromCurrency}${toCurrency}=X`;

  if (rateCache[pair] && (Date.now() - rateCache[pair].time < 3600000)) {
    return rateCache[pair].rate;
  }

  try {
    if (!yahooFinance) {
      yahooFinance = await import('yahoo-finance2');
    }

    // 💡 終極暴力尋找法：窮舉 ESM 模組可能封裝 quote 函式的所有路徑
    const quoteFn = yahooFinance.quote || 
                    yahooFinance.default?.quote || 
                    yahooFinance.default?.default?.quote;

    if (typeof quoteFn === 'function') {
      const result = await quoteFn(pair);
      const rate = result?.regularMarketPrice || result?.bid || result?.ask;

      if (typeof rate === 'number' && rate > 0) {
        rateCache[pair] = { rate, time: Date.now() };
        return rate;
      }
      throw new Error(`抓取到的數值異常: ${rate}`);
    } else {
      // 印出物件結構幫助除錯
      throw new Error(`找不到 quote 函式。目前模組結構: ${JSON.stringify(Object.keys(yahooFinance))}`);
    }
  } catch (error) {
    logger.error(`Yahoo Finance Error for ${pair}: ${error.message}`);
    // 斷網或 API 掛掉時，確保日幣依然能以 0.21 換算記帳
    return fromCurrency.toUpperCase() === 'JPY' ? 0.21 : 1;
  }
}

// 💡 修正：把匯出放在函式「外面」的最底部！
module.exports = { getExchangeRate };
