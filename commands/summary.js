const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getExpenseSummary } = require('../services/sheetService');
const logger = require('../utils/logger');
const { getExchangeRate } = require('../services/exchangeService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('summary')
    .setDescription('Get a summary of your expenses')
    .addStringOption(option =>
      option.setName('period')
        .setDescription('Time period for the summary')
        .setRequired(false)
        .addChoices(
          { name: 'Today', value: 'today' },
          { name: 'This Week', value: 'week' },
          { name: 'This Month', value: 'month' },
          { name: 'This Year', value: 'year' },
          { name: 'All Time', value: 'all' }
        ))
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Filter by expense category')
        .setRequired(false)),
        
async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const userId = interaction.user.id;
      const period = interaction.options.getString('period') || 'month';
      const category = interaction.options.getString('category');
      
      const options = { category };
      const now = new Date();
      
      // --- 時間過濾邏輯 (保持不變) ---
      if (period === 'today') {
        options.startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        options.startDate = startOfWeek;
      } else if (period === 'month') {
        options.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === 'year') {
        options.startDate = new Date(now.getFullYear(), 0, 1);
      }
      
      const { expenses } = await getExpenseSummary(userId, options);
      
      if (expenses.length === 0) {
        return interaction.editReply('No expenses found for the selected period.');
      }
      
      // --- 核心匯率換算與分類統計 ---
      let totalTWD = 0;
      const categoriesTWD = {}; // 用台幣統計各分類

      await Promise.all(expenses.map(async (expense) => {
        const rate = await getExchangeRate(expense.currency, 'TWD');
        const amountTWD = expense.amount * rate;
        totalTWD += amountTWD;

        const cat = expense.category || 'Uncategorized';
        categoriesTWD[cat] = (categoriesTWD[cat] || 0) + amountTWD;
      }));

      // --- 建立單一 Embed (修正重複宣告問題) ---
      const summaryEmbed = new EmbedBuilder()
        .setTitle('📊 支出總結 (已換算台幣)')
        .setColor('#0099ff')
        .setDescription(`Summary for: **${getPeriodText(period)}**${category ? ` in category #${category}` : ''}`)
        .addFields(
          { name: '預估總支出', value: `NT$ ${Math.round(totalTWD).toLocaleString()}`, inline: false },
          { name: '明細數量', value: `${expenses.length} 筆`, inline: true },
          { name: '平均每筆', value: `NT$ ${Math.round(totalTWD / expenses.length).toLocaleString()}`, inline: true }
        );

      // 產生分類明細字串
      const categoryBreakdown = Object.entries(categoriesTWD)
        .sort((a, b) => b[1] - a[1]) // 由大到小排序
        .map(([name, amount]) => `**${name}**: NT$ ${Math.round(amount).toLocaleString()}`)
        .join('\n');
      
      summaryEmbed.addFields({ name: '分類統計 (台幣)', value: categoryBreakdown || '無數據', inline: false });
      summaryEmbed.setFooter({ text: `匯率參考自 Yahoo Finance • 生成日期 ${now.toLocaleDateString()}` });
      
      await interaction.editReply({ embeds: [summaryEmbed] });
      
    } catch (error) {
      logger.error('Error generating summary:', error);
      await interaction.editReply('產生總結時出錯，請確認 Yahoo Finance API 是否正常。');
    }
  }
};
/**
 * Get a human-readable description of the time period
 * @param {string} period - The period identifier
 * @returns {string} - Human readable period description
 */
function getPeriodText(period) {
  switch (period) {
    case 'today': return 'Today';
    case 'week': return 'This Week';
    case 'month': return 'This Month';
    case 'year': return 'This Year';
    case 'all': return 'All Time';
    default: return 'This Month';
  }
}
