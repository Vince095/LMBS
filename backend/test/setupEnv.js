// Test-only configuration. These values are random per run and never used outside tests.
const crypto = require('crypto');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.PSEUDONYM_SALT = crypto.randomBytes(32).toString('hex');
process.env.AUDIT_ENABLED = 'false';
process.env.INDEXER_ENABLED = 'false';
process.env.CHAIN_DEPLOYMENT_FILE = path.join(__dirname, 'fixtures', 'deployment.test.json');
process.env.DOCUMENT_STORE_DIR = path.join(os.tmpdir(), `lmbs-docs-${process.pid}`);
