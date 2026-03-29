const logger = require('../utils/logger');

// 1. 設定全域變數與快取機制
const rateCache = {}; // 針對不同幣別對的詳細快取
let yahooFinance;

// 大阪 6 月旅行保底匯率 (API 噴 429 或是掛掉時的救星)
let backupJPYRate = 0.21; 
const CACHE_DURATION = 3600000; // 快取有效時間：1 小時 (毫秒)

async function getExchangeRate(fromCurrency, toCurrency = 'TWD') {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  
  if (from === to) return 1;
  
  const pair = `${from}${to}=X`;
  const now = Date.now();

  // 2. 💡 檢查記憶體快取：如果一小時內抓過，直接回傳，避免觸發 429
  if (rateCache[pair] && (now - rateCache[pair].time < CACHE_DURATION)) {
    return rateCache[pair].rate;
  }

  try {
    // 3. 懶加載 Yahoo Finance 模組並處理 Class Constructor 問題
    if (!yahooFinance) {
      const module = await import('yahoo-finance2');
      const YF = module.default || module;
      
      try {
        // 針對需要 'new' 的版本進行實例化
        yahooFinance = (typeof YF === 'function' && YF.prototype) ? new YF() : YF;
      } catch (e) {
        yahooFinance = YF;
      }
    }

    let result;
    // 4. 嘗試抓取匯率
    if (yahooFinance.quote && typeof yahooFinance.quote === 'function') {
      result = await yahooFinance.quote(pair);
    } else if (typeof yahooFinance === 'function') {
      result = await yahooFinance(pair);
    }

    if (result) {
      const quoteData = Array.isArray(result) ? result[0] : result;
      const rate = quoteData?.regularMarketPrice || quoteData?.bid || quoteData?.ask;

      if (typeof rate === 'number' && rate > 0) {
        // 更新快取
        rateCache[pair] = { rate, time: now };
        
        // 如果是日幣，順便更新全域保底匯率
        if (from === 'JPY') backupJPYRate = rate;
        
        return rate;
      }
    }
    
    throw new Error("API 回傳數值無效");

  } catch (error) {
    // 5. 💡 發生 429 (Too Many Requests) 或網路錯誤時的保底
    logger.warn(`Exchange API failed (${pair}): ${error.message}. Using backup rate.`);
    
    // 如果是日幣，回傳上次成功的匯率或 0.21
    if (from === 'JPY') return backupJPYRate;
    
    // 其他幣別如果沒快取，就先回傳 1 (不影響金額，但至少不報錯)
    return rateCache[pair]?.rate || 1;
  }
}

module.exports = { getExchangeRate };
