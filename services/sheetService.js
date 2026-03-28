const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const fs = require('fs');
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

const getJwtClient = (scopes = ['https://www.googleapis.com/auth/spreadsheets']) => {
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
  
  // 如果表單是空的，不需要分隔線
  if (rows.length === 0) return;

  const lastRow = rows[rows.length - 1];
  const lastDate = lastRow.get('Date');

  // 如果最後一筆資料的日期與現在不同，插入分隔列
  if (lastDate && lastDate !== currentDate) {
    await sheet.addRow({
      Timestamp: '---',
      Username: '---',
      Amount: '---',
      Currency: '---',
      'Amount (TWD)': '---',
      Description: `📅 新的一天：${currentDate} ----------------`,
      Category: '---',
      Date: currentDate
    });
    
    // (進階) 你甚至可以在這裡呼叫格式化，讓這一列變顏色，但目前先求有資料
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
        // 💡 這裡要同步新增 'Amount (TWD)'
        headerValues: ['Timestamp', 'User ID', 'Username', 'Amount', 'Currency', 'Amount (TWD)', 'Description', 'Category', 'Date']
      });
      await sheet.updateProperties({ gridProperties: { frozenRowCount: 1 } });
    }
    
    const date = new Date(expense.timestamp);
// 取得當前匯率與日期
    const rate = await getExchangeRate(expense.currency, 'TWD');
    const formattedDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric' 
    });

    // ✅ 呼叫分隔線函數
    await addDateDividerIfNeeded(sheet, formattedDate);

    // ✅ 寫入消費資料
// 檢查這部分的 Key
await sheet.addRow({
  Timestamp: new Date().toISOString(),
  'User ID': expense.userId,    // 確保有空格
  Username: expense.username,
  Amount: expense.amount,
  Currency: expense.currency,
  'Amount (TWD)': Math.round(expense.amount * rate), // 確保名稱一致
  Description: expense.description,
  Category: expense.category || 'Uncategorized',
  Date: formattedDate
});
    
    logger.info(`Added expense: ${expense.amount} ${expense.currency}`);
    return true;
} catch (error) {
  // 💡 把完整的 error 物件印出來，這樣我們就能在 Render Logs 看到具體是哪個欄位找不到
  logger.error('Full Error Object:', error); 
  logger.error('Error adding expense:', error.message);
  throw error;
}
}
/**
 * Get summary data from the sheet
 * @param {string} userId - Discord user ID
 * @param {Object} options - Filter options
 */
async function getExpenseSummary(userId, options = {}) {
  try {
    // Check if Google Sheets ID is set
    if (!process.env.GOOGLE_SHEETS_ID) {
      throw new Error('Google Sheets ID is not configured. Use /setup first.');
    }
    
    const jwtClient = getJwtClient();
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, jwtClient);
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Expenses'];
    
    if (!sheet) {
      return { expenses: [], total: 0 };
    }
    
    // Load all rows
    const rows = await sheet.getRows();
    
    // Filter by user if provided
    let filteredRows = rows;
    if (userId) {
      filteredRows = rows.filter(row => row['User ID'] === userId);
    }
    
    // Further filtering based on options
    if (options.category) {
      filteredRows = filteredRows.filter(row => 
        row['Category'].toLowerCase() === options.category.toLowerCase()
      );
    }
    
    if (options.startDate) {
      const startDate = new Date(options.startDate);
      filteredRows = filteredRows.filter(row => new Date(row['Timestamp']) >= startDate);
    }
    
    if (options.endDate) {
      const endDate = new Date(options.endDate);
      filteredRows = filteredRows.filter(row => new Date(row['Timestamp']) <= endDate);
    }
    
    // Convert to expense objects
    const expenses = filteredRows.map(row => ({
      timestamp: row['Timestamp'],
      username: row['Username'],
      amount: parseFloat(row['Amount']),
      currency: row['Currency'],
      description: row['Description'],
      category: row['Category']
    }));
    
    // Calculate total (assuming same currency for simplicity)
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    return { expenses, total };
  } catch (error) {
    logger.error('Error getting expense summary:', error);
    throw error;
  }
}

/**
 * Create a new Google Sheet for expense tracking
 * @param {string} sheetName - Name for the new sheet
 * @param {boolean} makePublic - Whether to make the sheet publicly viewable
 * @returns {Object} - Information about the created sheet
 */
async function createNewSheet(sheetName, makePublic = true) {
  try {
    // ✅ 修正：改用 getCredentials 而不是 fs.readFileSync
    const credentials = getCredentials();
    
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets', 
        'https://www.googleapis.com/auth/drive'
      ],
    });
    
    const sheets = google.sheets({ version: 'v4', auth: jwtClient });
    const drive = google.drive({ version: 'v3', auth: jwtClient });
    
const response = await sheets.spreadsheets.create({
  resource: {
    properties: { title: sheetName },
    sheets: [
      // 💡 建立時直接定義好，不要事後再 addSheet
      { properties: { title: 'Expenses', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Summary', gridProperties: { frozenRowCount: 1 } } }
    ]
  }
});

    const spreadsheetId = response.data.spreadsheetId;
    const expensesSheetId = response.data.sheets[0].properties.sheetId;
    
await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: 'Expenses!A1:I1', // 範圍擴大到 I，因為多了 Amount (TWD)
  valueInputOption: 'USER_ENTERED',
  resource: {
    values: [['Timestamp', 'User ID', 'Username', 'Amount', 'Currency', 'Amount (TWD)', 'Description', 'Category', 'Date']]
  }
});

    // ... 後續格式設定與權限保持不變 ...
    return { spreadsheetId, spreadsheetUrl: response.data.spreadsheetUrl, isPublic: makePublic };
  } catch (error) {
    logger.error('Error creating new sheet:', error);
    throw error;
  }
}

/**
 * Validate access to an existing Google Sheet
 * @param {string} sheetId - The ID of the sheet to validate
 * @returns {Object} - Validation result
 */
async function validateSheetAccess(sheetId) {
  try {
    const jwtClient = getJwtClient();
    const doc = new GoogleSpreadsheet(sheetId, jwtClient);
    
    // Try to load the sheet info
    await doc.loadInfo();
    
    return {
      success: true,
      title: doc.title,
      url: `https://docs.google.com/spreadsheets/d/${sheetId}`
    };
  } catch (error) {
    logger.error('Error validating sheet access:', error);
    return {
      success: false,
      error: 'Could not access the Google Sheet. Make sure the bot service account has permission to access it.'
    };
  }
}

module.exports = { 
  addExpenseToSheet, 
  getExpenseSummary, 
  createNewSheet, 
  validateSheetAccess 
};
