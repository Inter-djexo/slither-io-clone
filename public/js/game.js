console.log("Game.js loaded successfully!");

// DOM Elements
const startScreen = document.getElementById('start-screen');
const deathScreen = document.getElementById('death-screen');
const gameUI = document.getElementById('game-ui');
const playerNameInput = document.getElementById('player-name');
const startButton = document.getElementById('start-button');
const skipAuthButton = document.getElementById('skip-auth-button');
const restartButton = document.getElementById('restart-button');
const lengthElement = document.getElementById('length');
const finalLengthElement = document.getElementById('final-length');
const leadersList = document.getElementById('leaders');
const musicButton = document.getElementById('music-button');
const toggleMusicButton = document.getElementById('toggle-music');
const minimapContainer = document.getElementById('minimap-container');

// Sound elements
const deathSound = document.getElementById('death-sound');
const backgroundMusic = document.getElementById('background-music');
let musicPlaying = false;

// Game variables
let socket;
let scene, camera, renderer;
let player = {
    name: '',
    size: 10,
    segments: [],
    color: '',
    score: 0
};
let otherPlayers = {};
let foodItems = [];
let gameStarted = false;
let controlsEnabled = false;
let mouse = new THREE.Vector2();
let gameObjects = {};
let cameraOffset = 300;
let worldSize = 10000;

// Minimap variables
let minimapCanvas, minimapContext;
let minimapSize = 200;
let minimapScale = minimapSize / worldSize;

// Constants
const SEGMENT_SIZE = 20;
const FOOD_SIZE = 10;
const SNAKE_SPEED = 3;
const SEGMENT_SPACING = 5;
const MAX_SEGMENTS = 100;

// Add a flag to track if we're in offline mode
let offlineMode = false;

// Add the original checkFoodCollisions function here before overriding it
// Check for collisions with food
function checkFoodCollisions() {
    if (player.segments.length === 0) return;
    
    const headX = player.segments[0].x;
    const headY = player.segments[0].y;
    
    for (let i = foodItems.length - 1; i >= 0; i--) {
        const food = foodItems[i];
        const distance = Math.sqrt(Math.pow(headX - food.x, 2) + Math.pow(headY - food.y, 2));
        
        if (distance < SEGMENT_SIZE + FOOD_SIZE) {
            // Eat food
            player.size += 1;
            updateScore();
            
            // Add new segment if needed
            if (player.segments.length < MAX_SEGMENTS) {
                addSegment();
            }
            
            // Tell server about eaten food
            if (!offlineMode) {
                socket.emit('eatFood', food.id);
            }
            
            // Remove food locally
            scene.remove(food.mesh);
            foodItems.splice(i, 1);
        }
    }
}

// Initialize the game
function init() {
    try {
        // Check if already initialized to prevent duplicate initialization
        if (window.gameInitialized) {
            console.log("Game already initialized, skipping initialization");
            return;
        }
        
        console.log("Initializing game...");
        
        // Don't try to auto-start music - will use buttons instead
        
        // Check if THREE is available
        if (typeof THREE === 'undefined') {
            console.error("THREE.js is not loaded!");
            alert("Could not load THREE.js library. Please refresh the page and try again.");
            return;
        }
        
        // Set up Three.js
        setupThreeJS();
        
        // Initialize minimap
        initMinimap();
        
        // Set up event listeners
        setupEventListeners();
        
        // Start update loop
        animate();
        
        // Hide game UI initially
        gameUI.style.display = 'none';
        
        // Mark as initialized to prevent duplicate initialization
        window.gameInitialized = true;
        
        console.log("Game initialized successfully!");
    } catch (error) {
        console.error("Error initializing game:", error);
        alert("Error initializing game: " + error.message);
    }
}

// Initialize the minimap
function initMinimap() {
    // Create canvas for minimap
    minimapCanvas = document.createElement('canvas');
    minimapCanvas.width = minimapSize;
    minimapCanvas.height = minimapSize;
    minimapContext = minimapCanvas.getContext('2d');
    
    // Style the canvas
    minimapCanvas.style.width = '100%';
    minimapCanvas.style.height = '100%';
    
    // Add to container
    minimapContainer.appendChild(minimapCanvas);
}

// Set up Three.js scene, camera, and renderer
function setupThreeJS() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x181818);
    
    // Create camera (orthographic for 2D gameplay)
    const aspectRatio = window.innerWidth / window.innerHeight;
    const viewSize = 1200; // Increased view size to see more of the game world
    camera = new THREE.OrthographicCamera(
        -viewSize * aspectRatio / 2,
        viewSize * aspectRatio / 2,
        viewSize / 2,
        -viewSize / 2,
        1,
        10000
    );
    camera.position.z = 1000;
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    // Add grid for reference
    addWorldGrid();
    
    // Handle window resize
    window.addEventListener('resize', () => {
        const aspectRatio = window.innerWidth / window.innerHeight;
        camera.left = -viewSize * aspectRatio / 2;
        camera.right = viewSize * aspectRatio / 2;
        camera.top = viewSize / 2;
        camera.bottom = -viewSize / 2;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Add a grid to visualize the game world
function addWorldGrid() {
    // Add a starry nebula background
    const nebulaGeometry = new THREE.PlaneGeometry(worldSize * 2, worldSize * 2);
    const nebulaTexture = createNebulaTexture();
    const nebulaMaterial = new THREE.MeshBasicMaterial({
        map: nebulaTexture,
        transparent: true,
        opacity: 0.4
    });
    const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
    nebula.position.z = -800;
    scene.add(nebula);
    gameObjects.nebula = nebula;
    
    // Create a more sophisticated grid with stars background
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2,
        transparent: true,
        opacity: 0.8
    });
    
    const starsVertices = [];
    for (let i = 0; i < 8000; i++) {
        const x = (Math.random() - 0.5) * worldSize * 1.5;
        const y = (Math.random() - 0.5) * worldSize * 1.5;
        const z = -700 + Math.random() * 400; // Stars behind the play area
        starsVertices.push(x, y, z);
    }
    
    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
    
    // Add subtle grid lines
    const gridHelper = new THREE.GridHelper(worldSize, 50, 0x222222, 0x111111);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);
    
    // SUPER SIMPLE APPROACH: Create a bright red line circle at the world boundary
    // Create line segments for the border - this will definitely be visible
    const borderSegments = 100;
    const borderRadius = worldSize / 2;
    const borderGeometry = new THREE.BufferGeometry();
    const borderPositions = [];
    
    // Generate points around a circle to form the border
    for (let i = 0; i <= borderSegments; i++) {
        const angle = (i / borderSegments) * Math.PI * 2;
        const x = Math.cos(angle) * borderRadius;
        const y = Math.sin(angle) * borderRadius;
        borderPositions.push(x, y, 0);
    }
    
    borderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(borderPositions, 3));
    
    // Create a very thick, bright red line
    const borderMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff0000, 
        linewidth: 10,  // Note: linewidth may not work in all browsers due to WebGL limitations
        transparent: false
    });
    
    const borderLine = new THREE.Line(borderGeometry, borderMaterial);
    scene.add(borderLine);
    
    // Also add a series of red cubes around the border for guaranteed visibility
    const cubeCount = 100;
    const cubes = [];
    
    for (let i = 0; i < cubeCount; i++) {
        const angle = (i / cubeCount) * Math.PI * 2;
        const x = Math.cos(angle) * borderRadius;
        const y = Math.sin(angle) * borderRadius;
        
        // Create a bright red cube
        const cubeGeometry = new THREE.BoxGeometry(100, 100, 100);
        const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        
        cube.position.set(x, y, 0);
        scene.add(cube);
        cubes.push(cube);
    }
    
    // Add red point lights at regular intervals around the border
    const lightCount = 16;
    const borderLights = [];
    
    for (let i = 0; i < lightCount; i++) {
        const angle = (i / lightCount) * Math.PI * 2;
        const x = Math.cos(angle) * borderRadius;
        const y = Math.sin(angle) * borderRadius;
        
        // Create a bright red light
        const light = new THREE.PointLight(0xff0000, 10, 2000);
        light.position.set(x, y, 100);
        scene.add(light);
        borderLights.push(light);
    }
    
    // Store in gameObjects for animation
    gameObjects.stars = stars;
    gameObjects.borderLine = borderLine;
    gameObjects.borderCubes = cubes;
    gameObjects.borderLights = borderLights;
    
    // Add some distant planets for visual interest
    addDecorations();
}

