const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('了解如何使用記帳機器人'),
    
  async execute(interaction) {
    const prefix = process.env.PREFIX || '!';
    
    const embed = new EmbedBuilder()
      .setTitle('💰 記帳機器人使用說明')
      .setColor('#0099ff')
      .setDescription('傳送訊息給機器人，就能輕鬆記錄你的每筆旅費與花費。')
      .addFields(
        { 
          name: '📝 記錄支出', 
          value: `你可以透過以下兩種方式記錄支出：
          1. **私訊（DM）**：直接將金額、幣別與描述發送給機器人。
          2. **伺服器指令**：在頻道中輸入 \`${prefix}add 金額 描述\`。
          
          **輸入範例：**
          • \`1000 日幣 拉麵\` - 記錄花費 1000 JPY 在拉麵上
          • \`50 HKD 奶茶\` - 記錄花費 50 港幣在奶茶上
          • \`500 午餐 #食物\` - 帶有分類的記帳（使用預設幣別）`, 
          inline: false 
        },
        { 
          name: '🏷️ 使用分類', 
          value: `在訊息最後加上「#」字號與分類名稱：
          • \`300 晚餐 #食物\`
          • \`500 計程車 #交通\``, 
          inline: false 
        },
        { 
          name: '📊 獲取總結報表', 
          value: `使用 \`/summary\` 指令可以查看支出圖表，並支援以下篩選：
          • **時間範圍**：今天、本週、本月、今年、全部紀錄
          • **過濾類別**：可指定只看某個特定的分類`, 
          inline: false 
        },
        { 
          name: '💡 進階小撇步', 
          value: `• 保持分類名稱一致（例如都用 #食物），統計出來的報表會更準確喔！
          • 你可以連續傳送多條訊息，機器人都會幫你自動排隊記錄。
          • 隨時使用總結功能，才能隨時掌握荷包的剩餘戰鬥力！`, 
          inline: false 
        }
      )
      .setFooter({ text: '如有任何使用疑問，請聯絡伺服器管理員。' });
    
    // 💡 這裡也幫你改成了新版的 flags 寫法，避免 Deprecation 警告
    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  }
};
