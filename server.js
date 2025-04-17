const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const os = require('os');

console.log("=== STARTING SERVER ===");
console.log("Node.js version:", process.version);
console.log("Current directory:", __dirname);

// Constants
const PORT = process.env.PORT || 48765;
const MAX_CONNECTIONS_PER_MINUTE = 60;
const MAX_ACTIONS_PER_SECOND = 20;
const FOOD_COUNT = 300;
const WORLD_SIZE = 8000;

// Performance config
const PERFORMANCE = {
    STATUS_INTERVAL: 30000,       // How often to log server status (ms)
    PLAYER_CLEANUP_INTERVAL: 60000, // How often to clean up inactive players (ms)
    MAX_INACTIVE_TIME: 60000,     // Maximum time a player can be inactive (ms)
    MOVEMENT_THRESHOLD: 1.0,      // Minimum distance to consider a movement
    RATE_LIMIT_CLEANUP: 300000,   // How often to clean up rate limit data (ms)
    GC_INTERVAL: 300000           // Force garbage collection if available (ms)
};

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure CORS for all domains
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

console.log("CORS configured for all origins");

// Set up Socket.IO with permissive CORS
const io = socketIo(server, {
    cors: {
        origin: ["https://slither-io.netlify.app", "https://slither-io-clone.onrender.com", "http://localhost:48765"],
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["my-custom-header"]
    },
    transports: ['websocket', 'polling']
});

console.log("Socket.IO configured with the following origins:", ["https://slither-io.netlify.app", "https://slither-io-clone.onrender.com", "http://localhost:48765"]);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
console.log("Serving static files from:", path.join(__dirname, 'public'));

// Game state variables
const players = {};
const food = [];
const worldSize = WORLD_SIZE;
const FOOD_SIZE = 15;

// Rate limiting
const connectionCount = {};
const actionCount = {};

// Add last active timestamp to each player
const playerActivity = {};

// Create initial food
for (let i = 0; i < FOOD_COUNT; i++) {
    generateFood();
}
console.log(`Generated ${FOOD_COUNT} food items`);

// Start the server
server.listen(PORT, () => {
    console.log(`
    ==============================================
    ✅ Server running on port ${PORT}
    ==============================================
    
    Local access: http://localhost:${PORT}
    Player count: ${Object.keys(players).length}
    Food count: ${food.length}
    Memory usage: ${JSON.stringify(process.memoryUsage())}
    ==============================================
    `);
});

// Regularly log server status
setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const memoryDiff = {
        rss: memoryUsage.rss - initialMemory.rss,
        heapTotal: memoryUsage.heapTotal - initialMemory.heapTotal,
        heapUsed: memoryUsage.heapUsed - initialMemory.heapUsed,
        external: memoryUsage.external - initialMemory.external
    };
    
    console.log(`
    ==============================================
    📊 SERVER STATUS
    ==============================================
    Players: ${Object.keys(players).length}
    Food: ${food.length}
    Memory: ${JSON.stringify(memoryUsage)}
    Memory diff: ${JSON.stringify(memoryDiff)}
    ==============================================
    `);
}, PERFORMANCE.STATUS_INTERVAL);

// Clean up inactive players
setInterval(() => {
    const now = Date.now();
    let removed = 0;
    
    for (const id in playerActivity) {
        if (now - playerActivity[id] > PERFORMANCE.MAX_INACTIVE_TIME && players[id]) {
            console.log(`Removing inactive player: ${id}`);
            delete players[id];
            delete playerActivity[id];
            io.emit('playerDisconnect', id);
            removed++;
        }
    }
    
    if (removed > 0) {
        console.log(`Cleaned up ${removed} inactive players`);
    }
}, PERFORMANCE.PLAYER_CLEANUP_INTERVAL);

