const logger = require('../utils/logger');
const rateCache = {};
let yahooFinance;

async function getExchangeRate(fromCurrency, toCurrency = 'TWD') {
  if (fromCurrency === toCurrency) return 1;
  const pair = `${fromCurrency}${toCurrency}=X`;

  // 1. 檢查快取
  if (rateCache[pair] && (Date.now() - rateCache[pair].time < 3600000)) {
    return rateCache[pair].rate;
  }

  try {
    // 2. 動態載入模組
    if (!yahooFinance) {
      const module = await import('yahoo-finance2');
      // 🚀 針對 Render/ESM 的多層結構進行剝離
      yahooFinance = module.default?.default || module.default || module;
    }

    let result;
    // 3. 根據不同的模組導出方式進行呼叫
    if (yahooFinance && typeof yahooFinance.quote === 'function') {
      result = await yahooFinance.quote(pair);
    } else if (typeof yahooFinance === 'function') {
      // 💡 應對日誌顯示的 "structure: function"
      result = await yahooFinance(pair);
    } else if (yahooFinance?.default?.quote) {
      result = await yahooFinance.default.quote(pair);
    }

    // 4. 解析數據
    if (result) {
      const quoteData = Array.isArray(result) ? result[0] : result;
      const rate = quoteData?.regularMarketPrice || quoteData?.bid || quoteData?.ask;

      if (typeof rate === 'number' && rate > 0) {
        rateCache[pair] = { rate, time: Date.now() };
        return rate;
      }
    }
    
    throw new Error("API result format invalid or empty");

  } catch (error) {
    logger.error(`Yahoo Finance Error for ${pair}: ${error.message}`);
    // 💡 6 月大阪保底機制：JPY 給 0.21，其餘 1
    return (fromCurrency.toUpperCase() === 'JPY') ? 0.21 : 1;
  }
} // <-- 剛才漏掉的這個括號補上了

module.exports = { getExchangeRate };;
