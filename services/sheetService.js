const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
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

const getJwtClient = (scopes = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
]) => {
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
 * 檢查日期並在需要時插入分隔列 (包含第一天)
 */
async function addDateDividerIfNeeded(sheet, currentDate) {
  const rows = await sheet.getRows();
  const headerFormat = {
    Timestamp: '📅 日期',
    'User ID': '👤 使用者',
    Username: '🏷️ 名字',
    Amount: '💰 金額',
    Currency: '💱 幣別',
    'Amount (TWD)': '🇹🇼 台幣',
    Description: `📢 --- ${currentDate} 帳目紀錄 ---`,
    Category: '📂 分類',
    Date: currentDate
  };

  if (rows.length === 0) {
    await sheet.addRow(headerFormat);
    return;
  }

  const lastRow = rows[rows.length - 1];
  const lastDate = lastRow.get('Date');

  if (lastDate && lastDate !== currentDate) {
    // 插入一個空行隔開
    await sheet.addRow({});
    // 插入新的一天的完整標題列
    await sheet.addRow(headerFormat);
  }
}
/**
 * 核心：建立新試算表 (修正了原本 ReferenceError 的問題)
 */
async function createNewSheet(sheetName, makePublic = true) {
  try {
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
    
    const response = await sheets.spreadsheets.create({
      resource: {
        properties: { title: sheetName },
        sheets: [
          { properties: { title: 'Expenses', gridProperties: { frozenRowCount: 1 } } }
        ]
      }
    });

    const spreadsheetId = response.data.spreadsheetId;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Expenses!A1:I1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [['Timestamp', 'User ID', 'Username', 'Amount', 'Currency', 'Amount (TWD)', 'Description', 'Category', 'Date']]
      }
    });

    return { spreadsheetId, spreadsheetUrl: response.data.spreadsheetUrl };
  } catch (error) {
    logger.error('Error creating new sheet:', error);
    throw error;
  }
}

async function addExpenseToSheet(expense) {
  try {
    if (!process.env.GOOGLE_SHEETS_ID) throw new Error('Sheet ID not set');
    const jwtClient = getJwtClient();
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, jwtClient);
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle['Expenses'];

    if (!sheet) {
      sheet = await doc.addSheet({
        title: 'Expenses',
        headerValues: ['Timestamp', 'User ID', 'Username', 'Amount', 'Currency', 'Amount (TWD)', 'Description', 'Category', 'Date']
      });
    }
    
    const rate = await getExchangeRate(expense.currency, 'TWD');
    
    // 💡 1. 恢復原始名字 (不再過濾，確保名字顯示)
    const displayName = expense.username || 'Unknown';

    // 💡 2. 台北時區設定
    const now = new Date();
    const dateOptions = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
    const timeOptions = { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

    const formattedDate = now.toLocaleDateString('zh-TW', dateOptions);
    const formattedTime = now.toLocaleTimeString('zh-TW', timeOptions);

    // 💡 3. 檢查並插入「標題型」分隔線
    await addDateDividerIfNeeded(sheet, formattedDate);

    await sheet.addRow({
      Timestamp: formattedTime,
      'User ID': displayName, 
      Username: displayName,
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
    
    // 💡 關鍵過濾：排除分隔線並使用強型別比對 ID
// 💡 關鍵過濾：排除「標題橫幅」並比對 Username
    let filteredRows = rows.filter(row => {
      const usernameInRow = String(row.get('Username'));
      const timestampInRow = String(row.get('Timestamp'));
      
      // 1. 排除標題橫幅 (標題橫幅的 Timestamp 通常包含 "📅" 或 "日期")
      // 2. 排除空行
      // 3. 比對名字 (使用傳入的 options.username 或 userId)
      const isNotHeader = !timestampInRow.includes('📅') && !timestampInRow.includes('日期') && timestampInRow !== '';
      
      // 這裡我們比對 Username 欄位
      return isNotHeader && usernameInRow === String(options.username || userId);
    });
    
    if (options.category) {
      filteredRows = filteredRows.filter(row => 
        String(row.get('Category')).toLowerCase() === options.category.toLowerCase()
      );
    }
    
    if (options.startDate) {
      const start = new Date(options.startDate);
      filteredRows = filteredRows.filter(row => new Date(row.get('Timestamp')) >= start);
    }
    
    const expenses = filteredRows.map(row => ({
      timestamp: row.get('Timestamp'),
      amount: parseFloat(row.get('Amount')) || 0,
      currency: row.get('Currency'),
      amountTWD: parseFloat(row.get('Amount (TWD)')) || 0,
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

async function validateSheetAccess(sheetId) {
  try {
    const jwtClient = getJwtClient();
    const doc = new GoogleSpreadsheet(sheetId, jwtClient);
    await doc.loadInfo();
    return { success: true, title: doc.title };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 匯出所有函式
module.exports = { 
  addExpenseToSheet, 
  getExpenseSummary, 
  createNewSheet, 
  validateSheetAccess 
};
