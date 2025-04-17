const functions = require('firebase-functions');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cors = require('cors');

// Create Express app
const app = express();
app.use(cors({
  origin: "*", // In production, restrict to your Netlify domain
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIO(server, {
  cors: {
    origin: "*", // In production, restrict to your Netlify domain
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["content-type"]
  }
});

// Connection rate limiting for DoS protection
const connectionLimiter = {
  connections: {},
  maxConnections: 20,
  timeWindow: 60000, // 1 minute
  
  checkLimit: function(ip) {
    const now = Date.now();
    if (!this.connections[ip]) {
      this.connections[ip] = [];
    }
    
    // Clean up old connections
    this.connections[ip] = this.connections[ip].filter(time => now - time < this.timeWindow);
    
    if (this.connections[ip].length >= this.maxConnections) {
      console.log(`Rate limit exceeded for IP: ${ip}`);
      return false;
    }
    
    this.connections[ip].push(now);
    return true;
  }
};

// Action rate limiting for player actions
const actionRateLimits = {
  players: {},
  limits: {
    movement: { count: 0, lastReset: Date.now(), max: 300, window: 1000 },
    foodEat: { count: 0, lastReset: Date.now(), max: 30, window: 1000 },
    kill: { count: 0, lastReset: Date.now(), max: 15, window: 1000 }
  },
  
  resetCounters: function(playerId, actionType) {
    if (!this.players[playerId]) {
      this.players[playerId] = JSON.parse(JSON.stringify(this.limits));
    }
    
    const now = Date.now();
    const limitData = this.players[playerId][actionType];
    
    if (now - limitData.lastReset > limitData.window) {
      limitData.count = 0;
      limitData.lastReset = now;
    }
  },
  
  checkLimit: function(playerId, actionType) {
    if (!this.players[playerId]) {
      this.players[playerId] = JSON.parse(JSON.stringify(this.limits));
    }
    
    this.resetCounters(playerId, actionType);
    
    const limitData = this.players[playerId][actionType];
    if (limitData.count >= limitData.max) {
      console.log(`Rate limit exceeded for player ${playerId}, action: ${actionType}`);
      return false;
    }
    
    limitData.count++;
    return true;
  },
  
  removePlayer: function(playerId) {
    delete this.players[playerId];
  }
};

// Game state
const players = {};
const foods = {};
const WORLD_SIZE = 10000;
const FOOD_COUNT = 1000;
const FOOD_SIZE = 5;
const BASE_PLAYER_SIZE = 10;
const MAX_VELOCITY = 20;
const MAX_SIZE_INCREASE_RATE = 50;

// Helper functions
function calculateDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function isWithinBounds(x, y) {
  const buffer = 50;
  return Math.abs(x) <= (WORLD_SIZE/2 - buffer) && Math.abs(y) <= (WORLD_SIZE/2 - buffer);
}

function validateMovement(player, newX, newY) {
  const distance = calculateDistance(player.x, player.y, newX, newY);
  const timeSinceLastUpdate = player.lastUpdate ? (Date.now() - player.lastUpdate) / 1000 : 1;
  
  let speedMultiplier = 1.0;
  if (timeSinceLastUpdate > 0.1) {
    speedMultiplier = Math.min(3.0, timeSinceLastUpdate * 5);
  }
  
  const maxAllowedDistance = MAX_VELOCITY * timeSinceLastUpdate * speedMultiplier;
  
  if (distance > maxAllowedDistance * 10.0) {
    console.log(`Extreme speed detected for player ${player.id}: ${distance.toFixed(2)} units in ${timeSinceLastUpdate.toFixed(3)}s`);
    return false;
  }
  
  if (!isWithinBounds(newX, newY)) {
    return false;
  }
  
  return true;
}

// Generate initial food
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  
  if (!connectionLimiter.checkLimit(clientIP)) {
    socket.disconnect(true);
    return;
  }
  
  console.log('New player connected:', socket.id);
  
  // Send existing game state
  socket.emit('currentPlayers', players);
  socket.emit('foodUpdate', Object.values(foods));
  
  // Create new player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 1000 - 500,
    y: Math.random() * 1000 - 500,
    size: BASE_PLAYER_SIZE,
    color: '#' + Math.floor(Math.random()*16777215).toString(16),
    lastUpdate: Date.now(),
    lastSize: BASE_PLAYER_SIZE,
    lastSizeUpdate: Date.now()
  };
  
  socket.broadcast.emit('newPlayer', players[socket.id]);
  
  // Handle player movement
  socket.on('playerMovement', (movementData) => {
    if (!actionRateLimits.checkLimit(socket.id, 'movement')) {
      socket.emit('forcePosition', {
        x: players[socket.id].x,
        y: players[socket.id].y
      });
      return;
    }
    
    const player = players[socket.id];
    if (!player) return;
    
    if (!validateMovement(player, movementData.x, movementData.y)) {
      socket.emit('forcePosition', {
        x: player.x,
        y: player.y
      });
      return;
    }
    
    player.x = movementData.x;
    player.y = movementData.y;
    player.lastUpdate = Date.now();
    
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      size: player.size
    });
    
    // Food collision handling
    Object.values(foods).forEach(food => {
      const distance = calculateDistance(player.x, player.y, food.x, food.y);
      
      if (distance < player.size) {
        if (!actionRateLimits.checkLimit(socket.id, 'foodEat')) {
          return;
        }
        
        delete foods[food.id];
        
        player.size += 1;
        
        const timeSinceLastSizeUpdate = (Date.now() - player.lastSizeUpdate) / 1000;
        const sizeIncreaseRate = (player.size - player.lastSize) / timeSinceLastSizeUpdate;
        
        if (sizeIncreaseRate > MAX_SIZE_INCREASE_RATE) {
          player.size = player.lastSize;
          return;
        }
        
        player.lastSize = player.size;
        player.lastSizeUpdate = Date.now();
        
        io.emit('updatePlayerSize', {
          id: socket.id,
          size: player.size
        });
        
        io.emit('foodEaten', food.id);
        
        const foodId = 'food-' + Math.random().toString(36).substr(2, 9);
        foods[foodId] = {
          id: foodId,
          x: Math.random() * WORLD_SIZE - WORLD_SIZE/2,
          y: Math.random() * WORLD_SIZE - WORLD_SIZE/2,
          size: FOOD_SIZE,
          color: '#' + Math.floor(Math.random()*16777215).toString(16)
        };
        
        io.emit('newFood', foods[foodId]);
      }
    });
    
    // Player collision handling
    Object.values(players).forEach(otherPlayer => {
      if (otherPlayer.id !== socket.id) {
        const distance = calculateDistance(player.x, player.y, otherPlayer.x, otherPlayer.y);
        
        if (distance < Math.max(player.size, otherPlayer.size)) {
          if (player.size > otherPlayer.size * 1.2) {
            if (!actionRateLimits.checkLimit(socket.id, 'kill')) {
              return;
            }
            
            const sizeBonus = otherPlayer.size * 0.5;
            player.size += sizeBonus;
            
            io.emit('updatePlayerSize', {
              id: socket.id,
              size: player.size
            });
            
            io.emit('playerEaten', otherPlayer.id);
            
            const foodCount = Math.floor(otherPlayer.size);
            const foodDrops = [];
            
            for (let i = 0; i < foodCount; i++) {
              const angle = Math.random() * Math.PI * 2;
              const distance = Math.random() * otherPlayer.size * 2;
              
              const foodId = 'food-' + Math.random().toString(36).substr(2, 9);
              const food = {
                id: foodId,
                x: otherPlayer.x + Math.cos(angle) * distance,
                y: otherPlayer.y + Math.sin(angle) * distance,
                size: FOOD_SIZE,
                color: otherPlayer.color
              };
              
              foods[foodId] = food;
              foodDrops.push(food);
            }
            
            if (foodDrops.length > 0) {
              io.emit('newFoods', foodDrops);
            }
            
            delete players[otherPlayer.id];
            
            const targetSocket = io.sockets.sockets.get(otherPlayer.id);
            if (targetSocket) {
              targetSocket.disconnect();
            }
          }
        }
      }
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    actionRateLimits.removePlayer(socket.id);
    
    if (players[socket.id]) {
      // Drop food from disconnected player
      const player = players[socket.id];
      const foodCount = Math.floor(player.size);
      const foodDrops = [];
      
      for (let i = 0; i < foodCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * player.size * 2;
        
        const foodId = 'food-' + Math.random().toString(36).substr(2, 9);
        const food = {
          id: foodId,
          x: player.x + Math.cos(angle) * distance,
          y: player.y + Math.sin(angle) * distance,
          size: FOOD_SIZE,
          color: player.color
        };
        
        foods[foodId] = food;
        foodDrops.push(food);
      }
      
      if (foodDrops.length > 0) {
        io.emit('newFoods', foodDrops);
      }
      
      delete players[socket.id];
      io.emit('playerDisconnect', socket.id);
    }
  });
});

// Expose Express API as a Cloud Function
exports.app = functions.https.onRequest(app);

// Create a separate function for Socket.IO
exports.io = functions.https.onRequest((req, res) => {
  // Socket.IO will handle the request
  return server;
});

// For local testing
if (process.env.NODE_ENV === 'development') {
  const PORT = process.env.PORT || 48765;
  server.listen(PORT, () => {
    console.log(`Server running in development mode on port ${PORT}`);
  });
} 