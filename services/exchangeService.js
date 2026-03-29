const logger = require('../utils/logger');

// 1. 快取機制
const rateCache = {}; 
let backupJPYRate = 0.21; 
const CACHE_DURATION = 3600000; // 1 小時

async function getExchangeRate(fromCurrency, toCurrency = 'TWD') {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return 1;

  const pair = `${from}${to}=X`;
  const now = Date.now();

  // 檢查快取
  if (rateCache[pair] && (now - rateCache[pair].time < CACHE_DURATION)) {
    return rateCache[pair].rate;
  }

  try {
    // 2. 直接請求 Yahoo Finance Chart API (仿照你的 Rust 邏輯)
    // 使用 v8 版本通常比 v7 更穩定且不需要 Crumb
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${pair}?interval=1m&range=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('Too Many Requests (429)');
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    
    // 3. 解析路徑：chart -> result[0] -> meta -> regularMarketPrice
    const result = data?.chart?.result?.[0];
    const rate = result?.meta?.regularMarketPrice;

    if (typeof rate === 'number' && rate > 0) {
      rateCache[pair] = { rate, time: now };
      if (from === 'JPY') backupJPYRate = rate;
      return rate;
    }

    throw new Error("無法從 API 取得有效數值");

  } catch (error) {
    logger.warn(`Exchange API failed (${pair}): ${error.message}. Using backup.`);
    if (from === 'JPY') return backupJPYRate;
    return rateCache[pair]?.rate || 1;
  }
}

module.exports = { getExchangeRate };
