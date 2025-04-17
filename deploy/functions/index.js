const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

// Create Express app for HTTP endpoints
const app = express();
app.use(cors({ origin: true }));

// Game state
const players = {};
const foods = {};
const WORLD_SIZE = 10000;
const FOOD_COUNT = 1000;
const FOOD_SIZE = 5;
const BASE_PLAYER_SIZE = 10;
const MAX_VELOCITY = 20;

// Helper function to calculate distance between two points
function calculateDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Check if player is within world bounds
function isWithinBounds(x, y) {
  const buffer = 50;
  return Math.abs(x) <= (WORLD_SIZE/2 - buffer) && Math.abs(y) <= (WORLD_SIZE/2 - buffer);
}

// Generate initial foods
function generateInitialFood() {
  for (let i = 0; i < FOOD_COUNT; i++) {
    const foodId = 'food-' + Math.random().toString(36).substr(2, 9);
    foods[foodId] = {
      id: foodId,
      x: Math.random() * WORLD_SIZE - WORLD_SIZE/2,
      y: Math.random() * WORLD_SIZE - WORLD_SIZE/2,
      size: FOOD_SIZE,
      color: '#' + Math.floor(Math.random()*16777215).toString(16)
    };
  }
}

// Basic routes
app.get('/', (req, res) => {
  res.send({
    status: 'ok',
    message: 'Slither.io Game Server',
    time: new Date().toISOString()
  });
});

app.get('/status', (req, res) => {
  res.send({
    status: 'ok',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// Export HTTP function
exports.api = functions.https.onRequest(app);

// Export WebSocket function
exports.game = functions.runWith({
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onRequest((req, res) => {
  // WebSocket support in Firebase requires additional configuration
  // This is a placeholder that returns info about Socket.IO connections
  if (req.url && req.url.startsWith('/socket.io')) {
    res.send({
      message: 'This is a placeholder for the Socket.IO WebSocket connection',
      info: 'For a proper WebSocket setup, you would need Firebase Realtime Database',
      documentation: 'https://firebase.google.com/docs/functions/http-events'
    });
  } else {
    res.send({
      message: 'Slither.io Game Server API',
      endpoint: req.url,
      documentation: 'Use a WebSocket client to connect to /socket.io'
    });
  }
});

// This lets us know the function was loaded
console.log('Game server functions initialized'); 