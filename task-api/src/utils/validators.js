/**
 * Input validation helpers.
 *
 * Every validator returns `null` when the input is valid, or a human-readable
 * error string when it is not (the route turns that into a 400 response).
 */
const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

const MAX_ASSIGNEE_LENGTH = 100; // sanity limit so nobody stores a novel as a name
const MAX_LIMIT = 100; // cap page size so one request can't dump the whole store
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

// FIX (BUG-4 hardening): the old checks used truthiness (`body.status && ...`),
// so falsy-but-invalid values such as "" or 0 silently skipped validation.
// We now check `!== undefined` so ANY provided value must be valid.
const validateFields = (body, { requireTitle }) => {
  if (requireTitle) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return 'title is required and must be a non-empty string';
    }
  } else if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return 'title must be a non-empty string';
  }

  if (body.description !== undefined && typeof body.description !== 'string') {
    return 'description must be a string';
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  // dueDate may be omitted or null (= "no due date"); otherwise it must be a parseable date string.
  if (body.dueDate !== undefined && body.dueDate !== null) {
    if (typeof body.dueDate !== 'string' || isNaN(Date.parse(body.dueDate))) {
      return 'dueDate must be a valid ISO date string';
    }
  }
  return null;
};

const validateCreateTask = (body) => validateFields(body || {}, { requireTitle: true });
const validateUpdateTask = (body) => validateFields(body || {}, { requireTitle: false });

/**
 * Validates the ?status= query value used by GET /tasks.
 * (`undefined` means "no filter" and is valid.)
 */
const validateStatusQuery = (status) => {
  if (status === undefined) return null;
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  return null;
};

/**
 * Parses ?page= and ?limit=.
 * Returns { error } or { page, limit }.
 *
 * FIX (BUG-1 hardening): the old code used `parseInt(x) || default`, which
 * silently turned page=0 / limit=0 into defaults and let negatives through
 * (a negative page produced a negative slice offset).
 * Now anything that isn't a positive whole number is rejected with a clear message.
 */
const parsePagination = ({ page, limit }) => {
  const parse = (value, name, fallback, max) => {
    if (value === undefined) return { value: fallback };
    if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1) {
      return { error: `${name} must be a positive integer` };
    }
    const n = Number(value);
    if (max && n > max) return { error: `${name} must be at most ${max}` };
    return { value: n };
  };

  const p = parse(page, 'page', DEFAULT_PAGE);
  if (p.error) return { error: p.error };
  const l = parse(limit, 'limit', DEFAULT_LIMIT, MAX_LIMIT);
  if (l.error) return { error: l.error };
  return { page: p.value, limit: l.value };
};

/** Validates the body of PATCH /tasks/:id/assign */
const validateAssign = (body) => {
  const assignee = body && body.assignee;
  if (typeof assignee !== 'string' || assignee.trim() === '') {
    return 'assignee is required and must be a non-empty string';
  }
  if (assignee.trim().length > MAX_ASSIGNEE_LENGTH) {
    return `assignee must be at most ${MAX_ASSIGNEE_LENGTH} characters`;
  }
  return null;
};

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  validateCreateTask,
  validateUpdateTask,
  validateStatusQuery,
  parsePagination,
  validateAssign,
};