// Create a nebula texture programmatically
function createNebulaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Create a black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Create nebula effect with gradients
    const colors = [
        '#0a0a3f', '#1a0a4f', '#2a0a6f', 
        '#4a0a6f', '#4a0a4f', '#0a1a4f',
        '#0a2a5f', '#0a3a7f', '#0c244f'
    ];
    
    // Add random nebula clouds
    for (let i = 0; i < 15; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = 100 + Math.random() * 400;
        
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        const color = colors[Math.floor(Math.random() * colors.length)];
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'transparent');
        
        ctx.globalAlpha = 0.2 + Math.random() * 0.3;
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Add some bright spots
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = 5 + Math.random() * 15;
        
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'transparent');
        
        ctx.globalAlpha = 0.1 + Math.random() * 0.2;
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// Add decorative elements to the scene
function addDecorations() {
    // Add distant planets
    const planets = [
        { radius: 300, color: 0x3366ff, x: worldSize * 0.6, y: worldSize * 0.6, z: -900 },
        { radius: 200, color: 0x993366, x: -worldSize * 0.7, y: -worldSize * 0.5, z: -1200 },
        { radius: 500, color: 0x339966, x: worldSize * 0.8, y: -worldSize * 0.8, z: -1500 }
    ];
    
    gameObjects.planets = [];
    
    planets.forEach(planet => {
        const geometry = new THREE.CircleGeometry(planet.radius, 64);
        const material = new THREE.MeshBasicMaterial({
            color: planet.color,
            transparent: true,
            opacity: 0.5
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(planet.x, planet.y, planet.z);
        scene.add(mesh);
        
        // Add glow effect
        const glowGeometry = new THREE.CircleGeometry(planet.radius * 1.2, 64);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: planet.color,
            transparent: true,
            opacity: 0.2
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.z = -10;
        mesh.add(glow);
        
        gameObjects.planets.push({ mesh, glow });
    });
}

// Function to toggle music playback
function toggleMusic() {
    console.log("Toggle music called. Current state:", musicPlaying);
    try {
        if (musicPlaying) {
            backgroundMusic.pause();
            toggleMusicButton.innerHTML = '<i class="fas fa-music"></i> Toggle Cosmic Sounds';
            musicPlaying = false;
            console.log("Music paused successfully");
        } else {
            // Make sure the music is loaded before trying to play
            backgroundMusic.load();
            backgroundMusic.volume = 0.3;
            
            // Use a promise with timeout to handle potential playback issues
            const playPromise = backgroundMusic.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    toggleMusicButton.innerHTML = '<i class="fas fa-volume-mute"></i> Stop Cosmic Sounds';
                    musicPlaying = true;
                    console.log("Music started successfully");
                }).catch(e => {
                    console.error("Audio play failed:", e);
                    alert("Couldn't play music. Please interact with the page first before trying again.");
                    // Reset the button state since playback failed
                    toggleMusicButton.innerHTML = '<i class="fas fa-music"></i> Toggle Cosmic Sounds';
                    musicPlaying = false;
                });
            } else {
                // Fallback for browsers that don't return a promise
                toggleMusicButton.innerHTML = '<i class="fas fa-volume-mute"></i> Stop Cosmic Sounds';
                musicPlaying = true;
                console.log("Music started (non-promise mode)");
            }
        }
    } catch (error) {
        console.error("Error in toggleMusic function:", error);
        alert("An error occurred with audio playback. Please try again.");
    }
}

// Set up event listeners
function setupEventListeners() {
    // Start game button
    startButton.addEventListener('click', () => {
        startGame();
    });
    
    // Skip auth button (alternative start)
    skipAuthButton.addEventListener('click', () => {
        startGame();
    });
    
    // Restart button
    restartButton.addEventListener('click', () => {
        location.reload();
    });
    
    // Toggle music
    toggleMusicButton.addEventListener('click', () => {
        toggleMusic();
    });
    
    // Mouse move for controlling the snake
    document.addEventListener('mousemove', (event) => {
        if (!controlsEnabled) return;
        
        // Calculate normalized mouse position
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    });
}

// Start the game
function startGame() {
    console.log("startGame() called");
    
    // Get player name
    player.name = playerNameInput.value.trim() || 'Player' + Math.floor(Math.random() * 1000);
    console.log("Player name:", player.name);
    
    // Generate random color for player
    player.color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    console.log("Player color:", player.color);
    
    // Connect to Socket.io server directly without Firebase
    connectToServer();
    
    // Hide start screen and show game UI
    startScreen.style.display = 'none';
    gameUI.style.display = 'block';
    
    // Enable controls
    controlsEnabled = true;
    gameStarted = true;
}

// Connect to Socket.io server
function connectToServer() {
    try {
        console.log("Attempting to connect to server...");
        
        // Check if io is available
        if (typeof io === 'undefined') {
            console.error("Socket.io is not loaded!");
            enableOfflineMode("Could not load Socket.io library.");
            return;
        }
        
        // Update connection indicator UI
        const connectionIndicator = document.getElementById('connection-indicator');
        if (connectionIndicator) {
            connectionIndicator.className = 'checking';
            connectionIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking connection...';
        }
        
        // Always use the same server URL regardless of domain
        // This ensures both netlify and render domains connect to the same server
        const serverUrl = "https://slither-io-clone.onrender.com";
        console.log(`Connecting to central game server at: ${serverUrl}`);
        
        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
            console.log("Connection to server timed out");
            enableOfflineMode("Connection to multiplayer server timed out");
        }, 5000);
        
        // Connect to Socket.io server
        socket = io(serverUrl, {
            reconnectionAttempts: 3,
            timeout: 5000,
            transports: ['websocket', 'polling']
        });
        
        // Handle connection success
        socket.on('connect', () => {
            console.log('Connected to server successfully');
            clearTimeout(connectionTimeout);
            document.getElementById('loading-screen').style.display = 'none';
            
            // Update connection indicator
            if (connectionIndicator) {
                connectionIndicator.className = 'online';
                connectionIndicator.innerHTML = '<i class="fas fa-wifi"></i> Multiplayer Mode';
                
                const connectionMessage = document.querySelector('.connection-message');
                if (connectionMessage) {
                    connectionMessage.innerHTML = "You're connected to the multiplayer server. Compete with other players!";
                }
            }
            
            // Continue with game setup...
            createPlayerSnake();
            socket.emit('newPlayer', {
                name: player.name,
                color: player.color
            });
        });
        
        // Handle connection error
        socket.on('connect_error', (error) => {
            console.error('Socket.io connection error:', error);
            clearTimeout(connectionTimeout);
            enableOfflineMode("Could not connect to the multiplayer server.");
        });
        
        // Handle new player joining
        socket.on('newPlayer', (playerData) => {
            createOtherPlayer(playerData.id, playerData);
        });
        
        // Handle player movement
        socket.on('playerMoved', (playerData) => {
            updateOtherPlayer(playerData.id, playerData);
        });
        
        // Handle food updates
        socket.on('foodUpdate', (foodData) => {
            updateFood(foodData);
        });
        
        // Handle player being killed
        socket.on('playerKilled', (playerId) => {
            if (playerId === socket.id) {
                handleDeath();
            } else {
                removeOtherPlayer(playerId);
            }
        });
        
        // Handle player disconnection
        socket.on('playerDisconnect', (playerId) => {
            removeOtherPlayer(playerId);
        });
        
        // Handle forced position (anti-cheat)
        socket.on('forcePosition', (positionData) => {
            if (player.segments.length > 0) {
                // Update player position to server's authoritative position
                const head = player.segments[0];
                head.mesh.position.set(positionData.x, positionData.y, 0);
                head.x = positionData.x;
                head.y = positionData.y;
                
                // Update camera position
                camera.position.set(positionData.x, positionData.y, camera.position.z);
            }
        });
        
        // Receive initial game state
        socket.on('gameState', (data) => {
            // Initialize other players
            for (const id in data.players) {
                if (id !== socket.id) {
                    createOtherPlayer(id, data.players[id]);
                }
            }
            
            // Initialize food
            for (const foodItem of data.food) {
                createFood(foodItem);
            }
        });
        
    } catch (error) {
        console.error('Error initializing Socket.io:', error);
        enableOfflineMode("Error initializing game connection.");
    }
}

