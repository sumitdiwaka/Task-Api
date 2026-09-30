const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(express.json());
app.use('/tasks', taskRoutes);

// Unknown routes -> JSON 404 (Express would otherwise send an HTML page).
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// FIX (BUG-6): this handler used to answer 500 for EVERYTHING, including a client
// sending malformed JSON (express.json() throws a 400-class error). Client mistakes
// must be reported as 4xx; only genuine server faults are 500.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task API running on port ${PORT}`);
  });
}

module.exports = app;
