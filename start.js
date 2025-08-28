#!/usr/bin/env node

// Simple startup script for testing deployment
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Phone Tracker Application...');
console.log('📍 Environment:', process.env.NODE_ENV || 'development');
console.log('🔧 Port:', process.env.PORT || 3000);

// Set production environment if not set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// Set JWT secret if not set
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'your-secret-key-change-in-production-' + Math.random().toString(36).substring(7);
  console.log('⚠️  Generated temporary JWT_SECRET for testing');
}

// Start the server
const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  cwd: __dirname
});

server.on('close', (code) => {
  console.log(`\n📱 Phone Tracker stopped with exit code ${code}`);
});

server.on('error', (err) => {
  console.error('❌ Failed to start server:', err);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Phone Tracker...');
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Phone Tracker...');
  server.kill('SIGTERM');
});