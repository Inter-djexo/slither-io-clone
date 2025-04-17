# Slither.io Clone

A multiplayer browser-based game inspired by Slither.io, built with Express, Socket.io, and Three.js.

## Deployment Instructions

### Frontend Deployment (Netlify)

1. Upload the `public` folder to Netlify through the Netlify dashboard
2. Configure the site settings as needed
3. Deploy the site

### Backend Deployment (Render.com)

1. Create a Render.com account
2. Connect your GitHub repository to Render
3. Create a new Web Service with the following settings:
   - **Name**: slither-io-clone-backend (or your preferred name)
   - **Environment**: Node
   - **Build Command**: npm install
   - **Start Command**: node server.js
   - **Plan**: Free

4. Render will automatically detect the `render.yaml` configuration file and set up the service

### Connecting Frontend to Backend

The game's client-side code is configured to automatically detect whether it's running in a local or production environment and will connect to the appropriate backend server:

- Local: Connects to localhost:48765
- Production: Connects to your Render.com backend URL

## Local Development

1. Clone the repository
2. Install dependencies with `npm install`
3. Start the server with `node server.js` or `npm start`
4. Open your browser to `http://localhost:48765`

## Game Features

- Multiplayer real-time gameplay
- Dynamic growth mechanics
- Customizable snake appearance
- Leaderboard
- Background music
- Minimap
- Anti-cheat protection
- Boundary visualization

## Technologies Used

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML5, CSS3, JavaScript, Three.js
- **Deployment**: Netlify (frontend), Render.com (backend)

## Features

- Real-time multiplayer gameplay
- Grow your snake by collecting food
- Compete with other players to become the largest
- Leaderboard to track top players
- Collision detection
- High score tracking with Firebase

## Tech Stack

- **Frontend**: Three.js for rendering the game world
- **Backend**: Node.js with Express
- **Real-time Communication**: Socket.io for player movements and game state
- **Database**: Firebase for user authentication and high score storage
- **Hosting**: Netlify for frontend deployment

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd slither-io-clone
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure Firebase:
   - Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Enable Anonymous Authentication
   - Enable Realtime Database
   - Update the Firebase configuration in `public/js/firebase-config.js` with your Firebase project details

4. Start the development server:
   ```
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Deployment

### Frontend (Netlify)

1. Build the client files:
   ```
   npm run build
   ```

2. Deploy the `public` directory to Netlify

### Backend (Heroku, Railway, etc.)

1. Deploy the Node.js server to your preferred hosting service
2. Make sure to set the appropriate environment variables

## Game Controls

- **Mouse Movement**: Control the direction of your snake
- **Goal**: Collect food to grow and eliminate other players by making them run into your body

## License

MIT

## Credits

This game is inspired by the original [Slither.io](http://slither.io/) game. 