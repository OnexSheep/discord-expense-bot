const currencyMap = {
  '港幣': 'HKD', 'hkd': 'HKD', 'hk$': 'HKD',

  '日幣': 'JPY', '日元': 'JPY', 'jpy': 'JPY', 'yen': 'JPY', '¥': 'JPY',

  '台幣': 'TWD', 'twd': 'TWD', 'ntd': 'TWD',

  '美金': 'USD', 'usd': 'USD',

  '歐元': 'EUR', 'eur': 'EUR'
};

function normalizeCurrency(input) {
  if (!input) return null;
  input = input.toLowerCase().trim();

  return currencyMap[input] || null;
}

function parseExpense(content) {
  const text = content.trim();

  // 🔥 支援 ¥1000 / $1000
  const symbolMatch = text.match(/^([¥$])\s*(\d+(?:\.\d+)?)(.*)$/);
  if (symbolMatch) {
    const symbolMap = { '¥': 'JPY', '$': 'USD' };
    return {
      amount: parseFloat(symbolMatch[2]),
      currency: symbolMap[symbolMatch[1]],
      description: symbolMatch[3].trim() || 'No description',
      category: null
    };
  }

  // 🔥 支援 1000yen / 1000jpy
  const inlineMatch = text.match(/^(\d+(?:\.\d+)?)([a-zA-Z¥$]+)\s*(.*)$/);
  if (inlineMatch) {
    const currency = normalizeCurrency(inlineMatch[2]);
    if (currency) {
      return {
        amount: parseFloat(inlineMatch[1]),
        currency,
        description: inlineMatch[3].trim() || 'No description',
        category: null
      };
    }
  }

  // 🔥 原本邏輯（fallback）
  const regex = /^(\d+(?:\.\d+)?)\s*([^\s#]*)?\s*(.*)$/;
  const match = text.match(regex);

  if (!match || parseFloat(match[1]) <= 0) return null;

  const amount = parseFloat(match[1]);
  let rawCurrency = normalizeCurrency(match[2]);
  let description = match[3] || '';

  let currency = rawCurrency || process.env.DEFAULT_CURRENCY || 'USD';

  // category
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
