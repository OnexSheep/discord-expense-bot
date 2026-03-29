async function getExchangeRate(fromCurrency, toCurrency = 'TWD') {
  if (fromCurrency === toCurrency) return 1;
  const pair = `${fromCurrency}${toCurrency}=X`;

  if (rateCache[pair] && (Date.now() - rateCache[pair].time < 3600000)) {
    return rateCache[pair].rate;
  }

  try {
    if (!yahooFinance) {
      const module = await import('yahoo-finance2');
      // 💡 針對 yahoo-finance2 v2.x 版本的精準抓取
      yahooFinance = module.default || module;
    }

    // 💡 確保抓到真正的 API 對象 (有些環境會包在 default 裡)
    const api = (yahooFinance.default && typeof yahooFinance.default.quote === 'function') 
                ? yahooFinance.default 
                : yahooFinance;

    if (typeof api.quote === 'function') {
      // 💡 2.13.2 版建議直接呼叫，不一定要用 .call
      const result = await api.quote(pair);
      
      // Yahoo Finance 價格欄位優先級：現價 > 買價 > 賣價
      const rate = result?.regularMarketPrice || result?.bid || result?.ask;

      if (typeof rate === 'number' && rate > 0) {
        rateCache[pair] = { rate, time: Date.now() };
        return rate;
      }
      throw new Error(`Rate received is not a valid number: ${rate}`);
    } else {
      throw new Error('Could not locate quote function in yahoo-finance2');
    }
  } catch (error) {
    // 💡 即使 API 報錯，只要是 JPY 就回傳保底 0.21
    // 這對你 6 月去日本大阪非常重要，確保即便沒網路或 API 掛掉也能記帳
    logger.error(`Yahoo Finance Error for ${pair}: ${error.message}`);
    return fromCurrency.toUpperCase() === 'JPY' ? 0.21 : 1;
  }
}
