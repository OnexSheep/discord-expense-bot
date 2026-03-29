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
    if (!yahooFinance) {
      const module = await import('yahoo-finance2');
      // 🚀 核心修正：針對 "Class constructor" 的處理
      // 如果 module.default 是個導出，嘗試取得它
      const YF = module.default || module;
      
      // 如果它是一個需要 'new' 的 Class，我們建立實例；否則直接使用
      try {
        yahooFinance = (typeof YF === 'function' && YF.prototype) ? new YF() : YF;
      } catch (e) {
        yahooFinance = YF;
      }
    }

    let result;
    // 💡 優先嘗試 .quote 方法
    if (yahooFinance.quote && typeof yahooFinance.quote === 'function') {
      result = await yahooFinance.quote(pair);
    } 
    // 💡 備援方案：如果 yahooFinance 本身就是一個可呼叫的函式
    else if (typeof yahooFinance === 'function') {
      result = await yahooFinance(pair);
    }

    if (result) {
      const quoteData = Array.isArray(result) ? result[0] : result;
      // 這裡要精準抓取欄位
      const rate = quoteData?.regularMarketPrice || quoteData?.bid || quoteData?.ask;

      if (typeof rate === 'number' && rate > 0) {
        rateCache[pair] = { rate, time: Date.now() };
        return rate;
      }
    }
    
    throw new Error("無法從 API 取得有效數值");

  } catch (error) {
    logger.error(`Yahoo Finance Error for ${pair}: ${error.message}`);
    // 💡 保底機制：只要是 JPYTWD，API 噴錯就給 0.21
    if (pair.startsWith('JPYTWD')) return 0.21;
    return 1;
  }
} // <-- 剛才漏掉的這個括號補上了

module.exports = { getExchangeRate };;
