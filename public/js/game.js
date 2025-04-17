// At the beginning of the file
// Check if THREE is available, if not inject it as a fallback
if (typeof THREE === 'undefined') {
    console.warn("THREE.js library not detected, attempting to load fallback...");
    
    try {
        // Create a script element to inject the fallback
        const threeScript = document.createElement('script');
        threeScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
        threeScript.async = true;
        
        // Add load event listener
        threeScript.addEventListener('load', function() {
            console.log("Fallback THREE.js loaded successfully!");
            if (typeof init === 'function') {
                setTimeout(init, 200);
            }
        });
        
        // Add error event listener
        threeScript.addEventListener('error', function(e) {
            console.error("Failed to load fallback THREE.js:", e);
            alert("Could not load necessary game libraries. Please check your internet connection and try again.");
        });
        
        // Append the script to the head
        document.head.appendChild(threeScript);
        
    } catch (error) {
        console.error("Error setting up fallback:", error);
    }
}

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
let isConnectedToServer = false;
let isOfflineMode = false;
let connectionTimeout = null;
let playerId = null;

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

// Add these variable declarations at the top with the other game variables
let playerName = "Anonymous Snake";
let playerColor = "#" + Math.floor(Math.random() * 16777215).toString(16);

// Near the top with other game variables, add these performance settings
const PERFORMANCE = {
    CULLING_DISTANCE: 1500,       // Only render objects within this distance
    UPDATE_THROTTLE: 120,         // Milliseconds between position updates
    FOOD_LIMIT: 100               // Maximum visible food items
};

// Add a performance monitor function
let lastFrameTime = 0;
let frameCount = 0;
let fps = 0;
let lastFpsUpdate = 0;
// Timing for network updates
let lastUpdateTime = 0;

function updatePerformanceStats(now) {
    // Calculate FPS
    frameCount++;
    
    if (now - lastFpsUpdate >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
        
        // Log FPS to console every 5 seconds
        if (now % 5000 < 1000) {
            console.log(`Current FPS: ${fps}`);
        }
        
        // Automatically adjust detail level based on FPS
        if (fps < 30 && !PERFORMANCE_SETTINGS.LOW_DETAIL_MODE) {
            console.log("FPS is low, enabling low detail mode");
            PERFORMANCE_SETTINGS.LOW_DETAIL_MODE = true;
            applyDetailLevel();
        } else if (fps > 50 && PERFORMANCE_SETTINGS.LOW_DETAIL_MODE) {
            console.log("FPS is good, disabling low detail mode");
            PERFORMANCE_SETTINGS.LOW_DETAIL_MODE = false;
            applyDetailLevel();
        }
    }
    
    return now;
}

function applyDetailLevel() {
    // Apply detail level changes to renderer
    if (PERFORMANCE_SETTINGS.LOW_DETAIL_MODE) {
        // Lower quality settings
        renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1 : window.devicePixelRatio);
        renderer.shadowMap.enabled = false;
        
        // Reduce visible food
        PERFORMANCE_SETTINGS.MAX_VISIBLE_FOOD = 50;
    } else {
        // Higher quality settings
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        
        // More visible food
        PERFORMANCE_SETTINGS.MAX_VISIBLE_FOOD = 100;
    }
}

// Add this function after setupThreeJS or before animate
function optimizeRendering() {
    // Optimize renderer
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    renderer.shadowMap.enabled = false;
    
    // Reduce shadow quality for better performance
    scene.traverse(obj => {
        if (obj.isMesh) {
            obj.castShadow = false;
            obj.receiveShadow = false;
        }
    });
    
    console.log("Applied performance optimizations");
}

// Replace the animate function with this optimized version
function animate() {
    requestAnimationFrame(animate);
    
    // Skip rendering if tab is not visible
    if (document.hidden) return;
    
    // Update player if controls are enabled
    if (controlsEnabled && player.segments && player.segments.length > 0) {
        updatePlayer();
    }
    
    // Only update other players if not in offline mode
    if (!offlineMode && otherPlayers) {
        updateOtherPlayers();
    }
    
    // Update environment effects - pulse star colors, nebula movement, etc.
    updateEnvironmentEffects();
    
    // Update minimap
    if (minimap) {
        updateMinimap();
    }
    
    // Apply distance culling to improve performance
    cullDistantObjects();
    
    // Render the scene
    renderer.render(scene, camera);
}

