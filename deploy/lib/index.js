"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketServer = exports.gameServer = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const http_1 = require("http");
admin.initializeApp();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true }));
// Create HTTP server
const server = (0, http_1.createServer)(app);
// Initialize Socket.IO
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
// Connection rate limiting
const MAX_CONNECTIONS_PER_SECOND = 10;
const connectionCounts = {};
// Player action rate limiting
const MAX_ACTIONS_PER_SECOND = 20;
const actionCounts = {};
// Game state
let players = {};
let food = [];
const WORLD_SIZE = 5000;
const FOOD_COUNT = 500;
// Generate initial food
for (let i = 0; i < FOOD_COUNT; i++) {
    generateFood();
}
// Generate a single food item
function generateFood() {
    const id = Math.random().toString(36).substring(2, 15);
    const x = Math.random() * WORLD_SIZE;
    const y = Math.random() * WORLD_SIZE;
    const value = Math.floor(Math.random() * 5) + 1;
    food.push({ id, x, y, value });
}
// Socket.IO connection handling
io.on('connection', (socket) => {
    // Rate limit connections
    const ip = socket.handshake.address;
    if (!connectionCounts[ip]) {
        connectionCounts[ip] = 0;
    }
    connectionCounts[ip]++;
    if (connectionCounts[ip] > MAX_CONNECTIONS_PER_SECOND) {
        socket.disconnect();
        return;
    }
    // Reset connection count after 1 second
    setTimeout(() => {
        connectionCounts[ip] = 0;
    }, 1000);
    // Create new player
    socket.on('join', (data) => {
        const playerId = socket.id;
        const x = Math.random() * WORLD_SIZE;
        const y = Math.random() * WORLD_SIZE;
        players[playerId] = {
            id: playerId,
            x,
            y,
            size: 10,
            color: data.color || getRandomColor(),
            name: data.name || 'Anonymous',
            score: 0
        };
        // Send initial state to new player
        socket.emit('initialize', {
            id: playerId,
            players,
            food,
            worldSize: WORLD_SIZE
        });
        // Notify other players
        socket.broadcast.emit('playerJoined', players[playerId]);
    });
    // Handle player movement
    socket.on('move', (data) => {
        const playerId = socket.id;
        // Rate limit actions
        if (!actionCounts[playerId]) {
            actionCounts[playerId] = 0;
        }
        actionCounts[playerId]++;
        if (actionCounts[playerId] > MAX_ACTIONS_PER_SECOND) {
            return;
        }
        // Reset action count after 1 second
        setTimeout(() => {
            if (actionCounts[playerId]) {
                actionCounts[playerId] = 0;
            }
        }, 1000);
        // Update player position if valid
        if (players[playerId] && typeof data.x === 'number' && typeof data.y === 'number') {
            players[playerId].x = data.x;
            players[playerId].y = data.y;
            // Check for food collision
            checkFoodCollision(playerId);
            // Check for player collision
            checkPlayerCollision(playerId);
            // Broadcast updated position
            socket.broadcast.emit('playerMoved', {
                id: playerId,
                x: data.x,
                y: data.y,
                size: players[playerId].size
            });
        }
    });
    // Check if player has collided with food
    function checkFoodCollision(playerId) {
        if (!players[playerId])
            return;
        const player = players[playerId];
        const playerRadius = player.size / 2;
        for (let i = food.length - 1; i >= 0; i--) {
            const foodItem = food[i];
            const dx = player.x - foodItem.x;
            const dy = player.y - foodItem.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < playerRadius) {
                // Player ate food
                player.size += foodItem.value * 0.5;
                player.score += foodItem.value;
                // Remove eaten food
                food.splice(i, 1);
                // Generate new food
                generateFood();
                // Broadcast food update
                io.emit('foodEaten', {
                    playerId,
                    foodId: foodItem.id,
                    newFood: food[food.length - 1],
                    playerSize: player.size,
                    playerScore: player.score
                });
            }
        }
    }
    // Check if player has collided with another player
    function checkPlayerCollision(playerId) {
        if (!players[playerId])
            return;
        const player = players[playerId];
        const playerRadius = player.size / 2;
        for (const otherPlayerId in players) {
            if (otherPlayerId !== playerId) {
                const otherPlayer = players[otherPlayerId];
                const otherPlayerRadius = otherPlayer.size / 2;
                const dx = player.x - otherPlayer.x;
                const dy = player.y - otherPlayer.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                // Players collide if the distance between them is less than their combined radii
                if (distance < playerRadius + otherPlayerRadius) {
                    // Larger player eats smaller player
                    if (player.size > otherPlayer.size * 1.1) {
                        // Calculate size increase (20% of eaten player's size)
                        const sizeIncrease = otherPlayer.size * 0.2;
                        player.size += sizeIncrease;
                        player.score += Math.floor(otherPlayer.score / 2);
                        // Create food from eliminated player
                        for (let i = 0; i < Math.floor(otherPlayer.size / 2); i++) {
                            const angle = Math.random() * Math.PI * 2;
                            const radius = Math.random() * otherPlayer.size;
                            const foodX = otherPlayer.x + Math.cos(angle) * radius;
                            const foodY = otherPlayer.y + Math.sin(angle) * radius;
                            const id = Math.random().toString(36).substring(2, 15);
                            const value = Math.floor(Math.random() * 3) + 1;
                            food.push({ id, x: foodX, y: foodY, value });
                        }
                        // Notify players about elimination and food drops
                        io.emit('playerEaten', {
                            eater: playerId,
                            eaten: otherPlayerId,
                            eaterSize: player.size,
                            eaterScore: player.score,
                            newFood: food.slice(food.length - Math.floor(otherPlayer.size / 2))
                        });
                        // Remove eaten player
                        delete players[otherPlayerId];
                        // Disconnect eaten player's socket
                        const eatenSocket = io.sockets.sockets.get(otherPlayerId);
                        if (eatenSocket) {
                            eatenSocket.disconnect();
                        }
                    }
                }
            }
        }
    }
    // Handle disconnection
    socket.on('disconnect', () => {
        const playerId = socket.id;
        if (players[playerId]) {
            // Create food from disconnected player
            for (let i = 0; i < Math.floor(players[playerId].size / 3); i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * players[playerId].size;
                const foodX = players[playerId].x + Math.cos(angle) * radius;
                const foodY = players[playerId].y + Math.sin(angle) * radius;
                const id = Math.random().toString(36).substring(2, 15);
                const value = Math.floor(Math.random() * 2) + 1;
                food.push({ id, x: foodX, y: foodY, value });
            }
            // Notify other players
            socket.broadcast.emit('playerLeft', {
                id: playerId,
                newFood: food.slice(food.length - Math.floor(players[playerId].size / 3))
            });
            // Remove player
            delete players[playerId];
            delete actionCounts[playerId];
        }
    });
});
// Helper function to generate random color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}
// Export the Express API as a Firebase Function
exports.gameServer = functions.https.onRequest(app);
// Export a separate function for the Socket.IO server
exports.socketServer = functions.runWith({
    memory: '1GB',
    timeoutSeconds: 540,
}).https.onRequest((request, response) => {
    if (!request.url) {
        server.emit('request', request, response);
    }
    else if (request.url.startsWith('/socket.io')) {
        server.emit('request', request, response);
    }
    else {
        app(request, response);
    }
});
//# sourceMappingURL=index.js.map