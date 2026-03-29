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
  
  // 💡 如果是新表，插入漂亮的第一天橫幅
  if (rows.length === 0) {
    await sheet.addRow({
      Timestamp: '⭐', // 用星星代替 ---
      Description: `┏━━━━━ 📅 記帳起始日：${currentDate} ━━━━━┓`,
      Date: currentDate
    });
    return;
  }

  const lastRow = rows[rows.length - 1];
  const lastDate = lastRow.get('Date');

  if (lastDate && lastDate !== currentDate) {
    const lastDesc = lastRow.get('Description') || '';
    if (!lastDesc.includes('📅')) {
      await sheet.addRow({
        Timestamp: '📅',
        Description: `┏━━━━━ 🌅 新的一天：${currentDate} ━━━━━┓`,
        Date: currentDate
      });
    }
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
    
    // 💡 1. 處理名字：過濾掉所有 Emoji 與特殊符號，只留文字/數字
    // 這會把 "Sheep 🐾" 變成 "Sheep"
    const cleanUsername = expense.username ? expense.username.replace(/[\u\d000-\u\dfff]|[\u2000-\u3000]/g, '').trim() : 'Unknown';

    // 💡 2. 強制台北時區 (UTC+8)
    const now = new Date();
    const dateOptions = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
    const timeOptions = { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

    const formattedDate = now.toLocaleDateString('zh-TW', dateOptions); // 2026/03/29
    const formattedTime = now.toLocaleTimeString('zh-TW', timeOptions); // 14:05:30

    // 檢查並插入漂亮的分隔橫幅
    await addDateDividerIfNeeded(sheet, formattedDate);

    await sheet.addRow({
      Timestamp: formattedTime,
      'User ID': cleanUsername,        // 💡 欄位顯示純文字名字
      Username: cleanUsername,         // 💡 欄位顯示純文字名字
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
let filteredRows = rows.filter(row => {
  const isData = row.get('Timestamp') !== '---';
  // 💡 將原本比對 User ID 的邏輯改為比對 Username
  const rowUsername = String(row.get('Username')); 
  return isData && rowUsername === String(options.username || expense.username); 
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