// Add this function for object culling
function cullDistantObjects() {
    if (!player.segments || player.segments.length === 0) return;
    
    const playerPos = new THREE.Vector3(
        player.segments[0].x,
        player.segments[0].y,
        0
    );
    
    // Cull distant food
    let visibleFoodCount = 0;
    for (const foodId in foodItems) {
        if (!foodItems[foodId] || !foodItems[foodId].mesh) continue;
        
        const food = foodItems[foodId];
        const foodPos = new THREE.Vector3(food.x, food.y, 0);
        const distance = foodPos.distanceTo(playerPos);
        
        // Only show food that's close enough and limit the total number
        if (distance < PERFORMANCE.CULLING_DISTANCE && visibleFoodCount < PERFORMANCE.FOOD_LIMIT) {
            food.mesh.visible = true;
            visibleFoodCount++;
        } else {
            food.mesh.visible = false;
        }
    }
    
    // Cull distant players
    for (const id in otherPlayers) {
        if (!otherPlayers[id] || !otherPlayers[id].segments) continue;
        
        const otherPlayer = otherPlayers[id];
        // Use first segment position for distance check
        if (otherPlayer.segments.length > 0) {
            const otherPos = new THREE.Vector3(
                otherPlayer.segments[0].x,
                otherPlayer.segments[0].y,
                0
            );
            const distance = otherPos.distanceTo(playerPos);
            
            // Set visibility based on distance
            otherPlayer.segments.forEach(segment => {
                if (segment.mesh) {
                    segment.mesh.visible = distance < PERFORMANCE.CULLING_DISTANCE;
                }
            });
            
            // Also handle name labels
            if (otherPlayer.nameLabel) {
                otherPlayer.nameLabel.visible = distance < PERFORMANCE.CULLING_DISTANCE;
            }
        }
    }
}

// Optimize player update function for performance
function updatePlayer() {
    if (!controlsEnabled || player.segments.length === 0) return;
    
    // Calculate direction based on mouse position
    const direction = new THREE.Vector2(
        (mouse.x / window.innerWidth) * 2 - 1,
        -(mouse.y / window.innerHeight) * 2 + 1
    );
    
    // Normalize direction
    direction.normalize();
    
    // Update head position
    const head = player.segments[0];
    const newX = head.x + direction.x * SNAKE_SPEED;
    const newY = head.y + direction.y * SNAKE_SPEED;
    
    // Check if new position is within bounds
    if (Math.abs(newX) < worldSize / 2 && Math.abs(newY) < worldSize / 2) {
        head.x = newX;
        head.y = newY;
        head.mesh.position.set(head.x, head.y, 0);
        
        // Update name label position
        if (head.nameLabel) {
            head.nameLabel.position.set(head.x, head.y + 40, 0);
        }
    }
    
    // Update camera position to follow head
    camera.position.set(head.x, head.y, camera.position.z);
    
    // Update tail segments
    for (let i = 1; i < player.segments.length; i++) {
        const segment = player.segments[i];
        const prevSegment = player.segments[i - 1];
        
        // Direction to previous segment
        const dx = prevSegment.x - segment.x;
        const dy = prevSegment.y - segment.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Only move if distance is greater than spacing
        if (dist > SEGMENT_SPACING) {
            const moveX = dx * (1 - SEGMENT_SPACING / dist);
            const moveY = dy * (1 - SEGMENT_SPACING / dist);
            
            segment.x += moveX;
            segment.y += moveY;
            segment.mesh.position.set(segment.x, segment.y, 0);
        }
    }
    
    // Check for collisions with food
    checkFoodCollisions();
    
    // Check for collisions with other players
    checkPlayerCollisions();
    
    // Check for boundary crossing
    checkBoundary();
    
    // Update the display of current length
    updateScore();
    
    // Send position to server if online - throttle updates for performance
    const currentTime = Date.now();
    if (socket && socket.connected && !offlineMode && currentTime - lastUpdateTime > PERFORMANCE.UPDATE_THROTTLE) {
        lastUpdateTime = currentTime;
        
        socket.emit('playerUpdate', {
            id: socket.id,
            x: head.x,
            y: head.y,
            size: player.size,
            // Only send first few segments to reduce network load
            segments: player.segments.slice(0, 5).map(s => ({ x: s.x, y: s.y }))
        });
    }
}

