const express = require('express');
const path = require('path');

const app = express();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Basic route for testing
app.get('/test', (req, res) => {
  res.send('Simple server is working!');
});

// Start server
const PORT = 3333;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Simple server running on port ${PORT}`);
}); 