// mint-token.js
// Usage: node mint-token.js /path/to/service-account.json
// Outputs a single custom token string to stdout.

const admin = require('firebase-admin');
const fs = require('fs');

const svcPath = process.argv[2];
if (!svcPath) {
  console.error('Usage: node mint-token.js /path/to/service-account.json');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = require(svcPath);
} catch (err) {
  console.error('Failed to load service account JSON:', err.message || err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = `dev-user-${Date.now()}`;

admin.auth().createCustomToken(uid)
  .then((token) => {
    console.log(token);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to create custom token:', err.message || err);
    process.exit(1);
  });