// Optimize how food is displayed based on distance from player
function updateFoodVisibility() {
    if (!player.segments || player.segments.length === 0) return;
    
    const playerPos = new THREE.Vector3(player.segments[0].x, player.segments[0].y, 0);
    let visibleCount = 0;
    
    // Sort food by distance to player
    const sortedFood = Object.values(foodItems).sort((a, b) => {
        const distA = new THREE.Vector3(a.x, a.y, 0).distanceTo(playerPos);
        const distB = new THREE.Vector3(b.x, b.y, 0).distanceTo(playerPos);
        return distA - distB;
    });
    
    // Show closest food, hide distant food
    sortedFood.forEach((food, index) => {
        if (index < PERFORMANCE_SETTINGS.MAX_VISIBLE_FOOD) {
            food.mesh.visible = true;
            visibleCount++;
        } else {
            food.mesh.visible = false;
        }
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
    
    // Get player name or use default
    const nameInput = document.getElementById('player-name');
    playerName = nameInput.value.trim() || "Anonymous Snake";
    console.log("Player name:", playerName);
    
    // Generate random color if not already set
    if (!playerColor) {
        playerColor = "#" + Math.floor(Math.random() * 16777215).toString(16);
    }
    console.log("Player color:", playerColor);
    
    // Hide start screen
    startScreen.style.display = 'none';
    
    // Show game UI
    gameUI.style.display = 'block';
    
    // Enable controls
    controlsEnabled = true;
    
    // Create player and connect to server if not already connected
    if (!isConnectedToServer) {
        connectToServer();
    } else {
        // If already connected, just create player
        createPlayerSnake();
    }
    
    gameStarted = true;
}

// Connect to Socket.io server
function connectToServer() {
    // Detailed connection logging
    console.log("====== CONNECTION ATTEMPT LOG ======");
    console.log("Current hostname:", window.location.hostname);
    console.log("Current URL:", window.location.href);
    
    // Use the server URL defined in index.html or fall back to the render.com URL
    const serverUrl = window.SERVER_URL || 'https://slither-io-clone.onrender.com';
    console.log(`Attempting to connect to server at: ${serverUrl}`);
    
    // Force the loading screen to disappear after 10 seconds no matter what
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen && loadingScreen.style.display !== 'none') {
            console.log("Force-hiding loading screen after timeout");
            loadingScreen.style.display = 'none';
            
            // If not connected, go to offline mode
            if (!isConnectedToServer) {
                console.log("Server connection timed out, enabling offline mode");
                enableOfflineMode("Connection timed out");
            }
        }
    }, 10000);
    
    // Try to connect even if we're on the Render domain
    try {
        // Get or create connection indicator
        const connectionIndicator = document.getElementById('connection-indicator');
        if (connectionIndicator) {
            connectionIndicator.className = 'checking';
            connectionIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        }
        
        // Remove any existing socket to prevent duplicates
        if (socket) {
            console.log("Cleaning up existing socket connection");
            socket.disconnect();
            socket = null;
        }
        
        // Create socket with explicit configuration
        console.log("Creating socket.io instance...");
        socket = io.connect(serverUrl, {
            reconnectionAttempts: 3,
            reconnectionDelay: 1000,
            timeout: 5000, // Reduced timeout for faster fallback
            transports: ['websocket', 'polling'], // Try websocket first
            forceNew: true,
            autoConnect: true,
            query: { 
                clientVersion: '1.0.4', 
                origin: window.location.hostname,
                timestamp: Date.now() // Add timestamp to prevent caching issues
            }
        });

        console.log("Socket.io instance created:", socket ? "success" : "failed");
        
        // Set connection timeout - server must respond within 10 seconds
        connectionTimeout = setTimeout(() => {
            if (!isConnectedToServer) {
                console.error("Connection timed out after 5 seconds");
                showConnectionError("Connection timed out - server may be down");
                
                // Force offline mode
                console.log("Enabling offline mode due to timeout");
                enableOfflineMode("Connection timed out");
            }
        }, 5000);
        
        // Connection established
        socket.on('connect', () => {
            console.log("✅ CONNECTED TO SERVER!");
            console.log("Socket ID:", socket.id);
            
            // Clear timeout
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
            
            // Update UI
            isConnectedToServer = true;
            isOfflineMode = false;
            offlineMode = false;
            
            // Update connection indicator
            if (connectionIndicator) {
                connectionIndicator.className = 'online';
                connectionIndicator.innerHTML = '<i class="fas fa-wifi"></i> Online Mode';
            }
            
            // Hide loading screen
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
            
            // Continue with game setup
            console.log("Sending new player info to server...");
            
            // Create player snake if needed
            if (!player.segments || player.segments.length === 0) {
                createPlayerSnake();
            }
            
            // Make sure playerName and playerColor are defined
            const name = typeof playerName !== 'undefined' ? playerName : 'Anonymous Snake';
            const color = typeof playerColor !== 'undefined' ? playerColor : '#' + Math.floor(Math.random() * 16777215).toString(16);
            
            console.log(`Emitting newPlayer event with name: ${name}, color: ${color}`);
            
            // Send player info to server
            socket.emit('newPlayer', {
                name: name,
                color: color
            });
        });
        
        // Connection error
        socket.on('connect_error', (error) => {
            console.error("❌ CONNECTION ERROR:", error);
            showConnectionError("Connection error: " + error.message);
            
            // Force offline mode after connection error
            console.log("Enabling offline mode after connection error");
            enableOfflineMode("Connection error: " + error.message);
        });
        
        // Handle other events
        setupPlayerEventHandlers();
        
    } catch (error) {
        console.error("❌ CRITICAL CONNECTION ERROR:", error);
        showConnectionError("Critical error: " + error.message);
        
        // Force offline mode after critical error
        console.log("Enabling offline mode after critical connection error");
        enableOfflineMode("Critical connection error");
    }
}

