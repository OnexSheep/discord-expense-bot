const { addExpenseToSheet } = require('../services/sheetService');
const { parseExpense } = require('../utils/expenseParser');
const logger = require('../utils/logger');

const PREFIX = process.env.PREFIX || '!';

// 💡 幣別對照表
const currencyMap = {
  '日幣': 'JPY', '日圓': 'JPY', '日元': 'JPY',
  '美金': 'USD', '美元': 'USD',
  '台幣': 'TWD', '台元': 'TWD',
  '港幣': 'HKD', '歐元': 'EUR'
};

async function handleMessage(message) {
  // 💡 僅處理 10 秒內發出的訊息，過濾掉舊實體的堆積訊息
  if (Date.now() - message.createdTimestamp > 10000) return;
  if (message.author.bot) return;

  // 防重複處理
  if (!global.processedMessages) global.processedMessages = new Set();
  if (global.processedMessages.has(message.id)) return;
  global.processedMessages.add(message.id);

  const isDM = message.channel.type === 1;
  const isCommand = message.content.startsWith(`${PREFIX}expense`);
  
  if (isDM || isCommand) {
    let content = message.content;
    if (isCommand) {
      content = message.content.slice(`${PREFIX}expense`.length).trim();
    }
    
    if (!content) return;
    
    try {
      // 1. 初步解析
      const expense = parseExpense(content);
      
      if (!expense) {
        return message.reply(`格式錯誤！請試試：\`1000 日幣 拉麵\` 或 \`500 午餐\``);
      }

      // 💡 2. 關鍵修正：檢查 description 裡是否藏著中文幣別
      // 因為目前的 parser 可能把 "日幣" 當成描述的一部分
      for (const [key, val] of Object.entries(currencyMap)) {
        if (content.includes(key)) {
          expense.currency = val;
          // 選項：把描述中的 "日幣" 刪除，讓 Excel 更乾淨
          expense.description = expense.description.replace(key, '').trim();
          break; 
        }
      }

      // 3. 寫入試算表
      await addExpenseToSheet({
        ...expense,
        userId: message.author.id,
        username: message.author.username,
        timestamp: new Date().toISOString()
      });
      
      await message.reply(
        `✅ 已記錄：${expense.amount} ${expense.currency}（${expense.description}）`
      );
      
    } catch (error) {
      logger.error('Error processing expense:', error);
      await message.reply('抱歉，記錄失敗，請稍後再試。');
    }
  }
}

module.exports = { handleMessage };
