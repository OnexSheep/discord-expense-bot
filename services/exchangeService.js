const yahooFinance = require('yahoo-finance2').default;
const logger = require('../utils/logger');

// 快取匯率，避免每次都爬（保護 API 不被封鎖）
const rateCache = {};

async function getExchangeRate(fromCurrency, toCurrency = 'TWD') {
  if (fromCurrency === toCurrency) return 1;
  
  const pair = `${fromCurrency}${toCurrency}=X`;
  
  // 如果 1 小時內抓過，就用舊的 (Cache)
  if (rateCache[pair] && (Date.now() - rateCache[pair].time < 3600000)) {
    return rateCache[pair].rate;
  }

  try {
    const result = await yahooFinance.quote(pair);
    const rate = result.regularMarketPrice;
    rateCache[pair] = { rate, time: Date.now() };
    return rate;
  } catch (error) {
    logger.error(`Yahoo Finance Error for ${pair}:`, error);
    return 1; // 失敗時回傳 1，至少不會讓程式崩潰
  }
}

module.exports = { getExchangeRate };