// Set up all the player-related events from the server
function setupPlayerEventHandlers() {
    if (!socket) return;
    
    // Store your own player ID
    socket.on('yourId', (id) => {
        console.log('Received my player ID:', id);
        playerId = id;
    });
    
    // New player joined
    socket.on('newPlayer', (playerData) => {
        console.log('New player joined:', playerData);
        
        // Check if this player is yourself - don't create duplicate
        if (playerData.id === socket.id) {
            console.log('This is my own player data, not creating duplicate');
            return;
        }
        
        // Check if player already exists 
        if (otherPlayers[playerData.id]) {
            console.log('Player already exists, updating:', playerData.id);
            updateOtherPlayer(playerData.id, playerData);
        } else {
            console.log('Creating new player:', playerData.id);
            createOtherPlayer(playerData.id, playerData);
        }
    });
    
    // Player moved
    socket.on('playerMoved', (playerData) => {
        // Skip if it's our own player
        if (playerData.id === socket.id) return;
        
        updateOtherPlayer(playerData.id, playerData);
    });
    
    // Food update
    socket.on('foodUpdate', (foodData) => {
        console.log('Food update received:', foodData);
        updateFood(foodData);
    });
    
    // Player killed
    socket.on('playerKilled', (playerId) => {
        if (playerId === socket.id) {
            handleDeath();
        } else {
            removeOtherPlayer(playerId);
        }
    });
    
    // Player disconnected
    socket.on('playerDisconnect', (playerId) => {
        console.log('Player disconnected:', playerId);
        removeOtherPlayer(playerId);
    });
    
    // Force position (anti-cheat)
    socket.on('forcePosition', (positionData) => {
        if (player && player.segments && player.segments.length > 0) {
            const head = player.segments[0];
            head.mesh.position.set(positionData.x, positionData.y, 0);
            head.x = positionData.x;
            head.y = positionData.y;
            camera.position.set(positionData.x, positionData.y, camera.position.z);
        }
    });
    
    // Initial game state
    socket.on('gameState', (data) => {
        console.log('Received initial game state:', data);
        
        // Initialize other players
        if (data.players) {
            console.log('Players in gameState:', Object.keys(data.players));
            
            for (const id in data.players) {
                if (id !== socket.id) {
                    console.log('Creating other player from gameState:', id);
                    createOtherPlayer(id, data.players[id]);
                }
            }
        }
        
        // Initialize food
        if (data.food && data.food.length > 0) {
            console.log(`Initializing ${data.food.length} food items`);
            for (const foodItem of data.food) {
                createFood(foodItem);
            }
        }
    });
    
    // Receive player list (manual refresh)
    socket.on('playerList', (players) => {
        console.log('Received player list:', players);
        syncOtherPlayers(players);
    });
    
    // Receive player sync (periodic refresh)
    socket.on('syncPlayers', (players) => {
        console.log('Syncing players:', players);
        syncOtherPlayers(players);
    });
    
    // Player count update
    socket.on('playerCount', (count) => {
        console.log('Online players:', count);
    });
    
    // Start the heartbeat
    startHeartbeat();
}

