const http = require('http');

const payload = JSON.stringify({
  name: 'Bottle Local',
  description: 'Industrial high-voltage Bottle COCO masks',
  category: 'vision'
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/datasets',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response: ${body}`);
  });
});

req.write(payload);
req.end();