// Clean up rate limit data
setInterval(() => {
    const now = Date.now();
    for (const ip in connectionCount) {
        connectionCount[ip] = connectionCount[ip].filter(time => now - time < 60000);
        if (connectionCount[ip].length === 0) {
            delete connectionCount[ip];
        }
    }
    
    // Remove old action counts
    for (const id in actionCount) {
        if (now - actionCount[id].lastCheck > 10000) {
            delete actionCount[id];
        }
    }
}, PERFORMANCE.RATE_LIMIT_CLEANUP);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('=== NEW PLAYER CONNECTED ===');
    console.log('ID:', socket.id);
    
    // Log connection source for debugging
    const origin = socket.handshake.headers.origin || 'Unknown Origin';
    const ip = socket.handshake.address || 'Unknown IP';
    console.log(`Connection from: ${origin} - IP: ${ip} - Socket ID: ${socket.id}`);
    console.log('Headers:', JSON.stringify(socket.handshake.headers));
    
    // Tell the client about their socket ID immediately
    socket.emit('yourId', socket.id);
    
    // Log all active players
    const activePlayers = Object.keys(players).length;
    console.log(`Active players: ${activePlayers} before this connection`);
    console.log('Active player IDs:', Object.keys(players));
    
    // Rate limiting for connections
    const now = Date.now();
    
    if (!connectionCount[ip]) {
        connectionCount[ip] = [];
    }
    
    // Clean old connection timestamps
    connectionCount[ip] = connectionCount[ip].filter(time => now - time < 60000);
    
    // Add current connection
    connectionCount[ip].push(now);
    playerActivity[socket.id] = now;
    
    // Check if too many connections from this IP
    if (connectionCount[ip].length > MAX_CONNECTIONS_PER_MINUTE) {
        console.log(`Rate limit exceeded for IP ${ip}. Disconnecting socket ${socket.id}`);
        socket.disconnect(true);
        return;
    }
    
    // Initialize action counter for this socket
    actionCount[socket.id] = {
        lastCheck: now,
        count: 0
    };
    
    // New player joins
    socket.on('newPlayer', (playerData) => {
        console.log(`New player joined: ${socket.id}`, playerData);
        playerActivity[socket.id] = Date.now();
        
        // Validate player data
        if (!playerData.name) {
            playerData.name = 'Anonymous Snake';
        }
        
        // Create new player
        players[socket.id] = {
            id: socket.id,
            x: Math.random() * (worldSize / 2) - worldSize / 4,
            y: Math.random() * (worldSize / 2) - worldSize / 4,
            size: 30,
            name: playerData.name.substring(0, 20), // Limit name length
            color: playerData.color || '#' + Math.floor(Math.random() * 16777215).toString(16),
            segments: [],
            score: 0,
            lastUpdated: Date.now()
        };
        
        // Log the created player
        console.log(`Created player:`, players[socket.id]);
        
        // Notify all clients about new player - BROADCAST to all INCLUDING sender
        io.emit('newPlayer', players[socket.id]);
        console.log(`Broadcast newPlayer to all clients for player ${socket.id}`);
        
        // Send all existing players and food to new player
        const gameState = {
            players,
            food
        };
        
        // Log the gameState being sent
        console.log(`Sending gameState to ${socket.id} with ${Object.keys(players).length} players and ${food.length} food items`);
        console.log(`Players in gameState:`, Object.keys(gameState.players));
        
        socket.emit('gameState', gameState);
    });
    
    // Player movement - don't update the server on every tiny movement
    let lastPosition = { x: 0, y: 0 };
    
    socket.on('playerUpdate', (data) => {
        playerActivity[socket.id] = Date.now();
        
        // Rate limiting for actions
        const now = Date.now();
        
        // Reset counter every second
        if (now - actionCount[socket.id].lastCheck > 1000) {
            actionCount[socket.id] = {
                lastCheck: now,
                count: 0
            };
        }
        
        // Increment and check the counter
        actionCount[socket.id].count++;
        
        if (actionCount[socket.id].count > MAX_ACTIONS_PER_SECOND) {
            // console.log(`Action rate limit exceeded for socket ${socket.id}`);
            return;
        }
        
        // Check if we have a valid player
        if (!players[socket.id]) return;
        
        // Check if the movement is significant enough to update
        const distanceMoved = Math.sqrt(
            Math.pow(data.x - lastPosition.x, 2) + 
            Math.pow(data.y - lastPosition.y, 2)
        );
        
        if (distanceMoved < PERFORMANCE.MOVEMENT_THRESHOLD && 
            lastPosition.x !== 0 && lastPosition.y !== 0) {
            return; // Skip small movements to reduce network traffic
        }
        
        // Update last position
        lastPosition.x = data.x;
        lastPosition.y = data.y;
        
        // Update player data if valid
        if (isValidMovement(players[socket.id], data)) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].size = data.size;
            
            // Only update segments if provided
            if (data.segments && data.segments.length > 0) {
                players[socket.id].segments = data.segments;
            }
            
            // Update last activity time
            players[socket.id].lastUpdated = now;
            
            // Broadcast player movement to all other players
            socket.broadcast.emit('playerMoved', players[socket.id]);
        } else if (players[socket.id]) {
            // Force client to use server position if invalid movement
            socket.emit('forcePosition', {
                x: players[socket.id].x,
                y: players[socket.id].y
            });
        }
    });
    
    // Player explicitly wants a list of all players
    socket.on('getPlayers', () => {
        playerActivity[socket.id] = Date.now();
        console.log(`Player ${socket.id} requested player list`);
        socket.emit('playerList', players);
    });
    
    // Heartbeat to keep connection alive and ensure all players are displayed
    socket.on('heartbeat', () => {
        playerActivity[socket.id] = Date.now();
        
        // Send current player count
        socket.emit('playerCount', Object.keys(players).length);
        
        // Every 10 seconds, re-sync all players to ensure client has everyone
        const now = Date.now();
        if (!socket.lastSync || now - socket.lastSync > 10000) {
            socket.lastSync = now;
            socket.emit('syncPlayers', players);
            // console.log(`Sent player sync to ${socket.id}`);
        }
    });
    
    // Player eats food
    socket.on('eatFood', (foodId) => {
        playerActivity[socket.id] = Date.now();
        const foodIndex = food.findIndex(f => f.id === foodId);
        
        if (foodIndex !== -1 && players[socket.id]) {
            const foodItem = food[foodIndex];
            const player = players[socket.id];
            
            // Validate that player is close enough to the food
            const distance = Math.sqrt(
                Math.pow(player.x - foodItem.x, 2) +
                Math.pow(player.y - foodItem.y, 2)
            );
            
            // Allow eating if player is close enough to food
            if (distance < player.size + foodItem.size) {
                // Remove eaten food
                food.splice(foodIndex, 1);
                
                // Increase player size
                const newSize = Math.min(player.size + 1, 100); // Cap maximum size
                
                // If this is a valid size increase
                if (newSize > player.size) {
                    player.size = newSize;
                    player.score += 10;
                }
                
                // Generate new food
                const newFood = generateFood(1)[0];
                
                // Broadcast food update to all players
                io.emit('foodUpdate', {
                    removed: [foodId],
                    added: [newFood]
                });
            } else {
                console.log(`Player ${socket.id} tried to eat food too far away`);
            }
        }
    });
    
    // Player collision (one player kills another)
    socket.on('killPlayer', (targetId) => {
        if (players[socket.id] && players[targetId]) {
            const killer = players[socket.id];
            const victim = players[targetId];
            
            // Validate that this is a legitimate kill
            // Head of killer must be close to any part of victim
            const distance = Math.sqrt(
                Math.pow(killer.x - victim.x, 2) +
                Math.pow(killer.y - victim.y, 2)
            );
            
            if (distance < killer.size + victim.size) {
                // Award points to killer
                killer.score += 100 + Math.floor(victim.size);
                killer.size = Math.min(killer.size + victim.size / 5, 100);
                
                // Distribute food where player died
                const foodCount = Math.max(5, Math.floor(victim.size / 5));
                const newFood = [];
                
                for (let i = 0; i < foodCount; i++) {
                    const food = generateFoodAt(victim.x, victim.y, 100);
                    newFood.push(food);
                }
                
                // Broadcast player killed event
                io.emit('playerKilled', targetId);
                
                // Remove player from game
                delete players[targetId];
                
                // Broadcast new food items from dead player
                io.emit('foodUpdate', {
                    removed: [],
                    added: newFood
                });
            } else {
                console.log(`Invalid kill attempt: ${socket.id} -> ${targetId}, distance: ${distance}`);
            }
        }
    });
    
    // Disconnect handling
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        // Remove disconnected player
        if (players[socket.id]) {
            // Distribute some food where player disconnected
            const player = players[socket.id];
            const foodCount = Math.max(3, Math.floor(player.size / 10));
            const newFood = generateFoodAt(player.x, player.y, foodCount, 50);
            
            // Broadcast food update
            if (newFood.length > 0) {
                io.emit('foodUpdate', {
                    removed: [],
                    added: newFood
                });
            }
            
            // Remove player and notify all clients
            delete players[socket.id];
            delete playerActivity[socket.id];
            io.emit('playerDisconnect', socket.id);
            
            // Log active players after disconnection
            console.log(`Active players: ${Object.keys(players).length} after disconnect`);
            console.log('Remaining player IDs:', Object.keys(players));
        }
        
        // Clean up action counter
        delete actionCount[socket.id];
    });
});