// Synchronize other players with server data
function syncOtherPlayers(serverPlayers) {
    if (!serverPlayers) return;
    
    // Track players we've processed
    const processedIds = new Set();
    
    // Add or update players from server
    for (const id in serverPlayers) {
        // Skip our own player
        if (id === socket.id) continue;
        
        processedIds.add(id);
        
        // Update existing player or create new one
        if (otherPlayers[id]) {
            updateOtherPlayer(id, serverPlayers[id]);
        } else {
            createOtherPlayer(id, serverPlayers[id]);
        }
    }
    
    // Remove players that are in our list but not in server's list
    for (const id in otherPlayers) {
        if (!processedIds.has(id)) {
            console.log(`Removing stale player: ${id}`);
            removeOtherPlayer(id);
        }
    }
}

// Send heartbeat to server
function startHeartbeat() {
    // Clear any existing heartbeat
    if (window.heartbeatInterval) {
        clearInterval(window.heartbeatInterval);
    }
    
    // Send heartbeat every 3 seconds
    window.heartbeatInterval = setInterval(() => {
        if (socket && socket.connected) {
            socket.emit('heartbeat');
            
            // Every 10 seconds, request full player list
            if (!window.lastFullSync || Date.now() - window.lastFullSync > 10000) {
                window.lastFullSync = Date.now();
                console.log("Requesting full player list");
                socket.emit('getPlayers');
            }
        }
    }, 3000);
}

// Update player function in the animation loop
function updatePlayer() {
    if (!controlsEnabled || player.segments.length === 0) return;
    
    // Calculate direction based on mouse position
    const direction = new THREE.Vector2(
        (mouse.x / window.innerWidth) * 2 - 1,
        -(mouse.y / window.innerHeight) * 2 + 1
    );
    
    // Normalize direction
    direction.normalize();
    
    // Update head position
    const head = player.segments[0];
    const newX = head.x + direction.x * SNAKE_SPEED;
    const newY = head.y + direction.y * SNAKE_SPEED;
    
    // Check if new position is within bounds
    if (Math.abs(newX) < worldSize / 2 && Math.abs(newY) < worldSize / 2) {
        head.x = newX;
        head.y = newY;
        head.mesh.position.set(head.x, head.y, 0);
        
        // Update name label position
        if (head.nameLabel) {
            head.nameLabel.position.set(head.x, head.y + 40, 0);
        }
    }
    
    // Update camera position to follow head
    camera.position.set(head.x, head.y, camera.position.z);
    
    // Update tail segments
    for (let i = 1; i < player.segments.length; i++) {
        const segment = player.segments[i];
        const prevSegment = player.segments[i - 1];
        
        // Direction to previous segment
        const dx = prevSegment.x - segment.x;
        const dy = prevSegment.y - segment.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Only move if distance is greater than spacing
        if (dist > SEGMENT_SPACING) {
            const moveX = dx * (1 - SEGMENT_SPACING / dist);
            const moveY = dy * (1 - SEGMENT_SPACING / dist);
            
            segment.x += moveX;
            segment.y += moveY;
            segment.mesh.position.set(segment.x, segment.y, 0);
        }
    }
    
    // Check for collisions with food
    checkFoodCollisions();
    
    // Check for collisions with other players
    checkPlayerCollisions();
    
    // Check for boundary crossing
    checkBoundary();
    
    // Update the display of current length
    updateScore();
    
    // Send position to server if online - throttle updates for performance
    const currentTime = Date.now();
    if (socket && socket.connected && !offlineMode && currentTime - lastUpdateTime > PERFORMANCE.UPDATE_THROTTLE) {
        lastUpdateTime = currentTime;
        
        socket.emit('playerUpdate', {
            id: socket.id,
            x: head.x,
            y: head.y,
            size: player.size,
            // Only send first few segments to reduce network load
            segments: player.segments.slice(0, 5).map(s => ({ x: s.x, y: s.y }))
        });
    }
}

