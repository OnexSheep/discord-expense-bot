const logger = require('../utils/logger');
const rateCache = {};
let yahooFinance;

async function getExchangeRate(fromCurrency, toCurrency = 'TWD') {
  if (fromCurrency === toCurrency) return 1;
  const pair = `${fromCurrency}${toCurrency}=X`;

  if (rateCache[pair] && (Date.now() - rateCache[pair].time < 3600000)) {
    return rateCache[pair].rate;
  }

  try {
    if (!yahooFinance) {
      const module = await import('yahoo-finance2');
      // 🚀 最保險的抓取方式：嘗試所有可能的入口
      yahooFinance = module.default?.default || module.default || module;
      
      // 除錯用：如果還是失敗，印出完整的型態
      if (typeof yahooFinance.quote !== 'function') {
        logger.warn(`YahooFinance structure: ${typeof yahooFinance}, keys: ${Object.keys(yahooFinance)}`);
      }
    }

    if (yahooFinance && typeof yahooFinance.quote === 'function') {
      const result = await yahooFinance.quote(pair);
      // 💡 修正：Yahoo Finance 有時會回傳陣列或物件，這裡做個相容處理
      const quoteData = Array.isArray(result) ? result[0] : result;
      const rate = quoteData?.regularMarketPrice || quoteData?.bid || quoteData?.ask;

      if (typeof rate === 'number' && rate > 0) {
        rateCache[pair] = { rate, time: Date.now() };
        return rate;
      }
    }
    
    throw new Error("無法從 API 取得有效匯率");

  } catch (error) {
    logger.error(`Yahoo Finance Error for ${pair}: ${error.message}`);
    // 💡 6 月大阪保底機制
    if (fromCurrency.toUpperCase() === 'JPY') return 0.21;
    return 1;
  }
}

module.exports = { getExchangeRate };
