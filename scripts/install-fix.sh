#!/bin/bash

echo "Expense Tracker Bot - Installation & Exchange API Setup"
echo "============================================"

# Clean npm cache
echo "Cleaning npm cache..."
npm cache clean --force

# Remove node_modules and package-lock.json
echo "Removing node_modules and package-lock.json..."
rm -rf node_modules package-lock.json

# Install dependencies and the new Exchange Rate package
echo "Installing dependencies and yahoo-finance2..."
npm install yahoo-finance2 --save

# 如果遇到 Peer Deps 衝突，自動嘗試相容模式
if [ $? -ne 0 ]; then
    echo "Standard install failed, trying with legacy-peer-deps..."
    npm install yahoo-finance2 --save --legacy-peer-deps
fi

echo "Installation completed with Yahoo Finance support."
