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
      const moduleNamespace = await import('yahoo-finance2');
      
      // 🚀 自動展開所有層級的 .default
      let target = moduleNamespace;
      while (target && target.default && !target.quote) {
        target = target.default;
      }
      yahooFinance = target;
    }

    // 檢查抓到的對象
    if (yahooFinance && typeof yahooFinance.quote === 'function') {
      // 💡 某些版本需要使用 .quote(pair)，某些則掛在 .default 下
      // 這裡直接呼叫我們找到的函式
      const result = await yahooFinance.quote(pair);
      const rate = result?.regularMarketPrice || result?.bid || result?.ask;

      if (typeof rate === 'number' && rate > 0) {
        rateCache[pair] = { rate, time: Date.now() };
        return rate;
      }
    }
    
    throw new Error(`找不到 quote 或數值無效。目前物件屬性: ${Object.keys(yahooFinance || {})}`);

  } catch (error) {
    logger.error(`Yahoo Finance Error for ${pair}: ${error.message}`);
    // 💡 6 月大阪保底：只要辨識出是 JPY，API 壞掉也給 0.21
    return (fromCurrency.toUpperCase() === 'JPY') ? 0.21 : 1;
  }
}

module.exports = { getExchangeRate };;
