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
      // 💡 關鍵修正：嘗試多種可能的導出路徑
      yahooFinance = module.default?.default || module.default || module;
    }

    // 💡 關鍵修正：確認 quote 函式的真正位置
    const quoteFn = yahooFinance.quote || (yahooFinance.default && yahooFinance.default.quote);

    if (typeof quoteFn === 'function') {
      // 使用 .call 確保 this 指向正確（如果套件內部需要的話）
      const result = await quoteFn.call(yahooFinance, pair);
      
      // 檢查結果物件中是否有不同的價格欄位
      const rate = result?.regularMarketPrice || result?.bid || result?.ask;

      if (typeof rate === 'number') {
        rateCache[pair] = { rate, time: Date.now() };
        return rate;
      }
      throw new Error(`Rate is not a number: ${rate}`);
    } else {
      throw new Error('Could not find quote function in yahoo-finance2 module');
    }
  } catch (error) {
    logger.error(`Yahoo Finance Error for ${pair}:`, error.message);
    // 為了 6 月大阪行，這裡回傳保底日幣匯率，避免記帳失敗
    return fromCurrency.toUpperCase() === 'JPY' ? 0.21 : 1;
  }
}