// Enable offline mode with a fallback experience
function enableOfflineMode(reason) {
    offlineMode = true;
    console.log("Enabling offline mode:", reason);
    
    // Clear any existing players
    for (const id in otherPlayers) {
        removeOtherPlayer(id);
    }
    otherPlayers = {};
    
    // Update connection indicator to show offline status
    const connectionIndicator = document.getElementById('connection-indicator');
    if (connectionIndicator) {
        connectionIndicator.className = 'offline';
        connectionIndicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline Mode';
    }
    
    // Hide loading screen
    document.getElementById('loading-screen').style.display = 'none';
    
    // Remove any existing offline notice first
    const existingNotice = document.querySelector('.offline-notice');
    if (existingNotice) {
        existingNotice.remove();
    }
    
    // Show a brief notice to the user
    const offlineNotice = document.createElement('div');
    offlineNotice.className = 'offline-notice';
    offlineNotice.innerHTML = `
        <div class="offline-content">
            <i class="fas fa-wifi-slash"></i>
            <h3>Offline Mode Active</h3>
            <p>${reason}</p>
            <p class="offline-description">You can still enjoy the game in single-player mode. For multiplayer with other players, visit <a href="https://slither-io-clone.onrender.com" target="_blank">the multiplayer server</a> directly.</p>
            <button id="offline-continue">Start Playing</button>
        </div>
    `;
    document.body.appendChild(offlineNotice);
    
    // When they click continue, remove the notice and start offline mode
    document.getElementById('offline-continue').addEventListener('click', () => {
        offlineNotice.style.display = 'none';
        startOfflineMode();
    });
    
    // Also allow pressing Enter to continue
    document.addEventListener('keydown', function offlineEnterHandler(e) {
        if (e.key === 'Enter' && offlineNotice.style.display !== 'none') {
            offlineNotice.style.display = 'none';
            startOfflineMode();
            document.removeEventListener('keydown', offlineEnterHandler);
        }
    });
}

// Start a simplified offline game mode
function startOfflineMode() {
    console.log("Starting offline mode (single player)");
    
    // Clear any existing players first (including AI snakes)
    for (const id in otherPlayers) {
        removeOtherPlayer(id);
    }
    otherPlayers = {};
    
    // Create player snake
    createPlayerSnake();
    
    // Generate some food for the offline experience - reduced amount for better performance
    const foodCount = 150; // Increased from 100 since we have no AI snakes
    for (let i = 0; i < foodCount; i++) {
        const foodId = 'offline-food-' + i;
        const x = (Math.random() * 2 - 1) * worldSize / 2;
        const y = (Math.random() * 2 - 1) * worldSize / 2;
        const food = {
            id: foodId,
            x: x,
            y: y,
            size: FOOD_SIZE,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
        };
        createFood(food);
    }
    
    // Enable controls
    controlsEnabled = true;
    gameStarted = true;
    
    // Start the optimized offline loop
    lastUpdateTime = Date.now();
    
    // Update leaderboard for offline mode
    updateLeaderboardOffline();
}

// Clear any existing AI snakes
function clearAISnakes() {
    for (const id in otherPlayers) {
        if (id.startsWith('ai-')) {
            removeOtherPlayer(id);
        }
    }
}

// Add offline-specific leaderboard updates - simplified with only player
function updateLeaderboardOffline() {
    // Clear current list
    leadersList.innerHTML = '';
    
    // Create a single-item leaderboard with just the player
    const li = document.createElement('li');
    li.innerHTML = `<span>${player.name || 'You'}</span><span>${player.size}</span>`;
    li.style.color = '#00ff00';
    li.style.fontWeight = 'bold';
    
    leadersList.appendChild(li);
}

// For offline mode - optimized food collision detection
function checkFoodCollisionsOffline() {
    if (player.segments.length === 0) return;
    
    const head = player.segments[0];
    const headRadius = SEGMENT_SIZE;
    const headX = head.x;
    const headY = head.y;
    
    for (let i = 0; i < foodItems.length; i++) {
        const food = foodItems[i];
        // Use squared distance for performance (avoid square root)
        const dx = headX - food.x;
        const dy = headY - food.y;
        const distanceSquared = dx * dx + dy * dy;
        const collisionDistanceSquared = (headRadius + FOOD_SIZE) * (headRadius + FOOD_SIZE);
        
        if (distanceSquared < collisionDistanceSquared) {
            // Remove the food
            scene.remove(food.mesh);
            foodItems.splice(i, 1);
            i--;
            
            // Add segment to player
            addSegment();
            
            // Update score
            player.size += 1;
            updateScore();
            
            // Generate new food - away from player for better gameplay
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * worldSize / 3 + worldSize / 6; // Between 1/6 and 1/2 of world radius
            const foodId = 'offline-food-' + Math.random().toString(36).substr(2, 9);
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            const newFood = {
                id: foodId,
                x: x,
                y: y,
                size: FOOD_SIZE,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                colorCycle: Math.random() > 0.8 // Only 20% of food items cycle colors for performance
            };
            createFood(newFood);
        }
    }
}

