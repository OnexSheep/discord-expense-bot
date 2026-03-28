const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const fs = require('fs');
const logger = require('../utils/logger');

// Initialize auth
const getJwtClient = () => {
  try {
    // ✅ 直接解析環境變數中的 JSON 字串，不要用 fs.readFileSync
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    
    return new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch (error) {
    logger.error('Error loading Google credentials:', error);
    throw new Error('Failed to load Google credentials');
  }
};

/**
 * Add an expense to the Google Sheet
 * @param {Object} expense - The expense object to add
 */
async function addExpenseToSheet(expense) {
  try {
    // Check if Google Sheets ID is set
    if (!process.env.GOOGLE_SHEETS_ID) {
      throw new Error('Google Sheets ID is not configured. Use /setup first.');
    }
    
    const jwtClient = getJwtClient();
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID, jwtClient);
    
    // Load document and sheet
    await doc.loadInfo();
    
    // Get or create expenses sheet
    let sheet = doc.sheetsByTitle['Expenses'];
    if (!sheet) {
      // Create and format the sheet if it doesn't exist
      sheet = await doc.addSheet({
        title: 'Expenses',
        headerValues: [
          'Timestamp', 'User ID', 'Username', 'Amount', 'Currency', 
          'Description', 'Category', 'Date'
        ]
      });
      
      // Format the header
      await sheet.updateProperties({
        gridProperties: {
          frozenRowCount: 1
        }
      });
    }
    
    // Format the date for better readability
    const date = new Date(expense.timestamp);
    const formattedDate = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    // Add the expense row
    await sheet.addRow({
      'Timestamp': expense.timestamp,
      'User ID': expense.userId,
      'Username': expense.username,
      'Amount': expense.amount,
      'Currency': expense.currency,
      'Description': expense.description,
      'Category': expense.category || 'Uncategorized',
      'Date': formattedDate
    });
    
    logger.info(`Added expense to sheet: ${expense.amount} ${expense.currency} for ${expense.description}`);
    return true;
  } catch (error) {
    logger.error('Error adding expense to sheet:', error);
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
    // Get credentials
    const credentials = JSON.parse(
      fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')
    );
    
    // Create a new JWT client
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets', 
        'https://www.googleapis.com/auth/drive'
      ],
    });
    
    // Create a new Sheets client
    const sheets = google.sheets({ version: 'v4', auth: jwtClient });
    
    // Create a new Drive client (for permissions)
    const drive = google.drive({ version: 'v3', auth: jwtClient });
    
    // Create a new spreadsheet
    const response = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: sheetName
        },
        sheets: [
          {
            properties: {
              title: 'Expenses',
              gridProperties: {
                frozenRowCount: 1
              }
            }
          },
          {
            properties: {
              title: 'Summary',
              gridProperties: {
                frozenRowCount: 1
              }
            }
          }
        ]
      }
    });
    
    const spreadsheetId = response.data.spreadsheetId;
    const spreadsheetUrl = response.data.spreadsheetUrl;
    
    // Get sheet IDs from the response
    const expensesSheetId = response.data.sheets[0].properties.sheetId;
    
    // Add headers to the Expenses sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Expenses!A1:H1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [['Timestamp', 'User ID', 'Username', 'Amount', 'Currency', 'Description', 'Category', 'Date']]
      }
    });
    
    // Format the headers with the correct sheet ID
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: expensesSheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.2,
                    green: 0.2,
                    blue: 0.2
                  },
                  textFormat: {
                    bold: true,
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    }
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          }
        ]
      }
    });
    
    // Make the sheet accessible to users if requested
    if (makePublic) {
      try {
        await drive.permissions.create({
          fileId: spreadsheetId,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          }
        });
        logger.info(`Made sheet ${spreadsheetId} publicly accessible (view-only)`);
      } catch (permError) {
        logger.error(`Failed to make sheet public: ${permError}`);
        // Continue anyway - the sheet is created but not public
      }
    }
    
    logger.info(`Created new Google Sheet: ${sheetName} (${spreadsheetId})`);
    
    return {
      spreadsheetId,
      spreadsheetUrl,
      isPublic: makePublic
    };
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
