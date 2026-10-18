const fs = require('fs');
const path = require('path');

const stray = [
  path.join(__dirname, 'powershell.cmd'),
  path.join(__dirname, "console.error('ERR")
];

stray.forEach(f => {
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log(`Deleted: ${f}`);
  }
});