// Show connection error and enable offline mode
function showConnectionError(errorMsg) {
    console.error(`Connection error: ${errorMsg}`);
    
    // Clear timeout if set
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    
    // Update state
    isConnectedToServer = false;
    isOfflineMode = true;
    
    // Create an error overlay
    const errorEl = document.createElement('div');
    errorEl.className = 'connection-error';
    errorEl.innerHTML = `
        <div class="error-content">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Could not connect to server</h3>
            <p>${errorMsg}</p>
            <p>Playing in offline mode instead.</p>
            <button id="offline-continue">Continue in Offline Mode</button>
        </div>
    `;
    document.body.appendChild(errorEl);
    
    // Update connection indicator
    const connectionIndicator = document.getElementById('connection-indicator');
    if (connectionIndicator) {
        connectionIndicator.className = 'offline';
        connectionIndicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline Mode';
    }
    
    // Hide loading screen
    document.getElementById('loading-screen').style.display = 'none';
    
    // When continue button is clicked
    document.getElementById('offline-continue').addEventListener('click', () => {
        errorEl.style.display = 'none';
        enableOfflineMode();
    });
}

// New function to handle connection failures
function handleConnectionFailure(reason) {
    console.warn(`Connection failure: ${reason}`);
    
    // Clear the timeout if it exists
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    
    // Update UI to show offline mode
    const connectionIndicator = document.getElementById('connection-indicator');
    if (connectionIndicator) {
        connectionIndicator.className = 'offline';
        connectionIndicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline Mode';
    }
    
    const connectionMessage = document.querySelector('.connection-message');
    if (connectionMessage) {
        connectionMessage.innerHTML = `You're playing in offline mode (${reason}). To play multiplayer with other players, visit <a href="${serverUrl}" target="_blank">the multiplayer server</a> directly.`;
    }
    
    // Enable offline mode
    enableOfflineMode(reason);
    
    // Hide loading screen if visible
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.style.display = 'none';
}

// Function to generate food for offline mode
function generateOfflineFood() {
    // Generate random position within world bounds
    const x = (Math.random() * 2 - 1) * worldSize * 0.4; // 40% of world size for better visibility
    const y = (Math.random() * 2 - 1) * worldSize * 0.4;
    
    // Generate random color
    const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    
    // Create food data
    const foodId = 'offline-food-' + Math.random().toString(36).substring(2, 9);
    const foodData = {
        id: foodId,
        x: x,
        y: y,
        size: FOOD_SIZE * 2, // Make food larger in offline mode for better visibility
        color: color
    };
    
    // Create the food mesh and add it to the scene
    createFood(foodData);
    
    return foodData;
}

// Create a food item in the scene
function createFood(foodData) {
    // Create geometry and material for food
    const foodGeometry = new THREE.SphereGeometry(foodData.size || FOOD_SIZE, 16, 16);
    
    // Check if color is provided, otherwise use a default
    let foodColor = foodData.color || '#ffffff';
    if (foodColor.charAt(0) !== '#') {
        foodColor = '#' + foodColor;
    }
    
    // Add some glow to food
    const foodMaterial = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color(foodColor),
        transparent: true,
        opacity: 0.9
    });
    
    // Create mesh
    const foodMesh = new THREE.Mesh(foodGeometry, foodMaterial);
    foodMesh.position.set(foodData.x, foodData.y, 0);
    
    // Add a small random animation offset for each food
    foodMesh.userData.animationOffset = Math.random() * Math.PI * 2;
    
    // Add pulsing glow effect
    const glowGeometry = new THREE.SphereGeometry(foodData.size * 1.5 || FOOD_SIZE * 1.5, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(foodColor),
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    foodMesh.add(glowMesh);
    
    // Add to scene
    scene.add(foodMesh);
    
    // Store food data
    const food = {
        id: foodData.id,
        x: foodData.x,
        y: foodData.y,
        size: foodData.size || FOOD_SIZE,
        color: foodColor,
        mesh: foodMesh,
        glow: glowMesh
    };
    
    // Add to food items array
    foodItems.push(food);
    
    return food;
}

// Clear all food and regenerate for offline mode
function clearAndRegenerateFood(count) {
    console.log(`Clearing all food and regenerating ${count} items`);
    
    // Remove all existing food
    for (let i = foodItems.length - 1; i >= 0; i--) {
        if (foodItems[i] && foodItems[i].mesh) {
            scene.remove(foodItems[i].mesh);
        }
    }
    
    // Clear the array
    foodItems = [];
    
    // Generate new food
    for (let i = 0; i < count; i++) {
        generateOfflineFood();
    }
    
    console.log(`Generated ${foodItems.length} food items for offline mode`);
}

