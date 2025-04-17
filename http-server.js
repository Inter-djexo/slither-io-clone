const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server
http.createServer((req, res) => {
  console.log(`Request received: ${req.url}`);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  // Handle test endpoint
  if (req.url === '/test') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Basic HTTP server is working!');
    return;
  }
  
  // Default route - serve a simple HTML
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Basic HTTP Server</title>
    </head>
    <body>
      <h1>Basic HTTP Server</h1>
      <p>Server is running!</p>
    </body>
    </html>
  `);
}).listen(4444, '0.0.0.0', () => {
  console.log('Basic HTTP server running on port 4444');
}); 