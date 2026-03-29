const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getExpenseSummary } = require('../services/sheetService');
const { getExchangeRate } = require('../services/exchangeService');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('summary')
    .setDescription('獲取支出總結')
    .addStringOption(option =>
      option.setName('period')
        .setDescription('時間範圍')
        .setRequired(false)
        .addChoices(
          { name: '今天', value: 'today' },
          { name: '本週', value: 'week' },
          { name: '本月', value: 'month' },
          { name: '今年', value: 'year' },
          { name: '全部', value: 'all' }
        ))
    .addStringOption(option =>
      option.setName('category')
        .setDescription('過濾類別')
        .setRequired(false)),

  async execute(interaction) {
    // 定義輔助函式
    const getPeriodText = (p) => {
      const map = { today: '今天', week: '本週', month: '本月', year: '今年', all: '全部紀錄' };
      return map[p] || '本月';
    };

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const userId = interaction.user.id;
      const period = interaction.options.getString('period') || 'month';
      const category = interaction.options.getString('category');
      const now = new Date();
      const options = { category };

      // 設定時間範圍
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

      if (!expenses || expenses.length === 0) {
        return interaction.editReply('該時段沒有任何支出紀錄。');
      }

      // 並行處理匯率換算與分類統計
      let totalTWD = 0;
      const categoriesTWD = {};

      await Promise.all(expenses.map(async (expense) => {
        const rate = await getExchangeRate(expense.currency, 'TWD');
        const amountTWD = expense.amount * rate;
        totalTWD += amountTWD;
        const cat = expense.category || '未分類';
        categoriesTWD[cat] = (categoriesTWD[cat] || 0) + amountTWD;
      }));

      // 產生明細字串
      const categoryBreakdown = Object.entries(categoriesTWD)
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount]) => `**${name}**: NT$ ${Math.round(amount).toLocaleString()}`)
        .join('\n');

      const summaryEmbed = new EmbedBuilder()
        .setTitle('📊 旅費支出總結')
        .setColor('#0099ff')
        .setDescription(`統計範圍：**${getPeriodText(period)}**${category ? ` (類別: #${category})` : ''}`)
        .addFields(
          { name: '總預算花費', value: `**NT$ ${Math.round(totalTWD).toLocaleString()}**`, inline: false },
          { name: '紀錄筆數', value: `${expenses.length} 筆`, inline: true },
          { name: '每筆平均', value: `NT$ ${Math.round(totalTWD / expenses.length).toLocaleString()}`, inline: true },
          { name: '分類明細 (台幣)', value: categoryBreakdown || '無數據', inline: false }
        )
        .setFooter({ text: `匯率參考自 Yahoo Finance • ${now.toLocaleDateString()}` });

      await interaction.editReply({ embeds: [summaryEmbed] });

    } catch (error) {
      logger.error('Error generating summary:', error);
      await interaction.editReply('計算總結時出錯，請確認試算表格式是否正確。');
    }
  } // 這裡關閉 execute 函式
}; // 這裡關閉 module.exports 物件