// Generate food items
function generateFood(count = FOOD_COUNT) {
    const newFood = [];
    
    for (let i = 0; i < count; i++) {
        const foodItem = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            x: Math.random() * worldSize - worldSize/2,
            y: Math.random() * worldSize - worldSize/2,
            size: 10 + Math.random() * 5,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16)
        };
        
        newFood.push(foodItem);
        food.push(foodItem);
    }
    
    return newFood;
}

// Generate food at a specific location
function generateFoodAt(x, y, count, spread = 100) {
    const newFood = [];
    
    for (let i = 0; i < count; i++) {
        const foodItem = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            x: x + (Math.random() * 2 - 1) * spread,
            y: y + (Math.random() * 2 - 1) * spread,
            size: 10 + Math.random() * 5,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16)
        };
        
        newFood.push(foodItem);
        food.push(foodItem);
    }
    
    return newFood;
}

// Validate player movement
function isValidMovement(player, newPosition) {
    if (!player) return false;
    
    // Check if position is within bounds
    if (Math.abs(newPosition.x) > worldSize/2 || Math.abs(newPosition.y) > worldSize/2) {
        return false;
    }
    
    // Check if size increase is reasonable
    if (newPosition.size > player.size + 5) {
        return false;
    }
    
    // Check if movement speed is reasonable
    const distance = Math.sqrt(
        Math.pow(player.x - newPosition.x, 2) +
        Math.pow(player.y - newPosition.y, 2)
    );
    
    // Maximum reasonable distance for movement
    const maxDistance = 20; // Adjust based on your game's movement speed
    
    if (distance > maxDistance) {
        return false;
    }
    
    return true;
}

// Handle custom routes
app.get('/status', (req, res) => {
    const status = {
        status: 'online',
        players: Object.keys(players).length,
        food: food.length,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    };
    console.log(`Status request received: ${JSON.stringify(status)}`);
    res.json(status);
});

// Add a simple healthcheck endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Default route
app.get('/', (req, res) => {
    console.log('Root route accessed');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
}); 