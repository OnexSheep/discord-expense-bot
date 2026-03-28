const logger = require('../utils/logger');
const rateCache = {};
let yahooFinance; // 先宣告但不賦值

async function getExchangeRate(fromCurrency, toCurrency = 'TWD') {
  if (fromCurrency === toCurrency) return 1;
  const pair = `${fromCurrency}${toCurrency}=X`;

  if (rateCache[pair] && (Date.now() - rateCache[pair].time < 3600000)) {
    return rateCache[pair].rate;
  }

  try {
    if (!yahooFinance) {
      const module = await import('yahoo-finance2');
      // 💡 修正：相容於不同的環境載入方式
      yahooFinance = module.default || module;
    }

    // 💡 修正：有些版本 quote 放在 yahooFinance.default 裡面
    const api = yahooFinance.quote ? yahooFinance : yahooFinance.default;

    if (api && typeof api.quote === 'function') {
      const result = await api.quote(pair);
      
      // 💡 增加安全性檢查：確保回傳值存在且為數字
      const rate = result?.regularMarketPrice;
      
      if (typeof rate === 'number') {
        rateCache[pair] = { rate, time: Date.now() };
        return rate;
      }
      throw new Error(`Invalid rate received for ${pair}: ${rate}`);
    } else {
      throw new Error('yahooFinance.quote is not a function after import');
    }
  } catch (error) {
    // 這裡保留你的保底邏輯，這對於日本旅遊時非常重要
    logger.error(`Yahoo Finance Error for ${pair}:`, error.message);
    return fromCurrency.toUpperCase() === 'JPY' ? 0.21 : 1;
  }
}
