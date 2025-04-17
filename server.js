const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure CORS for all domains
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state variables
const players = {};
const food = [];
const worldSize = 2000;
const FOOD_COUNT = 300;
const FOOD_SIZE = 15;

// Rate limiting
const MAX_CONNECTIONS_PER_MINUTE = 100;
const MAX_ACTIONS_PER_SECOND = 20;
const connectionCount = {};
const actionCount = {};

// Create initial food
for (let i = 0; i < FOOD_COUNT; i++) {
    generateFood();
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New player connected:', socket.id);
    
    // Log connection source for debugging
    const origin = socket.handshake.headers.origin || 'Unknown Origin';
    console.log(`Connection from: ${origin} - Socket ID: ${socket.id}`);
    
    // Rate limiting for connections
    const ip = socket.handshake.address;
    const now = Date.now();
    
    if (!connectionCount[ip]) {
        connectionCount[ip] = [];
    }
    
    // Clean old connection timestamps
    connectionCount[ip] = connectionCount[ip].filter(time => now - time < 60000);
    
    // Add current connection
    connectionCount[ip].push(now);
    
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
            score: 0
        };
        
        // Notify all clients about new player
        socket.broadcast.emit('newPlayer', players[socket.id]);
        
        // Send all existing players and food to new player
        socket.emit('gameState', {
            players,
            food
        });
    });
    
    // Player movement
    socket.on('playerUpdate', (data) => {
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
            console.log(`Action rate limit exceeded for socket ${socket.id}`);
            return;
        }
        
        // Update player data if valid
        if (players[socket.id] && isValidMovement(players[socket.id], data)) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].size = data.size;
            players[socket.id].segments = data.segments || [];
            
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
    
    // Player eats food
    socket.on('eatFood', (foodId) => {
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
                const newFood = generateFood();
                
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
            const newFood = [];
            
            for (let i = 0; i < foodCount; i++) {
                const food = generateFoodAt(player.x, player.y, 50);
                newFood.push(food);
            }
            
            // Broadcast food update
            if (newFood.length > 0) {
                io.emit('foodUpdate', {
                    removed: [],
                    added: newFood
                });
            }
            
            // Remove player and notify all clients
            delete players[socket.id];
            io.emit('playerDisconnect', socket.id);
        }
        
        // Clean up action counter
        delete actionCount[socket.id];
    });
});

// Generate random food
function generateFood() {
    const id = 'food-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const x = (Math.random() * 2 - 1) * worldSize / 2;
    const y = (Math.random() * 2 - 1) * worldSize / 2;
    
    const newFood = {
        id,
        x,
        y,
        size: FOOD_SIZE,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
    };
    
    food.push(newFood);
    return newFood;
}

// Generate food at specific location with some spread
function generateFoodAt(x, y, spread) {
    const id = 'food-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const foodX = x + (Math.random() * 2 - 1) * spread;
    const foodY = y + (Math.random() * 2 - 1) * spread;
    
    const newFood = {
        id,
        x: foodX,
        y: foodY,
        size: FOOD_SIZE,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
    };
    
    food.push(newFood);
    return newFood;
}

// Validate player movement
function isValidMovement(player, newData) {
    // Basic checks for data integrity
    if (!newData || typeof newData.x !== 'number' || typeof newData.y !== 'number') {
        return false;
    }
    
    // Check if position is within world bounds
    if (Math.abs(newData.x) > worldSize/2 || Math.abs(newData.y) > worldSize/2) {
        return false;
    }
    
    // Check if player is trying to move too fast
    if (player.x !== undefined && player.y !== undefined) {
        const distance = Math.sqrt(
            Math.pow(newData.x - player.x, 2) +
            Math.pow(newData.y - player.y, 2)
        );
        
        // Maximum allowed distance per update (can be adjusted)
        const maxDistance = 30;
        
        if (distance > maxDistance) {
            console.log(`Player ${player.id} moving too fast: ${distance} units`);
            return false;
        }
    }
    
    // Check if player size is reasonable
    if (newData.size > player.size + 5) {
        console.log(`Player ${player.id} trying to increase size too quickly`);
        return false;
    }
    
    return true;
}

// Handle custom routes
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        players: Object.keys(players).length,
        food: food.length,
        uptime: process.uptime()
    });
});

// Add a simple healthcheck endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Start server
const PORT = process.env.PORT || 48765;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 