// Enable offline mode with a fallback experience
function enableOfflineMode(reason) {
    console.log("Enabling offline mode:", reason);
    
    // Set offline mode flag
    offlineMode = true;
    isOfflineMode = true;
    isConnectedToServer = false;
    
    // Update the connection indicator
    const connectionIndicator = document.getElementById('connection-indicator');
    if (connectionIndicator) {
        connectionIndicator.className = 'offline';
        connectionIndicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline Mode';
    }
    
    // Update connection message
    const connectionMessage = document.querySelector('.connection-message');
    if (connectionMessage) {
        connectionMessage.innerHTML = `Playing in offline mode (${reason}). You can still enjoy the game, but won't see other players.`;
    }
    
    // Hide loading screen if it's still visible
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }
    
    // Check if player already exists, if not create one
    if (!player.segments || player.segments.length === 0) {
        console.log("Creating player for offline mode");
        createPlayerSnake();
    }
    
    // Generate food if none exists
    console.log("Checking food for offline mode");
    if (!foodItems || (Array.isArray(foodItems) && foodItems.length === 0) || 
        (!Array.isArray(foodItems) && Object.keys(foodItems).length === 0)) {
        console.log("Generating offline food");
        clearAndRegenerateFood(200);
    }
    
    // Create offline AI snakes for the player to interact with
    clearAISnakes();
    for (let i = 0; i < 5; i++) {
        createAISnake();
    }
    
    // Show a message to the user
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `
        <div class="notification-content">
            <h3>Offline Mode Activated</h3>
            <p>${reason}</p>
            <p>You can still play, but won't see other players.</p>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Remove the notification after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 1000);
    }, 5000);
    
    console.log("Offline mode enabled successfully");
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
function updateEnvironmentEffects() {
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

// Initialize the game when page loads
window.addEventListener('load', init);

// At the beginning of the file - after existing variables
// Initialize the game once when DOM is ready
window.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, initializing game...');
    
    // Initialize game if not already initialized
    if (!window.gameInitialized) {
        init();
        window.gameInitialized = true;
        
        // Try to connect to the server immediately
        setTimeout(function() {
            connectToServer();
        }, 500);
    }
}); 

// Add the checkFoodCollisions function
function checkFoodCollisions() {
    if (!player.segments || player.segments.length === 0) return;
    
    const headX = player.segments[0].x;
    const headY = player.segments[0].y;
    
    // Array-like object handling for both array and object formats of foodItems
    const foodArray = Array.isArray(foodItems) ? foodItems : Object.values(foodItems);
    
    for (let i = foodArray.length - 1; i >= 0; i--) {
        const food = foodArray[i];
        if (!food || !food.mesh) continue;
        
        const distance = Math.sqrt(
            Math.pow(headX - food.x, 2) + 
            Math.pow(headY - food.y, 2)
        );
        
        // Check if distance is less than sum of snake head size and food size
        if (distance < player.size + (food.size || 10)) {
            // Player ate food
            
            // Increase player size and add segment
            player.size += 1;
            player.score += 10;
            
            // Update score display
            updateScore();
            
            // Add segment if not at max
            if (player.segments.length < MAX_SEGMENTS) {
                addSegment();
            }
            
            // If online mode, tell server about eaten food
            if (socket && socket.connected && !offlineMode) {
                socket.emit('eatFood', food.id);
            } else {
                // Remove food locally in offline mode
                scene.remove(food.mesh);
                
                // Remove from foodItems array/object
                if (Array.isArray(foodItems)) {
                    foodItems.splice(i, 1);
                } else {
                    delete foodItems[food.id];
                }
                
                // Generate new food in offline mode
                if (offlineMode) {
                    const newFood = generateOfflineFood(1)[0];
                    createFood(newFood);
                }
            }
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
            console.error("THREE.js is not loaded! Waiting for fallback to load...");
            // The fallback script will call init() again after loading
            return;
        }
        
        // Set up Three.js
        setupThreeJS();
        
        // Apply performance optimizations
        if (typeof optimizeRendering === 'function') {
            optimizeRendering();
        }
        
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
        alert("Error initializing game: " + error.message + "\n\nPlease try refreshing the page.");
    }
} 