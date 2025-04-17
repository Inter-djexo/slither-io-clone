const express = require('express');
const path = require('path');

const app = express();

// Set headers
app.use((req, res, next) => {
  console.log(`Request received: ${req.url}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Basic route for testing
app.get('/test', (req, res) => {
  res.send('High port server is working!');
});

// Default route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>High Port Server</title>
    </head>
    <body>
      <h1>High Port Server</h1>
      <p>Server is running!</p>
      <script>
        fetch('/test')
          .then(response => response.text())
          .then(data => {
            document.body.innerHTML += '<p>API Response: ' + data + '</p>';
          })
          .catch(error => {
            document.body.innerHTML += '<p>Error: ' + error.message + '</p>';
          });
      </script>
    </body>
    </html>
  `);
});

// Start server
const PORT = 48765;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`High port server running on port ${PORT}`);
}); 