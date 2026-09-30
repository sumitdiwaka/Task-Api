const express = require('express');
const router = express.Router();
const taskService = require('../services/taskService');
const {
  validateCreateTask,
  validateUpdateTask,
  validateStatusQuery,
  parsePagination,
  validateAssign,
} = require('../utils/validators');

// NOTE: /stats must be declared before any "/:id" route or Express would treat
// "stats" as an id.
router.get('/stats', (req, res) => {
  const stats = taskService.getStats();
  res.json(stats);
});

router.get('/', (req, res) => {
  const { status, page, limit } = req.query;

  const statusError = validateStatusQuery(status);
  if (statusError) {
    return res.status(400).json({ error: statusError });
  }

  const paginationRequested = page !== undefined || limit !== undefined;

  // FIX (BUG-5): previously `if (status) return ...` ran first and page/limit were
  // ignored whenever a status filter was present. Now the two combine.
  if (paginationRequested) {
    const parsed = parsePagination({ page, limit });
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    return res.json(taskService.getPaginated(parsed.page, parsed.limit, status));
  }

  if (status) {
    return res.json(taskService.getByStatus(status));
  }

  res.json(taskService.getAll());
});

router.post('/', (req, res) => {
  const error = validateCreateTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.create(req.body);
  res.status(201).json(task);
});

router.put('/:id', (req, res) => {
  const error = validateUpdateTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.update(req.params.id, req.body);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

router.delete('/:id', (req, res) => {
  const deleted = taskService.remove(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.status(204).send();
});

router.patch('/:id/complete', (req, res) => {
  const task = taskService.completeTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

// NEW FEATURE: PATCH /tasks/:id/assign  { "assignee": "Alice" }
// Order of checks: 404 first (does the resource exist?), then 400 (is the body valid?).
router.patch('/:id/assign', (req, res) => {
  if (!taskService.findById(req.params.id)) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const error = validateAssign(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.assignTask(req.params.id, req.body.assignee);
  res.json(task);
});

module.exports = router;
