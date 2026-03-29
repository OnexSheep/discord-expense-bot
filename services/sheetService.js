const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const logger = require('../utils/logger');
const { getExchangeRate } = require('../services/exchangeService');

// 統一取得憑證的邏輯
const getCredentials = () => {
  const envJson = process.env.GOOGLE_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!envJson) {
    throw new Error('Google credentials environment variable is missing');
  }
  return JSON.parse(envJson);
};

const getJwtClient = (scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']) => {
  try {
    const credentials = getCredentials();
    return new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: scopes,
    });
  } catch (error) {
    logger.error('Error loading Google credentials:', error.message);
    throw new Error('Failed to load Google credentials');
  }
};

/**
 * 檢查日期並在需要時插入分隔列
 */
async function addDateDividerIfNeeded(sheet, currentDate) {
  const rows = await sheet.getRows();
  if (rows.length === 0) return;

  const lastRow = rows[rows.length - 1];
  const lastDate = lastRow.get('Date');

  if (lastDate && lastDate !== currentDate && !lastDate.includes('---')) {
    await sheet.addRow({
      Timestamp: '---',
      'User ID': '---',
      Username: '---',
      Amount: '---',
      Currency: '---',
      'Amount (TWD)': '---',
      Description: `📅 新的一天：${currentDate} ----------------`,
      Category: '---',
      Date: currentDate
    });
    logger.info(`Inserted date divider for ${currentDate}`);
  }
}

async function addExpenseToSheet(expense) {
  try {
    if (!process.env.GOOGLE_SHEETS_ID) {
      throw new Error('Google Sheets ID is not configured. Use /setup first.');
    }
    
    const jwtClient = getJwtClient();
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, jwtClient);
    
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Expenses'];

    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'Expenses',
        headerValues: ['Timestamp', 'User ID', 'Username', 'Amount', 'Currency', 'Amount (TWD)', 'Description', 'Category', 'Date']
      });
      await sheet.updateProperties({ gridProperties: { frozenRowCount: 1 } });
    }
    
    const rate = await getExchangeRate(expense.currency, 'TWD');
    const formattedDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric' 
    });

    await addDateDividerIfNeeded(sheet, formattedDate);

    await sheet.addRow({
      Timestamp: new Date().toISOString(),
      'User ID': String(expense.userId), // 💡 強制轉字串
      Username: expense.username,
      Amount: expense.amount,
      Currency: expense.currency.toUpperCase(),
      'Amount (TWD)': Math.round(expense.amount * rate),
      Description: expense.description,
      Category: expense.category || 'Uncategorized',
      Date: formattedDate
    });
    
    return true;
  } catch (error) {
    logger.error('Error adding expense:', error);
    throw error;
  }
}

async function getExpenseSummary(userId, options = {}) {
  try {
    if (!process.env.GOOGLE_SHEETS_ID) throw new Error('Sheet ID missing');
    
    const jwtClient = getJwtClient();
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, jwtClient);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Expenses'];
    
    if (!sheet) return { expenses: [], total: 0 };
    
    const rows = await sheet.getRows();
    
    // 💡 修正 1：過濾時排除掉分隔線「---」，並強制轉換 ID 型別進行比對
    let filteredRows = rows.filter(row => {
      const rowUserId = String(row.get('User ID'));
      const isDivider = row.get('Timestamp') === '---';
      return !isDivider && rowUserId === String(userId);
    });
    
    // 💡 修正 2：類別過濾
    if (options.category) {
      filteredRows = filteredRows.filter(row => 
        String(row.get('Category')).toLowerCase() === options.category.toLowerCase()
      );
    }
    
    // 時間過濾
    if (options.startDate) {
      const start = new Date(options.startDate);
      filteredRows = filteredRows.filter(row => new Date(row.get('Timestamp')) >= start);
    }
    
    // 💡 修正 3：對應正確的物件屬性，確保 Summary 指令拿得到資料
    const expenses = filteredRows.map(row => ({
      timestamp: row.get('Timestamp'),
      userId: row.get('User ID'),
      username: row.get('Username'),
      amount: parseFloat(row.get('Amount')) || 0,
      currency: row.get('Currency'),
      amountTWD: parseFloat(row.get('Amount (TWD)')) || 0, // 新增這行
      description: row.get('Description'),
      category: row.get('Category')
    }));
    
    const total = expenses.reduce((sum, exp) => sum + exp.amountTWD, 0);
    
    return { expenses, total };
  } catch (error) {
    logger.error('Error getting summary:', error);
    throw error;
  }
}

// createNewSheet, validateSheetAccess 保持不變，只需匯出即可
// (建議保留你原本檔案末尾的 createNewSheet 和 validateSheetAccess 邏輯)

module.exports = { 
  addExpenseToSheet, 
  getExpenseSummary, 
  createNewSheet, 
  validateSheetAccess 
};
