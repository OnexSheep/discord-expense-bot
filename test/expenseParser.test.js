const currencyMap = {
  '港幣': 'HKD', 'hkd': 'HKD', 'hk$': 'HKD',
  '日幣': 'JPY', '日圓': 'JPY', '日元': 'JPY', 'jpy': 'JPY', 'yen': 'JPY', '¥': 'JPY',
  '台幣': 'TWD', 'twd': 'TWD', 'ntd': 'TWD',
  '美金': 'USD', 'usd': 'USD', '$': 'USD',
  '歐元': 'EUR', 'eur': 'EUR'
};

function normalizeCurrency(input) {
  if (!input) return null;
  // 轉小寫並去掉可能的符號
  const cleanInput = input.toLowerCase().trim();
  return currencyMap[cleanInput] || null;
}

function parseExpense(content) {
  const text = content.trim();

  // 1. 🔥 支援 符號開頭: ¥1000 或 $1000
  const symbolMatch = text.match(/^([¥$])\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (symbolMatch) {
    const symbolMap = { '¥': 'JPY', '$': 'USD' };
    return createExpenseObject(symbolMatch[2], symbolMap[symbolMatch[1]], symbolMatch[3]);
  }

  // 2. 🔥 支援 金額+幣別 (含中文): 1000日幣 或 1000 jpy
  // 加入 \u4e00-\u9fa5 來支援中文字
  const inlineMatch = text.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z\u4e00-\u9fa5¥$]+)\s*(.*)$/);
  if (inlineMatch) {
    const currency = normalizeCurrency(inlineMatch[2]);
    if (currency) {
      return createExpenseObject(inlineMatch[1], currency, inlineMatch[3]);
    }
  }

  // 3. 🔥 Fallback: 只有數字開頭，後面接描述
  const fallbackMatch = text.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (fallbackMatch) {
    const amount = parseFloat(fallbackMatch[1]);
    if (amount <= 0) return null;

    return createExpenseObject(
      fallbackMatch[1],
      process.env.DEFAULT_CURRENCY || 'TWD', // 預設台幣
      fallbackMatch[2]
    );
  }

  return null;
}

// 輔助函式：統一處理描述與分類
function createExpenseObject(amountStr, currency, rawDescription) {
  let description = rawDescription.trim() || 'No description';
  let category = null;

  // 提取標籤 #category
  const categoryMatch = description.match(/#(\S+)/);
  if (categoryMatch) {
    category = categoryMatch[1];
    description = description.replace(/#\S+/, '').trim() || 'No description';
  }

  return {
    amount: parseFloat(amountStr),
    currency: currency.toUpperCase(),
    description: description,
    category: category
  };
}

module.exports = { parseExpense };
