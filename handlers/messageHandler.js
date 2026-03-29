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
  
  // 定期清理避免內存洩漏
  if (global.processedMessages.size > 100) global.processedMessages.clear();

  // 🛡️ 權限驗證：只允許特定伺服器的成員使用（包含私訊）
  if (process.env.GUILD_ID) {
    try {
      const guild = await message.client.guilds.fetch(process.env.GUILD_ID);
      const member = await guild.members.fetch(message.author.id).catch(() => null);

      if (!member) {
        // 如果對方不在伺服器內，直接安靜無視，保護試算表
        return; 
      }
    } catch (err) {
      logger.error('驗證成員身分失敗:', err);
      return; // 驗證過程出錯也先擋住，安全第一
    }
  }

  const isDM = message.channel.type === ChannelType.DM;
  const commandPrefix = `${PREFIX}add`;
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

// 💡 1. 抓取漂亮的顯示名稱與原始帳號 ID
      const member = message.member || (message.guild ? await message.guild.members.fetch(message.author.id).catch(() => null) : null);
      
      const beautifulName = member ? member.displayName : (message.author.globalName || message.author.username); // Sheep 🐾
      const rawUsername = message.author.username; // sheep.is

      // 💡 2. 傳送到試算表服務
      await addExpenseToSheet({
        ...expense,
        userId: message.author.id,
        username: rawUsername,     // 👈 對應 Username 欄位 (sheep.is)
        displayName: beautifulName, // 👈 對應 User ID 欄位 (Sheep 🐾)
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