// Create simplified AI snakes for offline mode
function createAISnake() {
    const id = 'ai-' + Math.floor(Math.random() * 1000);
    const aiX = (Math.random() * 2 - 1) * worldSize / 3; // Spawn in center third
    const aiY = (Math.random() * 2 - 1) * worldSize / 3;
    const aiSize = 10 + Math.floor(Math.random() * 20); // Size between 10-30
    const aiColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const aiName = 'AI Snake ' + Math.floor(Math.random() * 100);
    
    otherPlayers[id] = {
        id: id,
        name: aiName,
        segments: [],
        color: aiColor,
        size: aiSize,
        // AI properties
        target: {
            x: Math.random() * worldSize - worldSize/2,
            y: Math.random() * worldSize - worldSize/2
        },
        changeTargetCounter: 0,
        speed: 1 + Math.random() * 1.5 // Random speed
    };
    
    // Create head
    const headGeometry = new THREE.CircleGeometry(SEGMENT_SIZE, 32);
    const headMaterial = new THREE.MeshBasicMaterial({ color: aiColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(aiX, aiY, 0);
    scene.add(head);
    
    // Add name label
    const nameLabel = createNameLabel(aiName, aiColor);
    head.add(nameLabel);
    
    otherPlayers[id].segments.push({ mesh: head, x: aiX, y: aiY });
    
    // Create a few segments
    const segmentCount = Math.floor(aiSize / 3);
    for (let i = 0; i < segmentCount; i++) {
        addSegmentToOtherPlayer(id, aiX, aiY);
    }
    
    return id;
}

// Update AI snakes in offline mode
function updateAISnakes() {
    for (const id in otherPlayers) {
        if (!id.startsWith('ai-')) continue;
        
        const ai = otherPlayers[id];
        if (ai.segments.length === 0) continue;
        
        // Occasionally change target
        ai.changeTargetCounter++;
        if (ai.changeTargetCounter > 100 + Math.random() * 200) {
            ai.changeTargetCounter = 0;
            
            // 80% chance to target food, 20% chance to move randomly
            if (Math.random() < 0.8 && foodItems.length > 0) {
                // Find nearest food
                let nearestFood = null;
                let minDistance = Infinity;
                
                for (const food of foodItems) {
                    const dx = ai.segments[0].x - food.x;
                    const dy = ai.segments[0].y - food.y;
                    const distanceSquared = dx * dx + dy * dy;
                    
                    if (distanceSquared < minDistance) {
                        minDistance = distanceSquared;
                        nearestFood = food;
                    }
                }
                
                if (nearestFood) {
                    ai.target.x = nearestFood.x;
                    ai.target.y = nearestFood.y;
                }
            } else {
                // Random movement within bounds
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * worldSize / 3;
                ai.target.x = Math.cos(angle) * distance;
                ai.target.y = Math.sin(angle) * distance;
            }
        }
        
        // Move toward target
        const dx = ai.target.x - ai.segments[0].x;
        const dy = ai.target.y - ai.segments[0].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 10) {
            const newX = ai.segments[0].x + (dx / distance) * ai.speed;
            const newY = ai.segments[0].y + (dy / distance) * ai.speed;
            
            // Check world boundary
            const distanceFromCenter = Math.sqrt(newX * newX + newY * newY);
            if (distanceFromCenter < worldSize / 2 - 100) {
                // Update head position
                ai.segments[0].mesh.position.set(newX, newY, 0);
                ai.segments[0].x = newX;
                ai.segments[0].y = newY;
                
                // Update segment positions
                for (let i = ai.segments.length - 1; i > 0; i--) {
                    const segment = ai.segments[i];
                    const target = ai.segments[i - 1];
                    
                    // Calculate direction to target
                    const segDx = target.x - segment.x;
                    const segDy = target.y - segment.y;
                    const segDistance = Math.sqrt(segDx * segDx + segDy * segDy);
                    
                    // Only move if segment is too far from target
                    if (segDistance > SEGMENT_SPACING) {
                        const moveX = segDx * (segDistance - SEGMENT_SPACING) / segDistance;
                        const moveY = segDy * (segDistance - SEGMENT_SPACING) / segDistance;
                        
                        segment.x += moveX;
                        segment.y += moveY;
                        segment.mesh.position.set(segment.x, segment.y, 0);
                    }
                }
            } else {
                // Too close to boundary, change target
                ai.changeTargetCounter = 100;
            }
        }
    }
}

// Check collision with AI snakes in offline mode
function checkAICollisions() {
    if (player.segments.length === 0) return;
    
    const headX = player.segments[0].x;
    const headY = player.segments[0].y;
    const headRadius = SEGMENT_SIZE;
    
    // Check collisions with AI segments
    for (const id in otherPlayers) {
        if (!id.startsWith('ai-')) continue;
        
        const ai = otherPlayers[id];
        
        // Skip first segment (head)
        for (let i = 1; i < ai.segments.length; i++) {
            const segment = ai.segments[i];
            const dx = headX - segment.x;
            const dy = headY - segment.y;
            const distanceSquared = dx * dx + dy * dy;
            const collisionDistanceSquared = (headRadius + SEGMENT_SIZE) * (headRadius + SEGMENT_SIZE) * 0.7; // Slightly more forgiving collision
            
            if (distanceSquared < collisionDistanceSquared) {
                // Collision detected, player dies
                console.log("Player collided with AI snake body segment - Game Over");
                handleOfflineDeath();
                return;
            }
        }
        
        // Check head-to-head collision
        if (ai.segments.length > 0) {
            const aiHeadX = ai.segments[0].x;
            const aiHeadY = ai.segments[0].y;
            const dx = headX - aiHeadX;
            const dy = headY - aiHeadY;
            const distanceSquared = dx * dx + dy * dy;
            const collisionDistanceSquared = (headRadius + SEGMENT_SIZE) * (headRadius + SEGMENT_SIZE) * 0.7;
            
            if (distanceSquared < collisionDistanceSquared) {
                // Head-on collision - larger snake wins
                if (player.size <= ai.size) {
                    console.log("Player lost head-to-head collision with AI snake - Game Over");
                    handleOfflineDeath();
                    return;
                } else {
                    console.log("Player won head-to-head collision with AI snake");
                    // We eat the AI snake
                    removeOtherPlayer(id);
                    
                    // We grow a bit
                    player.size += Math.ceil(ai.size / 4);
                    updateScore();
                    
                    if (player.segments.length < MAX_SEGMENTS) {
                        addSegment();
                    }
                    
                    // Create a new AI snake to replace the one we ate
                    setTimeout(() => {
                        if (offlineMode) {
                            createAISnake();
                        }
                    }, 2000);
                }
            }
        }
    }
}

// Handle player death in offline mode
function handleOfflineDeath() {
    // Disable controls
    controlsEnabled = false;
    gameStarted = false;
    
    // Try to play death sound with better error handling
    try {
        deathSound.currentTime = 0;
        // Use the promise-based approach with better error handling
        deathSound.play()
            .catch(e => console.log("Death sound playback failed:", e));
    } catch (error) {
        console.log("Audio error:", error);
    }
    
    // Show death screen
    finalLengthElement.textContent = player.size;
    deathScreen.style.display = 'flex';
    gameUI.style.display = 'none';
    
    // Remove player segments
    for (const segment of player.segments) {
        scene.remove(segment.mesh);
    }
    player.segments = [];
    
    // Clear out all other players
    for (const id in otherPlayers) {
        removeOtherPlayer(id);
    }
    otherPlayers = {};
    
    // Reset player data
    player.size = 10;
    player.score = 0;
}

// Time-based animation for smoother gameplay
let lastUpdateTime = 0;

// Main game loop - remove AI snake updates
function animate(now) {
    requestAnimationFrame(animate);
    
    // Calculate delta time for smoother animation
    const deltaTime = (now - lastUpdateTime) / 1000; // In seconds
    lastUpdateTime = now;
    
    // Skip if delta time is too large (tab was inactive)
    if (deltaTime > 0.1) {
        renderer.render(scene, camera);
        return;
    }
    
    // Update environment animations - less frequently in offline mode
    if (!offlineMode || Math.random() < 0.3) { // Only run 30% of the time in offline mode
        updateEnvironmentEffects(deltaTime);
    }
    
    if (gameStarted && controlsEnabled) {
        if (offlineMode) {
            // Optimized offline mode updates - no AI snakes
            updatePlayerOffline(deltaTime);
            checkFoodCollisionsOffline();
            checkBoundaryOffline();
            
            // Less frequent updates for performance
            if (now % 10 < 2) { // Update approximately every 10 frames
                updateLeaderboardOffline();
                updateMinimapOffline();
            }
        } else {
            // Online mode updates
            updatePlayer(deltaTime);
            checkFoodCollisions();
            checkPlayerCollisions();
            checkBoundary();
            updateLeaderboard();
            updateMinimap();
        }
    }
    
    renderer.render(scene, camera);
}

// Optimized update player for offline mode
function updatePlayerOffline(deltaTime) {
    if (player.segments.length === 0) {
        createPlayerSnake();
        return;
    }
    
    // Calculate direction based on mouse position
    const direction = new THREE.Vector3(mouse.x, mouse.y, 0).normalize();
    
    // Calculate new position - scale by deltaTime for consistent speed
    const speed = SNAKE_SPEED * 60 * deltaTime; // Adjust for 60fps equivalent
    const head = player.segments[0];
    const newX = head.x + direction.x * speed;
    const newY = head.y + direction.y * speed;
    
    // Update head position
    head.mesh.position.set(newX, newY, 0);
    head.x = newX;
    head.y = newY;
    
    // Update camera position to follow player
    camera.position.set(newX, newY, camera.position.z);
    
    // Update tail segments - less frequently for performance in large snakes
    const segmentUpdateInterval = Math.ceil(player.segments.length / 20); // Update fewer segments for longer snakes
    
    for (let i = player.segments.length - 1; i > 0; i--) {
        // Skip some segments for performance in large snakes
        if (player.segments.length > 20 && i % segmentUpdateInterval !== 0 && i !== 1) continue;
        
        const segment = player.segments[i];
        const target = player.segments[i - 1];
        
        // Calculate direction to target
        const dx = target.x - segment.x;
        const dy = target.y - segment.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Only move if segment is too far from target
        if (distance > SEGMENT_SPACING) {
            const moveX = dx * (distance - SEGMENT_SPACING) / distance;
            const moveY = dy * (distance - SEGMENT_SPACING) / distance;
            
            segment.x += moveX;
            segment.y += moveY;
            segment.mesh.position.set(segment.x, segment.y, 0);
        }
    }
}

// Simplified boundary check for offline mode
function checkBoundaryOffline() {
    if (player.segments.length === 0) return;
    
    const headX = player.segments[0].x;
    const headY = player.segments[0].y;
    const distanceSquared = headX * headX + headY * headY;
    const radiusSquared = (worldSize / 2) * (worldSize / 2);
    
    // Apply visual warning effect when close to boundary
    if (distanceSquared > radiusSquared * 0.7) {
        // Calculate how close we are to the boundary (0-1 range)
        const proximityFactor = (Math.sqrt(distanceSquared) - Math.sqrt(radiusSquared * 0.7)) / (Math.sqrt(radiusSquared) * 0.3);
        
        // Make border lights pulse based on proximity (optimized - update fewer lights)
        if (gameObjects.borderLights) {
            const sampleSize = Math.ceil(gameObjects.borderLights.length / 4); // Only update 1/4 of lights at a time
            for (let i = 0; i < sampleSize; i++) {
                const index = Math.floor(Math.random() * gameObjects.borderLights.length);
                const light = gameObjects.borderLights[index];
                if (light) {
                    light.intensity = 10 + proximityFactor * 20;
                }
            }
        }
    }
    
    if (distanceSquared > radiusSquared) {
        console.log("Player hit world boundary in offline mode - Game Over");
        handleOfflineDeath();
    }
}

// Simplified minimap update for offline mode - no AI snakes
function updateMinimapOffline() {
    if (!minimapContext) return;
    
    // Clear the minimap
    minimapContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
    minimapContext.fillRect(0, 0, minimapSize, minimapSize);
    
    // Draw boundary wall as a thick red ring
    minimapContext.strokeStyle = '#ff0000';
    minimapContext.lineWidth = 10;
    minimapContext.beginPath();
    minimapContext.arc(minimapSize / 2, minimapSize / 2, minimapSize / 2 - 10, 0, Math.PI * 2);
    minimapContext.stroke();
    
    // Draw only a subset of food items for performance
    const maxFoodToRender = 100;
    const foodStep = Math.max(1, Math.floor(foodItems.length / maxFoodToRender));
    
    minimapContext.fillStyle = '#ffcc00';
    for (let i = 0; i < foodItems.length; i += foodStep) {
        const food = foodItems[i];
        const minimapX = (food.x + worldSize / 2) * minimapScale;
        const minimapY = (food.y + worldSize / 2) * minimapScale;
        
        minimapContext.beginPath();
        minimapContext.arc(minimapX, minimapY, 1, 0, Math.PI * 2);
        minimapContext.fill();
    }
    
    // Draw player
    if (player.segments.length > 0) {
        const head = player.segments[0];
        const minimapX = (head.x + worldSize / 2) * minimapScale;
        const minimapY = (head.y + worldSize / 2) * minimapScale;
        
        // Draw player location with a larger dot
        minimapContext.fillStyle = player.color;
        minimapContext.beginPath();
        minimapContext.arc(minimapX, minimapY, 5, 0, Math.PI * 2);
        minimapContext.fill();
        
        // Add a white border
        minimapContext.strokeStyle = '#ffffff';
        minimapContext.lineWidth = 2;
        minimapContext.beginPath();
        minimapContext.arc(minimapX, minimapY, 5, 0, Math.PI * 2);
        minimapContext.stroke();
    }
}

// Create the player's snake with improved visuals
function createPlayerSnake() {
    // Create a valid random color (ensuring full hex format)
    const randomColor = Math.floor(Math.random() * 0xffffff);
    player.color = '#' + randomColor.toString(16).padStart(6, '0');
    
    // Create head with glowing effect
    const headGeometry = new THREE.CircleGeometry(SEGMENT_SIZE, 32);
    const headMaterial = new THREE.MeshBasicMaterial({ 
        color: player.color,
        transparent: true,
        opacity: 0.95
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    scene.add(head);
    
    // Add glow effect
    const headGlowGeometry = new THREE.CircleGeometry(SEGMENT_SIZE * 1.8, 32);
    const headGlowMaterial = new THREE.MeshBasicMaterial({
        color: player.color,
        transparent: true,
        opacity: 0.3
    });
    const headGlow = new THREE.Mesh(headGlowGeometry, headGlowMaterial);
    head.add(headGlow);
    headGlow.position.set(0, 0, -5); // Behind the head
    
    // Add a pattern to the snake head
    const patternGeometry = new THREE.RingGeometry(SEGMENT_SIZE * 0.5, SEGMENT_SIZE * 0.7, 32);
    const patternMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3
    });
    const pattern = new THREE.Mesh(patternGeometry, patternMaterial);
    pattern.position.z = 0.5;
    head.add(pattern);
    
    // Add eyes
    const eyeGeometry = new THREE.CircleGeometry(SEGMENT_SIZE * 0.25, 16);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(SEGMENT_SIZE * 0.6, SEGMENT_SIZE * 0.4, 1);
    head.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(SEGMENT_SIZE * 0.6, -SEGMENT_SIZE * 0.4, 1);
    head.add(rightEye);
    
    // Add pupils
    const pupilGeometry = new THREE.CircleGeometry(SEGMENT_SIZE * 0.12, 16);
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    
    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(0, 0, 1);
    leftEye.add(leftPupil);
    
    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(0, 0, 1);
    rightEye.add(rightPupil);
    
    // Add a highlight to the eyes
    const highlightGeometry = new THREE.CircleGeometry(SEGMENT_SIZE * 0.05, 16);
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    const leftHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    leftHighlight.position.set(SEGMENT_SIZE * 0.08, SEGMENT_SIZE * 0.08, 1);
    leftPupil.add(leftHighlight);
    
    const rightHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    rightHighlight.position.set(SEGMENT_SIZE * 0.08, SEGMENT_SIZE * 0.08, 1);
    rightPupil.add(rightHighlight);
    
    // Initialize player with the head
    player.segments = [{ 
        mesh: head, 
        x: 0, 
        y: 0,
        eyes: { left: leftEye, right: rightEye },
        pupils: { left: leftPupil, right: rightPupil },
        glow: headGlow,
        pattern: pattern
    }];
    player.size = 10;
    
    // Update score display
    updateScore();
}

// Create another player's snake
function createOtherPlayer(id, playerData) {
    if (otherPlayers[id]) return;
    
    otherPlayers[id] = {
        id: id,
        name: playerData.name || 'Player',
        segments: [],
        color: playerData.color,
        size: playerData.size
    };
    
    // Create head
    const headGeometry = new THREE.CircleGeometry(SEGMENT_SIZE, 32);
    const headMaterial = new THREE.MeshBasicMaterial({ color: playerData.color });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(playerData.x, playerData.y, 0);
    scene.add(head);
    
    // Add name label
    const nameLabel = createNameLabel(playerData.name, playerData.color);
    head.add(nameLabel);
    
    otherPlayers[id].segments.push({ mesh: head, x: playerData.x, y: playerData.y });
    
    // Create segments if available
    if (playerData.segments && playerData.segments.length > 0) {
        for (let i = 0; i < playerData.segments.length; i++) {
            const segment = playerData.segments[i];
            addSegmentToOtherPlayer(id, segment.x, segment.y);
        }
    }
}

// Update other player's position
function updateOtherPlayer(id, playerData) {
    if (!otherPlayers[id]) {
        createOtherPlayer(id, playerData);
        return;
    }
    
    // Update head position
    if (otherPlayers[id].segments.length > 0) {
        otherPlayers[id].segments[0].mesh.position.set(playerData.x, playerData.y, 0);
        otherPlayers[id].segments[0].x = playerData.x;
        otherPlayers[id].segments[0].y = playerData.y;
    }
    
    // Update or create segments
    const segmentCount = playerData.segments ? playerData.segments.length : 0;
    
    // Add new segments if needed
    while (otherPlayers[id].segments.length < segmentCount + 1) {
        const lastSegment = otherPlayers[id].segments[otherPlayers[id].segments.length - 1];
        addSegmentToOtherPlayer(id, lastSegment.x, lastSegment.y);
    }
    
    // Update segment positions
    for (let i = 0; i < segmentCount; i++) {
        if (i + 1 < otherPlayers[id].segments.length) {
            const segment = playerData.segments[i];
            otherPlayers[id].segments[i + 1].mesh.position.set(segment.x, segment.y, 0);
            otherPlayers[id].segments[i + 1].x = segment.x;
            otherPlayers[id].segments[i + 1].y = segment.y;
        }
    }
    
    // Update size
    otherPlayers[id].size = playerData.size;
}

// Add a segment to another player
function addSegmentToOtherPlayer(id, x, y) {
    const segmentGeometry = new THREE.CircleGeometry(SEGMENT_SIZE - 2, 32);
    const segmentMaterial = new THREE.MeshBasicMaterial({ color: otherPlayers[id].color });
    const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
    segment.position.set(x, y, 0);
    scene.add(segment);
    
    otherPlayers[id].segments.push({ mesh: segment, x, y });
}

// Remove another player
function removeOtherPlayer(id) {
    if (!otherPlayers[id]) return;
    
    // Remove all segments
    for (const segment of otherPlayers[id].segments) {
        scene.remove(segment.mesh);
    }
    
    delete otherPlayers[id];
}

// Create food item with improved visuals
function createFood(foodData) {
    // Check if food already exists
    if (foodItems.some(food => food.id === foodData.id)) return;
    
    // Ensure valid hex color
    let foodColor;
    if (foodData.color && typeof foodData.color === 'string' && foodData.color.startsWith('#')) {
        // If it's already a string hex color, use it
        foodColor = foodData.color;
    } else {
        // Otherwise generate a valid hex color
        const randomColor = Math.floor(Math.random() * 0xffffff);
        foodColor = '#' + randomColor.toString(16).padStart(6, '0');
    }
    
    // Main food orb
    const foodGeometry = new THREE.CircleGeometry(FOOD_SIZE, 16);
    const foodMaterial = new THREE.MeshBasicMaterial({ 
        color: foodColor,
        transparent: true,
        opacity: 0.9
    });
    const food = new THREE.Mesh(foodGeometry, foodMaterial);
    
    // Glow effect around food
    const glowGeometry = new THREE.CircleGeometry(FOOD_SIZE * 1.8, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: foodColor,
        transparent: true,
        opacity: 0.4
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = -2;
    food.add(glow);
    
    // Add inner detail to food
    const innerGeometry = new THREE.CircleGeometry(FOOD_SIZE * 0.5, 16);
    const innerMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5
    });
    const inner = new THREE.Mesh(innerGeometry, innerMaterial);
    inner.position.z = 0.5;
    food.add(inner);
    
    food.position.set(foodData.x, foodData.y, 0);
    scene.add(food);
    
    foodItems.push({
        id: foodData.id,
        mesh: food,
        glow: glow,
        inner: inner,
        x: foodData.x,
        y: foodData.y,
        scale: 1,
        scaleDir: -0.01, // For pulsing animation
        originalColor: foodColor
    });
}

