const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'USD';

/**
 * Parse an expense message into structured data
 * @param {string} message - The expense message to parse
 * @returns {Object|null} - The parsed expense or null if invalid
 */
function parseExpense(message) {
  // Trim the message to remove whitespace
  const text = message.trim();
  
  // Basic expense regex: amount + description + optional category
  // 💡 修正：將 (\w+) 改為 (\S+)，以支援中文等非英文字元作為分類
  const expenseRegex = /^(\d+\.?\d*)\s+(?:([A-Z]{3})\s+)?(.+?)(?:\s+#(\S+))?$/i;
  
  const match = text.match(expenseRegex);
  
  if (!match) return null;
  
  const [, amountStr, currencyStr, description, category] = match;
  const amount = parseFloat(amountStr);
  const currency = currencyStr ? currencyStr.toUpperCase() : DEFAULT_CURRENCY;
  
  // Validate the parsed data
  if (isNaN(amount) || amount <= 0) return null;
  
  return {
    amount,
    currency,
    description: description.trim(),
    category: category ? category.toLowerCase() : null
  };
}

module.exports = { parseExpense };
