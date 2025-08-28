# Installation Guide for Phone Tracker

## Prerequisites Installation

Before running the Phone Tracker application, you need to install Node.js and npm.

### Step 1: Install Node.js

1. **Download Node.js**:
   - Go to [https://nodejs.org/](https://nodejs.org/)
   - Download the LTS (Long Term Support) version for Windows
   - Choose the Windows Installer (.msi) for your system (64-bit recommended)

2. **Install Node.js**:
   - Run the downloaded installer
   - Follow the installation wizard
   - Make sure to check "Add to PATH" option
   - Accept the license agreement
   - Complete the installation

3. **Verify Installation**:
   - Open a new Command Prompt or PowerShell window
   - Run: `node --version`
   - Run: `npm --version`
   - Both commands should return version numbers

### Step 2: Install Project Dependencies

1. **Navigate to the project folder**:
   ```bash
   cd "C:\Users\epike\OneDrive\Desktop\Tracking Website for lost gadgets"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

### Step 3: Start the Application

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Access the application**:
   - Open your web browser
   - Navigate to: `http://localhost:3000`

## Alternative: Using Development Mode

For development with automatic restart on file changes:

```bash
npm run dev
```

## Troubleshooting

### If npm is not recognized:
- Restart your computer after installing Node.js
- Make sure Node.js was added to your system PATH
- Try opening a new terminal/command prompt

### If installation fails:
- Run Command Prompt as Administrator
- Clear npm cache: `npm cache clean --force`
- Try installing again

### Port already in use:
- If port 3000 is busy, the app will try other ports
- Or set a custom port: `set PORT=3001 && npm start`

## What's Included

Once running, you'll have access to:
- **Home Page**: Overview and statistics
- **Search**: Find lost phones by phone number, IMEI, or email
- **Report Lost**: Submit details about your lost phone
- **Report Found**: Report phones you've found

## Database

The application uses SQLite database which will be automatically created as `phones.db` in the project folder when you first start the server.

## Security Note

For production use:
1. Change the JWT_SECRET in the code
2. Use HTTPS
3. Set up proper firewall rules
4. Consider using a more robust database

---

**Need Help?** Check the main README.md file for more detailed information about the application features and API endpoints.