// Update food items
function updateFood(foodData) {
    // Remove all current food
    for (const food of foodItems) {
        scene.remove(food.mesh);
    }
    
    foodItems = [];
    
    // Add all updated food
    for (const foodItem of foodData) {
        createFood(foodItem);
    }
}

// Create a name label for a player
function createNameLabel(name, color) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.font = '24px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.fillText(name, 128, 24);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, SEGMENT_SIZE + 20, 0);
    sprite.scale.set(100, 25, 1);
    
    return sprite;
}

// Update player score
function updateScore() {
    lengthElement.textContent = player.size;
}

// Handle player death
function handleDeath() {
    // Disable controls
    controlsEnabled = false;
    gameStarted = false;
    
    // Try to play death sound with better error handling
    try {
        deathSound.currentTime = 0;
        // Use the promise-based approach with better error handling
        deathSound.play()
            .catch(e => console.log("Death sound playback failed:", e));
    } catch (error) {
        console.log("Audio error:", error);
    }
    
    // Save high score to Firebase
    saveHighScore(player.name, player.size);
    
    // Show death screen
    finalLengthElement.textContent = player.size;
    deathScreen.style.display = 'flex';
    gameUI.style.display = 'none';
    
    // Remove player segments
    for (const segment of player.segments) {
        scene.remove(segment.mesh);
    }
    player.segments = [];
    
    // Clean out all other players
    for (const id in otherPlayers) {
        removeOtherPlayer(id);
    }
    otherPlayers = {};
    
    // Clean up socket connection to allow for proper restart
    if (socket && socket.connected) {
        socket.disconnect();
    }
    
    // Reset player data
    player.size = 10;
    player.score = 0;
}

