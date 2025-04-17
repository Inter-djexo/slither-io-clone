# Netlify Deployment Steps

When you're ready to deploy your Slither.io clone to Netlify, follow these steps:

## 1. Prepare the Project

1. Make sure your game works correctly locally
2. Run `npm run build` to build the project
3. Test that the build works correctly

## 2. Set Up Netlify 

1. Create a Netlify account if you don't have one (https://app.netlify.com/signup)
2. Log into your Netlify account

## 3. Deploy the Frontend (Static Files)

1. Go to the Netlify dashboard and click "Add new site" > "Deploy manually"
2. Drag and drop your `public` folder to the upload area
3. Wait for the upload to complete
4. Your site will be live at a random Netlify subdomain (e.g., https://your-site-123456.netlify.app)

## 4. Configure Custom Domain (Optional)

1. Go to "Site settings" > "Domain management"
2. Click on "Add custom domain"
3. Follow the steps to set up your custom domain

## 5. Set Up Backend Server 

For the backend Socket.io server:

1. Create a separate repository for your server code
2. Deploy the server to a service like Heroku, Railway, Render or Digital Ocean
3. Update the client Socket.io connection URL in your game.js to use the deployed server URL

```javascript
// In game.js
socket = io('https://your-server-url.herokuapp.com', {
    reconnectionAttempts: 5,
    timeout: 10000,
    transports: ['websocket', 'polling']
});
```

4. Redeploy your frontend to Netlify

## 6. Test the Live Site

1. Test your game on the live Netlify site
2. Make sure Socket.io connections are working
3. Test with multiple players 