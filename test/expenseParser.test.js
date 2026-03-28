const currencyMap = {
  // 港幣支援
  '港幣': 'HKD',
  'hkd': 'HKD',
  'hk$': 'HKD',
  
  // 日幣支援 (為了 6 月大阪 Hotel Nikko Osaka 行)
  '日幣': 'JPY',
  '日元': 'JPY',
  'jpy': 'JPY',
  'yen': 'JPY',
  
  // 其他常見幣別
  '台幣': 'TWD',
  'twd': 'TWD',
  'ntd': 'TWD',
  '美金': 'USD',
  'usd': 'USD',
  '$': 'USD',
  '歐元': 'EUR',
  'eur': 'EUR'
};
function parseExpense(content) {
  // 1. 強大的 Regex：抓取 [金額] [可能是幣別的字] [描述/分類]
  const regex = /^(\d+(?:\.\d+)?)\s*([^\s#]*)?\s*(.*)$/;
  const match = content.trim().match(regex);

  if (!match || parseFloat(match[1]) <= 0) return null;

  const amount = parseFloat(match[1]);
  let rawCurrency = match[2] ? match[2].toLowerCase() : '';
  let rest = match[3] || '';
  
  let currency = process.env.DEFAULT_CURRENCY || 'USD';
  let description = '';

  // 2. 判斷抓到的第二個區塊是不是幣別
  if (rawCurrency && currencyMap[rawCurrency]) {
    currency = currencyMap[rawCurrency];
    description = rest;
  } else {
    // 如果不是幣別，就把抓到的東西還給 description
    description = (rawCurrency + ' ' + rest).trim();
  }

  // 3. 提取 #分類
  let category = null;
  const categoryMatch = description.match(/#(\S+)/);
  if (categoryMatch) {
    category = categoryMatch[1];
    description = description.replace(/#\S+/, '').trim();
  }

  return {
    amount,
    currency,
    description: description || 'No description',
    category
  };
}