// Update leaderboard
function updateLeaderboard() {
    // Clear current list
    leadersList.innerHTML = '';
    
    // Build leaderboard data
    const leaders = [];
    
    // Add local player
    leaders.push({
        name: player.name,
        score: player.size,
        isLocal: true
    });
    
    // Add other players
    for (const id in otherPlayers) {
        leaders.push({
            name: otherPlayers[id].name,
            score: otherPlayers[id].size,
            isLocal: false
        });
    }
    
    // Sort by score (descending)
    leaders.sort((a, b) => b.score - a.score);
    
    // Display top 10
    const topLeaders = leaders.slice(0, 10);
    for (const leader of topLeaders) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${leader.name}</span><span>${leader.score}</span>`;
        
        if (leader.isLocal) {
            li.style.color = '#00ff00';
            li.style.fontWeight = 'bold';
        }
        
        leadersList.appendChild(li);
    }
}

// Override the checkFoodCollisions function for offline mode
const originalCheckFoodCollisions = checkFoodCollisions;
checkFoodCollisions = function() {
    if (offlineMode) {
        // In offline mode, handle collisions locally
        if (player.segments.length === 0) return;
        
        const head = player.segments[0];
        const headRadius = SEGMENT_SIZE;
        
        for (let i = 0; i < foodItems.length; i++) {
            const food = foodItems[i];
            const dx = head.x - food.x;
            const dy = head.y - food.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < headRadius + FOOD_SIZE) {
                // Remove the food
                scene.remove(food.mesh);
                foodItems.splice(i, 1);
                i--;
                
                // Add segment to player
                addSegment();
                
                // Generate new food
                const foodId = 'offline-food-' + Math.random().toString(36).substr(2, 9);
                const x = (Math.random() * 2 - 1) * worldSize / 2;
                const y = (Math.random() * 2 - 1) * worldSize / 2;
                const newFood = {
                    id: foodId,
                    x: x,
                    y: y,
                    size: FOOD_SIZE,
                    color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
                };
                createFood(newFood);
            }
        }
    } else {
        // Online mode, use the original function
        originalCheckFoodCollisions.call(this);
    }
};

// Check for collisions with other players
function checkPlayerCollisions() {
    if (player.segments.length === 0) return;
    
    const headX = player.segments[0].x;
    const headY = player.segments[0].y;
    
    // Check collisions with other players' segments
    for (const id in otherPlayers) {
        const otherPlayer = otherPlayers[id];
        
        // Skip first segment (head)
        for (let i = 1; i < otherPlayer.segments.length; i++) {
            const segment = otherPlayer.segments[i];
            const distance = Math.sqrt(Math.pow(headX - segment.x, 2) + Math.pow(headY - segment.y, 2));
            
            if (distance < SEGMENT_SIZE * 1.5) {
                // Collision detected, player dies
                socket.emit('playerDeath', socket.id);
                handleDeath();
                return;
            }
        }
        
        // Check if we can kill other player (head-to-head collision)
        const otherHeadX = otherPlayer.segments[0].x;
        const otherHeadY = otherPlayer.segments[0].y;
        const headDistance = Math.sqrt(Math.pow(headX - otherHeadX, 2) + Math.pow(headY - otherHeadY, 2));
        
        if (headDistance < SEGMENT_SIZE * 1.5) {
            // Head-on collision - larger snake wins
            if (player.size <= otherPlayer.size) {
                socket.emit('playerDeath', socket.id);
                handleDeath();
                return;
            } else {
                socket.emit('playerDeath', id);
                // We grow a bit
                player.size += Math.ceil(otherPlayer.size / 4);
                updateScore();
                
                if (player.segments.length < MAX_SEGMENTS) {
                    addSegment();
                }
            }
        }
    }
}

// Check if player is out of bounds
function checkBoundary() {
    if (player.segments.length === 0) return;
    
    const headX = player.segments[0].x;
    const headY = player.segments[0].y;
    const radius = worldSize / 2;
    const distance = Math.sqrt(headX * headX + headY * headY);
    
    // Apply visual warning effect when close to boundary
    if (distance > radius * 0.85) {
        // Calculate how close we are to the boundary (0-1 range)
        const proximityFactor = (distance - radius * 0.85) / (radius * 0.15);
        
        // Make border cubes pulse and change size based on proximity
        if (gameObjects.borderCubes) {
            gameObjects.borderCubes.forEach((cube, index) => {
                const scaleFactor = 1 + proximityFactor * 2;
                cube.scale.set(scaleFactor, scaleFactor, scaleFactor);
            });
        }
        
        // Increase light intensity based on proximity
        if (gameObjects.borderLights) {
            gameObjects.borderLights.forEach(light => {
                light.intensity = 10 + proximityFactor * 20;
            });
        }
    }
    
    if (distance > radius) {
        socket.emit('playerDeath', socket.id);
        handleDeath();
    }
}

// Add a segment to the player's snake
function addSegment() {
    if (player.segments.length === 0) {
        createPlayerSnake();
        return;
    }
    
    const lastSegment = player.segments[player.segments.length - 1];
    
    // Create segment with gradient based on position in chain
    const progress = player.segments.length / MAX_SEGMENTS;
    const segmentColor = new THREE.Color(player.color);
    
    // Calculate segment size with graduated reduction
    const segmentSize = SEGMENT_SIZE - 1 - (progress * 6);
    
    const segmentGeometry = new THREE.CircleGeometry(segmentSize, 32);
    const segmentMaterial = new THREE.MeshBasicMaterial({ 
        color: segmentColor,
        transparent: true,
        opacity: 0.95 - progress * 0.3
    });
    const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
    
    // Add subtle glow
    const glowGeometry = new THREE.CircleGeometry(segmentSize * 1.5, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: segmentColor,
        transparent: true,
        opacity: 0.3 - progress * 0.15
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = -3;
    segment.add(glow);
    
    // Add a pattern based on position
    if (player.segments.length % 3 === 0) {
        const patternGeometry = new THREE.RingGeometry(segmentSize * 0.3, segmentSize * 0.7, 32);
        const patternMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.2
        });
        const pattern = new THREE.Mesh(patternGeometry, patternMaterial);
        pattern.position.z = 0.5;
        segment.add(pattern);
    }
    
    // Position new segment behind the last one
    segment.position.copy(lastSegment.mesh.position);
    scene.add(segment);
    
    player.segments.push({
        mesh: segment,
        glow: glow,
        x: lastSegment.x,
        y: lastSegment.y
    });
}

// Update the environment effects (animations, etc.)
function updateEnvironmentEffects(deltaTime) {
    // Animate food items
    for (const food of foodItems) {
        if (food.mesh) {
            // Bobbing animation for food
            const time = Date.now() * 0.001;
            food.mesh.position.z = 5 + Math.sin(time * 2 + food.x) * 2;
            
            // Pulsing glow effect
            if (food.glow) {
                const pulseFactor = 0.5 + 0.2 * Math.sin(time * 3 + food.y);
                food.glow.scale.set(pulseFactor, pulseFactor, 1);
            }
            
            // Color cycling for some food items
            if (food.colorCycle) {
                const hue = (time * 0.1 + food.x * 0.01) % 1;
                const saturation = 0.7;
                const lightness = 0.6;
                
                food.mesh.material.color.setHSL(hue, saturation, lightness);
                if (food.glow && food.glow.material) {
                    food.glow.material.color.setHSL(hue, saturation, lightness);
                }
            }
            
            // Rotate the inner circle for extra animation
            if (food.inner) {
                food.inner.rotation.z += 0.01;
            }
        }
    }
    
    // Animate the red border cubes
    if (gameObjects.borderCubes) {
        gameObjects.borderCubes.forEach((cube, index) => {
            const time = Date.now() * 0.001;
            const offset = index / gameObjects.borderCubes.length * Math.PI * 2;
            
            // Make cubes rotate
            cube.rotation.z = time + offset;
            
            // Make cubes pulse
            const pulseFactor = 1 + 0.3 * Math.sin(time * 2 + offset);
            if (player.segments.length === 0 || Math.sqrt(player.segments[0].x * player.segments[0].x + player.segments[0].y * player.segments[0].y) < worldSize / 2 * 0.85) {
                // Only reset scale if player is not near the border
                cube.scale.set(pulseFactor, pulseFactor, pulseFactor);
            }
        });
    }
    
    // Animate border lights
    if (gameObjects.borderLights) {
        gameObjects.borderLights.forEach((light, index) => {
            const time = Date.now() * 0.001;
            const offset = index / gameObjects.borderLights.length * Math.PI * 2;
            
            // Make lights pulse with offset based on position
            if (player.segments.length === 0 || Math.sqrt(player.segments[0].x * player.segments[0].x + player.segments[0].y * player.segments[0].y) < worldSize / 2 * 0.85) {
                // Only reset intensity if player is not near the border
                light.intensity = 5 + 5 * Math.sin(time + offset);
            }
            
            // Make lights slightly change position for a more dynamic effect
            const originalX = Math.cos((index / gameObjects.borderLights.length) * Math.PI * 2) * (worldSize / 2);
            const originalY = Math.sin((index / gameObjects.borderLights.length) * Math.PI * 2) * (worldSize / 2);
            
            const waveFactor = 50 * Math.sin(time * 2 + offset);
            light.position.x = originalX + waveFactor * Math.cos(offset);
            light.position.y = originalY + waveFactor * Math.sin(offset);
        });
    }
    
    // Animate stars (subtle twinkling)
    if (gameObjects.stars && gameObjects.stars.material) {
        gameObjects.stars.material.opacity = 0.6 + 0.4 * Math.sin(Date.now() * 0.0003);
    }
    
    // Animate nebula background
    if (gameObjects.nebula) {
        gameObjects.nebula.rotation.z += 0.0001;
    }
    
    // Animate planets
    if (gameObjects.planets) {
        gameObjects.planets.forEach((planet, index) => {
            const speed = 0.0005 * (index + 1);
            planet.glow.rotation.z += speed;
            planet.glow.scale.set(
                1 + 0.1 * Math.sin(Date.now() * 0.0005),
                1 + 0.1 * Math.sin(Date.now() * 0.0005),
                1
            );
        });
    }
    
    // Animate player head pattern
    if (player.segments.length > 0 && player.segments[0].pattern) {
        player.segments[0].pattern.rotation.z += 0.005;
    }
    
    // Animate player eyes to look toward mouse direction
    if (player.segments.length > 0 && player.segments[0].eyes) {
        const eyes = player.segments[0].eyes;
        const pupils = player.segments[0].pupils;
        
        if (eyes.left && pupils.left) {
            const maxOffset = SEGMENT_SIZE * 0.08;
            pupils.left.position.x = maxOffset * mouse.x;
            pupils.left.position.y = maxOffset * mouse.y;
            
            pupils.right.position.x = maxOffset * mouse.x;
            pupils.right.position.y = maxOffset * mouse.y;
        }
    }
}

// Update the minimap
function updateMinimap() {
    if (!minimapContext) return;
    
    // Clear the minimap
    minimapContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
    minimapContext.fillRect(0, 0, minimapSize, minimapSize);
    
    // Draw boundary wall as a thick red ring
    minimapContext.strokeStyle = '#ff0000';
    minimapContext.lineWidth = 10; // Much thicker border
    minimapContext.beginPath();
    minimapContext.arc(minimapSize / 2, minimapSize / 2, minimapSize / 2 - 10, 0, Math.PI * 2);
    minimapContext.stroke();
    
    // Add hazard stripes to match the 3D wall
    const stripeCount = 20;
    const centerX = minimapSize / 2;
    const centerY = minimapSize / 2;
    const radius = minimapSize / 2 - 10;
    
    for (let i = 0; i < stripeCount; i++) {
        const startAngle = (i / stripeCount) * Math.PI * 2;
        const endAngle = ((i + 0.5) / stripeCount) * Math.PI * 2;
        
        minimapContext.fillStyle = i % 2 === 0 ? '#ff0000' : '#ffff00';
        minimapContext.beginPath();
        minimapContext.arc(centerX, centerY, radius, startAngle, endAngle);
        minimapContext.arc(centerX, centerY, radius - 10, endAngle, startAngle, true);
        minimapContext.fill();
    }
    
    // Draw food items
    minimapContext.fillStyle = '#ffcc00';
    for (const food of foodItems) {
        const minimapX = (food.x + worldSize / 2) * minimapScale;
        const minimapY = (food.y + worldSize / 2) * minimapScale;
        
        minimapContext.beginPath();
        minimapContext.arc(minimapX, minimapY, 1, 0, Math.PI * 2);
        minimapContext.fill();
    }
    
    // Draw other players
    for (const id in otherPlayers) {
        const otherPlayer = otherPlayers[id];
        if (otherPlayer.segments.length > 0) {
            const head = otherPlayer.segments[0];
            const minimapX = (head.x + worldSize / 2) * minimapScale;
            const minimapY = (head.y + worldSize / 2) * minimapScale;
            
            minimapContext.fillStyle = otherPlayer.color;
            minimapContext.beginPath();
            minimapContext.arc(minimapX, minimapY, 3, 0, Math.PI * 2);
            minimapContext.fill();
        }
    }
    
    // Draw player
    if (player.segments.length > 0) {
        const head = player.segments[0];
        const minimapX = (head.x + worldSize / 2) * minimapScale;
        const minimapY = (head.y + worldSize / 2) * minimapScale;
        
        // Draw player location with a larger dot
        minimapContext.fillStyle = player.color;
        minimapContext.beginPath();
        minimapContext.arc(minimapX, minimapY, 5, 0, Math.PI * 2);
        minimapContext.fill();
        
        // Add a white border
        minimapContext.strokeStyle = '#ffffff';
        minimapContext.lineWidth = 2;
        minimapContext.beginPath();
        minimapContext.arc(minimapX, minimapY, 5, 0, Math.PI * 2);
        minimapContext.stroke();
    }
}

// Update player position for online mode
function updatePlayer(deltaTime) {
    if (player.segments.length === 0) {
        createPlayerSnake();
        return;
    }
    
    // Calculate direction based on mouse position
    const direction = new THREE.Vector3(mouse.x, mouse.y, 0).normalize();
    
    // Calculate new position - scale by deltaTime for consistent speed if provided
    const speed = deltaTime ? SNAKE_SPEED * 60 * deltaTime : SNAKE_SPEED; // Adjust for 60fps equivalent
    const head = player.segments[0];
    const newX = head.x + direction.x * speed;
    const newY = head.y + direction.y * speed;
    
    // Update head position
    head.mesh.position.set(newX, newY, 0);
    head.x = newX;
    head.y = newY;
    
    // Update camera position to follow player
    camera.position.set(newX, newY, camera.position.z);
    
    // Update tail segments
    for (let i = player.segments.length - 1; i > 0; i--) {
        const segment = player.segments[i];
        const target = player.segments[i - 1];
        
        // Calculate direction to target
        const dx = target.x - segment.x;
        const dy = target.y - segment.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Only move if segment is too far from target
        if (distance > SEGMENT_SPACING) {
            const moveX = dx * (distance - SEGMENT_SPACING) / distance;
            const moveY = dy * (distance - SEGMENT_SPACING) / distance;
            
            segment.x += moveX;
            segment.y += moveY;
            segment.mesh.position.set(segment.x, segment.y, 0);
        }
    }
    
    // Only send position to server if in online mode
    if (!offlineMode && socket) {
        const segments = player.segments.slice(1).map(segment => ({
            x: segment.x,
            y: segment.y
        }));
        
        socket.emit('playerMovement', {
            x: head.x,
            y: head.y,
            size: player.size,
            segments: segments
        });
    }
}

// Initialize the game when page loads
window.addEventListener('load', init); 