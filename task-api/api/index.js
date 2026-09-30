// Vercel serverless entrypoint.
// Vercel treats any exported (req, res) handler in /api as a function,
// and an Express app instance satisfies that same signature.
const app = require('../src/app');
module.exports = app;
