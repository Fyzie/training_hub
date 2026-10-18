const http = require('http');

const payload = JSON.stringify({
  name: 'Bottle COCO',
  roboflowSnippet: `from roboflow import Roboflow
rf = Roboflow(api_key="TEST_API_KEY_MOCK")
project = rf.workspace("sample-ws").project("power-cables")
version = project.version(1)
dataset = version.download("coco")`
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

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(payload);
req.end();

