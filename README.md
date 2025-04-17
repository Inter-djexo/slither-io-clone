# Cosmic Snake - Multiplayer Slither.io Clone

A real-time multiplayer snake game inspired by Slither.io, built with Express, Socket.IO, and Three.js.

![Cosmic Snake Game](https://github.com/Inter-djexo/slither-io-clone/blob/main/screenshot.png)

## Live Demo

- Frontend: [https://slither-io.netlify.app](https://slither-io.netlify.app)
- Backend: [https://slither-io-clone.onrender.com](https://slither-io-clone.onrender.com)

## Features

- Real-time multiplayer gameplay
- Beautiful cosmic-themed visuals with WebGL
- Responsive design works on desktop and mobile
- Smooth animations and controls
- Minimap to navigate the game world
- Leaderboard to track top players
- Offline mode for single-player gameplay

## How to Play

1. Enter your name and click "Launch Game" or "Play as Guest"
2. Move your mouse to control your snake's direction
3. Collect glowing orbs to grow larger
4. Avoid collisions with other snakes - if your head hits another snake, you die
5. Try to trap other players and make them crash into you
6. Stay within the red boundary

## Technology Stack

- **Frontend**: 
  - Three.js for WebGL rendering
  - Socket.IO client for real-time communication
  - Vanilla JavaScript with no frameworks

- **Backend**:
  - Node.js with Express
  - Socket.IO for WebSockets
  - Game logic handled on server side

## Running Locally

1. Clone the repository:
```
git clone https://github.com/Inter-djexo/slither-io-clone.git
cd slither-io-clone
```

2. Install dependencies:
```
npm install
```

3. Start the server:
```
npm start
```

4. Open your browser and navigate to:
```
http://localhost:48765
```

## Deployment

### Deploying to Netlify (Frontend)

1. Sign up for Netlify
2. Connect your GitHub repository
3. Set the build command to: (none required)
4. Set the publish directory to: `public`
5. Deploy!

### Deploying to Render.com (Backend)

1. Sign up for Render.com
2. Create a new Web Service
3. Connect your GitHub repository
4. Set the build command to: `npm install`
5. Set the start command to: `node server.js`
6. Deploy!

## Project Structure

- `/public` - Frontend static files
  - `/js` - JavaScript files
  - `/libs` - Third-party libraries
  - `index.html` - Main HTML file
  - `style.css` - CSS styles
- `server.js` - Main server file with game logic
- `package.json` - Project dependencies

## Credits

- Background music: "Tranquility" (royalty-free)
- Original game concept inspired by Slither.io
- Space textures and effects created programmatically

## License

MIT License 