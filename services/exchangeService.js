const logger = require('../utils/logger');

// 快取匯率，避免重複抓取
const rateCache = {};
let yahooFinance; // 用來存放動態載入的模組

async function getExchangeRate(fromCurrency, toCurrency = 'TWD') {
  if (fromCurrency === toCurrency) return 1;
  
  const pair = `${fromCurrency}${toCurrency}=X`;
  
  // 1 小時快取檢查
  if (rateCache[pair] && (Date.now() - rateCache[pair].time < 3600000)) {
    return rateCache[pair].rate;
  }

  try {
    // 💡 解決 ERR_PACKAGE_PATH_NOT_EXPORTED 的關鍵
    // 在 Node 20 中，這是 CommonJS 載入 ESM 套件的最佳解法
    if (!yahooFinance) {
      const module = await import('yahoo-finance2');
      yahooFinance = module.default;
    }

    const result = await yahooFinance.quote(pair);
    
    if (result && result.regularMarketPrice) {
      const rate = result.regularMarketPrice;
      rateCache[pair] = { rate, time: Date.now() };
      return rate;
    }
    
    throw new Error('No price found');
  } catch (error) {
    logger.error(`Yahoo Finance Error for ${pair}:`, error.message);
    
    // 考慮到你 6 月的大阪行程，這裡給一個保底匯率，避免記帳失效
    if (fromCurrency.toUpperCase() === 'JPY') return 0.21;
    return 1;
  }
}

module.exports = { getExchangeRate };
