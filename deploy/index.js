const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');

admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Game state
let players = {};
let foods = {};
let lastUpdateTime = Date.now();

// Rate limiting
const MAX_CONNECTIONS_PER_SECOND = 10;
const MAX_ACTIONS_PER_SECOND = 20;
let connectionCounter = 0;
let lastConnectionReset = Date.now();

// Reset connection counter every second
setInterval(() => {
  connectionCounter = 0;
  lastConnectionReset = Date.now();
}, 1000);

// Player action rate limiting
const playerActionCounts = {};
setInterval(() => {
  for (const id in playerActionCounts) {
    playerActionCounts[id] = 0;
  }
}, 1000);

// Generate food
function generateFood(amount = 1) {
  for (let i = 0; i < amount; i++) {
    const foodId = Math.random().toString(36).substring(2, 15);
    foods[foodId] = {
      x: Math.floor(Math.random() * 4000) - 2000,
      y: Math.floor(Math.random() * 4000) - 2000,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      value: Math.floor(Math.random() * 3) + 1
    };
  }
}

// Generate initial food
generateFood(100);

// Check for collision between two circles
function checkCollision(x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < r1 + r2;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Connection rate limiting
  connectionCounter++;
  if (connectionCounter > MAX_CONNECTIONS_PER_SECOND) {
    socket.emit('error', { message: 'Too many connection attempts. Try again later.' });
    socket.disconnect(true);
    return;
  }

  playerActionCounts[socket.id] = 0;

  socket.on('join', (data) => {
    if (!data || !data.name) {
      socket.emit('error', { message: 'Invalid player data' });
      return;
    }

    const playerId = socket.id;
    const startX = Math.floor(Math.random() * 4000) - 2000;
    const startY = Math.floor(Math.random() * 4000) - 2000;
    const color = data.color || '#' + Math.floor(Math.random() * 16777215).toString(16);

    players[playerId] = {
      id: playerId,
      x: startX,
      y: startY,
      size: 20,
      score: 0,
      name: data.name,
      color: color,
      segments: [{ x: startX, y: startY }]
    };

    // Send initial game state to the new player
    socket.emit('gameState', { players, foods });
    
    // Broadcast new player to all others
    socket.broadcast.emit('newPlayer', players[playerId]);
  });

  socket.on('move', (data) => {
    const playerId = socket.id;
    
    // Action rate limiting
    playerActionCounts[playerId] = (playerActionCounts[playerId] || 0) + 1;
    if (playerActionCounts[playerId] > MAX_ACTIONS_PER_SECOND) {
      return;
    }

    if (players[playerId] && data && typeof data.x === 'number' && typeof data.y === 'number') {
      // Validate movement (prevent large jumps)
      const dx = data.x - players[playerId].x;
      const dy = data.y - players[playerId].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // If movement is too large, ignore it
      if (distance > 50) {
        return;
      }

      players[playerId].x = data.x;
      players[playerId].y = data.y;

      // Update segments
      const segments = players[playerId].segments;
      segments.unshift({ x: data.x, y: data.y });
      
      // Limit segments based on player size
      const maxSegments = Math.floor(players[playerId].size / 2);
      if (segments.length > maxSegments) {
        segments.length = maxSegments;
      }
      
      // Check for food collisions
      for (const foodId in foods) {
        const food = foods[foodId];
        if (checkCollision(players[playerId].x, players[playerId].y, players[playerId].size / 2, food.x, food.y, 5)) {
          // Player eats food
          players[playerId].size += food.value;
          players[playerId].score += food.value * 10;
          
          // Remove eaten food
          delete foods[foodId];
          
          // Generate new food
          generateFood(1);
          
          // Broadcast food eaten event
          io.emit('foodEaten', { foodId, playerId });
        }
      }
      
      // Check for player collisions
      for (const otherPlayerId in players) {
        if (otherPlayerId !== playerId) {
          const other = players[otherPlayerId];
          if (checkCollision(players[playerId].x, players[playerId].y, players[playerId].size / 2, other.x, other.y, other.size / 2)) {
            // Handle collision based on size
            if (players[playerId].size > other.size * 1.1) {
              // Current player eats the other player
              players[playerId].size += other.size / 3;
              players[playerId].score += other.score / 2;
              
              // Generate food from defeated player
              for (let i = 0; i < Math.floor(other.size / 5); i++) {
                const foodId = Math.random().toString(36).substring(2, 15);
                foods[foodId] = {
                  x: other.x + Math.random() * 100 - 50,
                  y: other.y + Math.random() * 100 - 50,
                  color: other.color,
                  value: 1
                };
              }
              
              // Broadcast player eliminated event
              io.emit('playerEliminated', { eliminatedId: otherPlayerId, eliminatorId: playerId });
              
              // Disconnect the eliminated player
              if (io.sockets.sockets.get(otherPlayerId)) {
                io.sockets.sockets.get(otherPlayerId).disconnect(true);
              }
              
              // Remove the player from the game
              delete players[otherPlayerId];
              delete playerActionCounts[otherPlayerId];
            }
          }
        }
      }
    }
  });

  socket.on('disconnect', () => {
    const playerId = socket.id;
    
    if (players[playerId]) {
      // Generate food from disconnected player
      for (let i = 0; i < Math.floor(players[playerId].size / 5); i++) {
        const foodId = Math.random().toString(36).substring(2, 15);
        foods[foodId] = {
          x: players[playerId].x + Math.random() * 100 - 50,
          y: players[playerId].y + Math.random() * 100 - 50,
          color: players[playerId].color,
          value: 1
        };
      }
      
      // Remove the player
      delete players[playerId];
      delete playerActionCounts[playerId];
      
      // Broadcast player left event
      io.emit('playerLeft', { playerId });
    }
  });
});

// Game loop - Send updates to all clients
const UPDATE_INTERVAL = 50; // 20 updates per second
setInterval(() => {
  const now = Date.now();
  const deltaTime = now - lastUpdateTime;
  lastUpdateTime = now;
  
  // Send game state to all clients
  io.emit('update', { players, foods, timestamp: now });
}, UPDATE_INTERVAL);

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send({ status: 'ok' });
});

// Export the API as a Firebase Function
exports.gameServer = functions.runWith({
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onRequest(app);

// Export the Socket.IO server
exports.io = io; 