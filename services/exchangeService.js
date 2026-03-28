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
    // 💡 關鍵：如果尚未載入，則使用動態 import()
    if (!yahooFinance) {
    const module = await import('yahoo-finance2');
    yahooFinance = module.default || module;
    }

    const result = await yahooFinance.quote(pair);
    const rate = result.regularMarketPrice;
    rateCache[pair] = { rate, time: Date.now() };
    return rate;
  } catch (error) {
    logger.error(`Yahoo Finance Error for ${pair}:`, error);
    // 為了 6 月大阪行，這裡建議回傳一個保底日幣匯率，避免記帳失敗
    return fromCurrency.toUpperCase() === 'JPY' ? 0.21 : 1;
  }
}

module.exports = { getExchangeRate };
