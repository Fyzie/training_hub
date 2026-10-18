const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('--- 1. Testing Inventory ---');
  const invRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/inventory',
    method: 'GET'
  });
  console.log('Inventory items count:', invRes.data.length);
  invRes.data.forEach((item, idx) => {
    console.log(`[${idx}] Name: "${item.name}", Serial: "${item.serialNumber}", AssetTag: "${item.assetTag}", Qty: ${item.quantity}`);
  });

  console.log('\n--- 2. Testing Datasets GET ---');
  const dsRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/datasets',
    method: 'GET'
  });
  console.log('Current datasets count:', dsRes.data.length);
  if (dsRes.data.length > 0) {
    console.log('Sample dataset:', dsRes.data[0].id, dsRes.data[0].name);
  }

  console.log('\n--- 3. Testing Dataset POST & DELETE ---');
  const createRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/datasets',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Temporary Test Dataset',
    category: 'vision',
    description: 'Automated test dataset for delete verification'
  });
  console.log('Created dataset status:', createRes.status, 'ID:', createRes.data.id);

  if (createRes.data && createRes.data.id) {
    const delRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: `/api/datasets?id=${createRes.data.id}`,
      method: 'DELETE'
    });
    console.log('Delete dataset response:', delRes.status, delRes.data);
  }

  console.log('\nAll tests complete!');
}

run().catch(console.error);

