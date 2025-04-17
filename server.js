const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// More permissive CORS for production
const io = socketIO(server, {
  cors: {
    origin: "*", // In production, restrict this to your Netlify domain
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["content-type"]
  }
});

// Enable CORS for all routes
app.use(cors({
  origin: "*", // In production, restrict this to your Netlify domain
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Connection rate limiting - fine-tuned for production
const connectionLimiter = {
  connections: {},
  maxConnections: 20,  // Increased for production
  timeWindow: 60000,   // Per minute instead of 10 seconds
  
  // Check if IP has too many recent connections
  checkLimit: function(ip) {
    const now = Date.now();
    
    // Initialize connection tracking for IP
    if (!this.connections[ip]) {
      this.connections[ip] = [];
    }
    
    // Clean up old connections
    this.connections[ip] = this.connections[ip].filter(time => now - time < this.timeWindow);
    
    // Check if too many connections
    if (this.connections[ip].length >= this.maxConnections) {
      console.log(`Rate limit exceeded for IP: ${ip}`);
      return false;
    }
    
    // Add new connection time
    this.connections[ip].push(now);
    return true;
  },
  
  // Clean up stale IPs every 10 minutes
  startCleanupInterval: function() {
    setInterval(() => {
      const now = Date.now();
      Object.keys(this.connections).forEach(ip => {
        this.connections[ip] = this.connections[ip].filter(time => now - time < this.timeWindow);
        if (this.connections[ip].length === 0) {
          delete this.connections[ip];
        }
      });
      console.log(`Cleaned up connection tracking. Active IPs: ${Object.keys(this.connections).length}`);
    }, 600000); // 10 minutes
  }
};

// Player action rate limiting - more tolerant for production
const actionRateLimits = {
  players: {},
  limits: {
    movement: { count: 0, lastReset: Date.now(), max: 300, window: 1000 }, // More lenient (300/sec)
    foodEat: { count: 0, lastReset: Date.now(), max: 30, window: 1000 },  // More lenient (30/sec)
    kill: { count: 0, lastReset: Date.now(), max: 15, window: 1000 }      // More lenient (15/sec)
  },
  
  // Reset counters if time window has passed
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
  
  // Check if action is within rate limits
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
  
  // Remove player when they disconnect
  removePlayer: function(playerId) {
    delete this.players[playerId];
  }
};

// Start the cleanup interval
connectionLimiter.startCleanupInterval();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Basic route for testing
app.get('/test', (req, res) => {
  res.send('Server is working!');
});

// Default route to serve index.html
app.get('/', (req, res) => {
  console.log('Root route accessed');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state
const players = {};
const foods = {};
const WORLD_SIZE = 10000;
const FOOD_COUNT = 1000;
const FOOD_SIZE = 5;
const BASE_PLAYER_SIZE = 10;
const MAX_VELOCITY = 100; // Increased from 5 to 20 - much faster allowed movement
const MAX_SIZE_INCREASE_RATE = 50; // Maximum allowed size increase per second

// Generate random foods
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

// Helper function to calculate distance between two points
function calculateDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Helper to validate position is within world bounds
function isWithinBounds(x, y) {
  const buffer = 50; // Small buffer inside the boundary
  return Math.abs(x) <= (WORLD_SIZE/2 - buffer) && Math.abs(y) <= (WORLD_SIZE/2 - buffer);
}

// Validate player movement
function validateMovement(player, newX, newY) {
  // Check if movement speed is reasonable
  const distance = calculateDistance(player.x, player.y, newX, newY);
  const timeSinceLastUpdate = player.lastUpdate ? (Date.now() - player.lastUpdate) / 1000 : 1;
  
  // Account for frame drops and network latency by increasing tolerance when time gap is larger
  let speedMultiplier = 1.0;
  if (timeSinceLastUpdate > 0.1) { // If more than 100ms since last update
    // Increase allowed speed to account for gaps in updates
    speedMultiplier = Math.min(3.0, timeSinceLastUpdate * 5); 
  }
  
  const maxAllowedDistance = MAX_VELOCITY * timeSinceLastUpdate * speedMultiplier;
  
  // Only detect very excessive speed (10x the allowed maximum)
  if (distance > maxAllowedDistance * 10.0) {
    console.log(`Extreme speed detected for player ${player.id}: ${distance.toFixed(2)} units in ${timeSinceLastUpdate.toFixed(3)}s (max allowed: ${maxAllowedDistance.toFixed(2)})`);
    return false;
  }
  
  // Check if player is within world bounds
  if (!isWithinBounds(newX, newY)) {
    console.log(`Out of bounds movement detected for player ${player.id}: (${newX.toFixed(2)}, ${newY.toFixed(2)})`);
    return false;
  }
  
  return true;
}

// Connection handler
io.on('connection', (socket) => {
  // Get client IP address
  const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  
  // Apply connection rate limiting
  if (!connectionLimiter.checkLimit(clientIP)) {
    console.log(`Blocking connection from rate-limited IP: ${clientIP}`);
    socket.disconnect(true);
    return;
  }

  console.log('New player connected:', socket.id);

  // Send existing players and foods
  socket.emit('currentPlayers', players);
  socket.emit('foodUpdate', Object.values(foods));

  // Create a new player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 1000 - 500, // Spawn in center area
    y: Math.random() * 1000 - 500,
    size: BASE_PLAYER_SIZE,
    color: '#' + Math.floor(Math.random()*16777215).toString(16),
    lastUpdate: Date.now(),
    lastSize: BASE_PLAYER_SIZE,
    lastSizeUpdate: Date.now()
  };

  // Broadcast new player to all other players
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Handle player movement
  socket.on('playerMovement', (movementData) => {
    // Apply action rate limiting
    if (!actionRateLimits.checkLimit(socket.id, 'movement')) {
      // Force position if rate limited
      socket.emit('forcePosition', {
        x: players[socket.id].x,
        y: players[socket.id].y
      });
      return;
    }

    const player = players[socket.id];
    if (!player) return;

    // Validate movement
    if (!validateMovement(player, movementData.x, movementData.y)) {
      // Send corrected position to client
      socket.emit('forcePosition', {
        x: player.x,
        y: player.y
      });
      return;
    }

    // Update player position and timestamp
    player.x = movementData.x;
    player.y = movementData.y;
    player.lastUpdate = Date.now();

    // Broadcast movement to other players
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      size: player.size
    });

    // Check for food collisions
    Object.values(foods).forEach(food => {
      const distance = calculateDistance(player.x, player.y, food.x, food.y);
      
      // Player can eat food if distance is less than player size
      if (distance < player.size) {
        // Apply action rate limiting for eating
        if (!actionRateLimits.checkLimit(socket.id, 'foodEat')) {
          return;
        }
        
        // Player eats food
        delete foods[food.id];
        
        // Increase player size
        const oldSize = player.size;
        player.size += 1;
        
        // Detect unreasonable size increases
        const timeSinceLastSizeUpdate = (Date.now() - player.lastSizeUpdate) / 1000;
        const sizeIncreaseRate = (player.size - player.lastSize) / timeSinceLastSizeUpdate;
        
        if (sizeIncreaseRate > MAX_SIZE_INCREASE_RATE) {
          console.log(`Possible size hack detected for player ${player.id}`);
          player.size = player.lastSize; // Revert size
          return;
        }
        
        player.lastSize = player.size;
        player.lastSizeUpdate = Date.now();
        
        // Broadcast player's new size
        io.emit('updatePlayerSize', {
          id: socket.id,
          size: player.size
        });
        
        // Broadcast food was eaten
        io.emit('foodEaten', food.id);
        
        // Generate new food
        const foodId = 'food-' + Math.random().toString(36).substr(2, 9);
        foods[foodId] = {
          id: foodId,
          x: Math.random() * WORLD_SIZE - WORLD_SIZE/2,
          y: Math.random() * WORLD_SIZE - WORLD_SIZE/2,
          size: FOOD_SIZE,
          color: '#' + Math.floor(Math.random()*16777215).toString(16)
        };
        
        // Broadcast new food
        io.emit('newFood', foods[foodId]);
      }
    });

    // Check for player collisions
    Object.values(players).forEach(otherPlayer => {
      if (otherPlayer.id !== socket.id) {
        const distance = calculateDistance(player.x, player.y, otherPlayer.x, otherPlayer.y);
        
        // Collision only if larger player's center touches smaller player
        if (distance < Math.max(player.size, otherPlayer.size)) {
          // Only larger player can eat smaller player, with a 20% size buffer
          if (player.size > otherPlayer.size * 1.2) {
            // Apply action rate limiting for kills
            if (!actionRateLimits.checkLimit(socket.id, 'kill')) {
              return;
            }
            
            // Calculate how much size to add (50% of the eaten player's size)
            const sizeBonus = otherPlayer.size * 0.5;
            player.size += sizeBonus;
            
            // Broadcast updated size
            io.emit('updatePlayerSize', {
              id: socket.id,
              size: player.size
            });
            
            // Broadcast player elimination
            io.emit('playerEaten', otherPlayer.id);
            
            // Drop food from eliminated player
            const foodCount = Math.floor(otherPlayer.size / 2);
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
                color: otherPlayer.color // Same color as eliminated player
              };
              
              foods[foodId] = food;
              foodDrops.push(food);
            }
            
            if (foodDrops.length > 0) {
              io.emit('newFoods', foodDrops);
            }
            
            // Remove eaten player
            delete players[otherPlayer.id];
            
            // Disconnect the eaten player
            io.sockets.sockets.get(otherPlayer.id)?.disconnect();
          }
        }
      }
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    // Clean up rate limiting data
    actionRateLimits.removePlayer(socket.id);
    
    // Remove player
    delete players[socket.id];
    
    // Broadcast player left
    io.emit('playerDisconnect', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 48765;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 