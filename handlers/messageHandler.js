const { addExpenseToSheet } = require('../services/sheetService');
const { parseExpense } = require('../utils/expenseParser');
const logger = require('../utils/logger');
const { ChannelType } = require('discord.js'); // 💡 引入 ChannelType

const PREFIX = process.env.PREFIX || '!';

const currencyMap = {
  '日幣': 'JPY', '日圓': 'JPY', '日元': 'JPY',
  '美金': 'USD', '美元': 'USD',
  '台幣': 'TWD', '台元': 'TWD',
  '港幣': 'HKD', '歐元': 'EUR'
};

async function handleMessage(message) {
  // 💡 防禦 1：過濾掉 Render 舊實體復活時堆積的舊訊息
  if (Date.now() - message.createdTimestamp > 10000) return;
  if (message.author.bot) return;

  // 💡 防禦 2：內存級防重複 (雙重鎖)
  if (!global.processedMessages) global.processedMessages = new Set();
  if (global.processedMessages.has(message.id)) return;
  global.processedMessages.add(message.id);
  // 定期清理避免內存洩漏 (可選)
  if (global.processedMessages.size > 100) global.processedMessages.clear();

  const isDM = message.channel.type === ChannelType.DM;
  const commandPrefix = `${PREFIX}expense`;
  const isCommand = message.content.startsWith(commandPrefix);
  
  if (isDM || isCommand) {
    // 💡 修正切除方式，確保拿到乾淨的輸入
    let content = isCommand 
      ? message.content.substring(commandPrefix.length).trim() 
      : message.content.trim();
    
    if (!content) return;
    
    try {
      const expense = parseExpense(content);
      
      if (!expense) {
        return message.reply(`格式錯誤！請試試：\`1000 日幣 拉麵\` 或 \`500 午餐\``);
      }

      // 幣別補強邏輯
      for (const [key, val] of Object.entries(currencyMap)) {
        if (content.includes(key)) {
          expense.currency = val;
          expense.description = expense.description.replace(key, '').trim();
          break; 
        }
      }

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
