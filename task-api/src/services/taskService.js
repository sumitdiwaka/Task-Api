/**
 * Business logic + in-memory data store.
 *
 * NOTE: `tasks` is module-level state, so data is lost on restart.
 * Functions return COPIES of tasks (see `clone`) so callers can never
 * mutate the store by accident (BUG-7).
 */
const { v4: uuidv4 } = require('uuid');

let tasks = [];

// Fields a client is allowed to change through update(). Everything else
// (id, createdAt, completedAt, assignee, unknown keys) is server-controlled. (BUG-4)
const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'dueDate'];

const clone = (task) => ({ ...task });

const getAll = () => tasks.map(clone);

const findById = (id) => {
  const task = tasks.find((t) => t.id === id);
  return task ? clone(task) : undefined;
};

// FIX (BUG-2): was `t.status.includes(status)` -> substring match, so
// "do" matched both "todo" and "done". Exact comparison is what a filter means.
const getByStatus = (status) => tasks.filter((t) => t.status === status).map(clone);

// FIX (BUG-1): was `offset = page * limit`, which made page 1 skip the first
// page of results (pages are 1-indexed in the API). Correct: (page - 1) * limit.
// FIX (BUG-5): optional `status` so filtering and pagination can be combined
// (previously the route returned early and ignored page/limit when status was set).
const getPaginated = (page, limit, status) => {
  const source = status ? tasks.filter((t) => t.status === status) : tasks;
  const offset = (page - 1) * limit;
  return source.slice(offset, offset + limit).map(clone);
};

const getStats = () => {
  const now = new Date();
  const counts = { todo: 0, in_progress: 0, done: 0 };
  let overdue = 0;

  tasks.forEach((t) => {
    if (counts[t.status] !== undefined) counts[t.status]++;
    if (t.dueDate && t.status !== 'done' && new Date(t.dueDate) < now) {
      overdue++;
    }
  });

  return { ...counts, overdue };
};

const create = ({ title, description = '', status = 'todo', priority = 'medium', dueDate = null }) => {
  const task = {
    id: uuidv4(),
    title: title.trim(),
    description,
    status,
    priority,
    dueDate,
    // A task created directly as "done" should also carry a completion time.
    completedAt: status === 'done' ? new Date().toISOString() : null,
    assignee: null,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return clone(task);
};

// FIX (BUG-4): the old version did `{ ...existing, ...fields }`, letting a client
// overwrite id / createdAt / completedAt (or add arbitrary keys = mass assignment),
// and setting status:"done" through PUT never set completedAt.
const update = (id, fields) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const current = tasks[index];
  const updated = { ...current };

  UPDATABLE_FIELDS.forEach((key) => {
    if (fields[key] !== undefined) updated[key] = fields[key];
  });
  if (typeof updated.title === 'string') updated.title = updated.title.trim();

  // Keep status and completedAt consistent.
  if (updated.status === 'done' && current.status !== 'done') {
    updated.completedAt = new Date().toISOString();
  } else if (updated.status !== 'done') {
    updated.completedAt = null;
  }

  tasks[index] = updated;
  return clone(updated);
};

const remove = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;

  tasks.splice(index, 1);
  return true;
};

// FIX (BUG-3): the old version forced `priority: 'medium'` (silently destroying the
// user's priority) and re-stamped completedAt on every call. Now it only touches
// status/completedAt, and completing an already-done task is a no-op (idempotent).
const completeTask = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  if (tasks[index].status !== 'done') {
    tasks[index] = {
      ...tasks[index],
      status: 'done',
      completedAt: new Date().toISOString(),
    };
  }
  return clone(tasks[index]);
};

// NEW FEATURE: assign a task to a person. Input is validated/trimmed by the route.
// Re-assigning simply replaces the previous assignee (see README design notes).
const assignTask = (id, assignee) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  tasks[index] = { ...tasks[index], assignee: assignee.trim() };
  return clone(tasks[index]);
};

const _reset = () => {
  tasks = [];
};

module.exports = {
  getAll,
  findById,
  getByStatus,
  getPaginated,
  getStats,
  create,
  update,
  remove,
  completeTask,
  assignTask,
  _reset,
};
