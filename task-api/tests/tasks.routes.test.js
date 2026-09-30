/**
 * Integration tests for the HTTP API (Supertest).
 *
 * We import `app` (not the running server), so no port is opened.
 * Tests tagged [BUG-n] fail on the ORIGINAL code and pass after the fix.
 */
const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

// Small helper so tests stay readable
const createTask = async (body = { title: 'Sample task' }) => {
  const res = await request(app).post('/tasks').send(body);
  return res.body;
};

describe('POST /tasks', () => {
  test('creates a task (201) with defaults', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Write tests' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Write tests',
      status: 'todo',
      priority: 'medium',
      completedAt: null,
      assignee: null,
    });
    expect(res.body.id).toBeDefined();
  });

  test.each([
    ['missing title', {}],
    ['empty title', { title: '' }],
    ['whitespace title', { title: '   ' }],
    ['non-string title', { title: 123 }],
    ['invalid status', { title: 'a', status: 'pending' }],
    ['empty-string status', { title: 'a', status: '' }],
    ['invalid priority', { title: 'a', priority: 'urgent' }],
    ['invalid dueDate', { title: 'a', dueDate: 'not-a-date' }],
    ['non-string description', { title: 'a', description: 42 }],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await request(app).post('/tasks').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('[BUG-6] malformed JSON returns 400, not 500', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('GET /tasks', () => {
  test('returns an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all tasks', async () => {
    await createTask({ title: 'A' });
    await createTask({ title: 'B' });
    const res = await request(app).get('/tasks');
    expect(res.body).toHaveLength(2);
  });

  describe('?status filter', () => {
    beforeEach(async () => {
      await createTask({ title: 'T', status: 'todo' });
      await createTask({ title: 'P', status: 'in_progress' });
      await createTask({ title: 'D', status: 'done' });
    });

    test('filters by exact status', async () => {
      const res = await request(app).get('/tasks?status=in_progress');
      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.title)).toEqual(['P']);
    });

    // BUG-2: "do" used to match BOTH "todo" and "done" (substring match).
    // Now a partial value is not a valid status at all, so it is rejected (400)
    // instead of silently returning a wrong mix of tasks.
    test('[BUG-2] partial status (?status=do) never returns a mix of todo+done', async () => {
      const res = await request(app).get('/tasks?status=do');
      expect(res.status).toBe(400);
      expect(Array.isArray(res.body)).toBe(false);
    });

    test('unknown status value returns 400', async () => {
      const res = await request(app).get('/tasks?status=bogus');
      expect(res.status).toBe(400);
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 25; i++) await createTask({ title: `Task ${i}` });
    });

    test('[BUG-1] ?page=1&limit=10 returns the first 10 tasks', async () => {
      const res = await request(app).get('/tasks?page=1&limit=10');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(10);
      expect(res.body[0].title).toBe('Task 1');
    });

    test('[BUG-1] ?page=2&limit=10 returns tasks 11-20', async () => {
      const res = await request(app).get('/tasks?page=2&limit=10');
      expect(res.body[0].title).toBe('Task 11');
      expect(res.body[9].title).toBe('Task 20');
    });

    test('last page is partial', async () => {
      const res = await request(app).get('/tasks?page=3&limit=10');
      expect(res.body).toHaveLength(5);
    });

    test('defaults to page 1 / limit 10 when only one param is given', async () => {
      const res = await request(app).get('/tasks?page=2');
      expect(res.body[0].title).toBe('Task 11');
    });

    test.each(['page=0', 'page=-1', 'page=abc', 'limit=0', 'limit=-5', 'limit=xyz', 'limit=1000'])(
      'invalid pagination (%s) returns 400',
      async (qs) => {
        const res = await request(app).get(`/tasks?${qs}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toEqual(expect.any(String));
      }
    );

    test('[BUG-5] status filter and pagination work together', async () => {
      taskService._reset();
      for (let i = 1; i <= 5; i++) await createTask({ title: `Todo ${i}`, status: 'todo' });
      for (let i = 1; i <= 3; i++) await createTask({ title: `Done ${i}`, status: 'done' });

      const res = await request(app).get('/tasks?status=todo&page=2&limit=2');
      expect(res.body.map((t) => t.title)).toEqual(['Todo 3', 'Todo 4']);
    });
  });
});

describe('PUT /tasks/:id', () => {
  test('updates a task', async () => {
    const task = await createTask({ title: 'Old' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'New', priority: 'high' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, title: 'New', priority: 'high' });
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'x' });
    expect(res.status).toBe(404);
  });

  test.each([
    ['empty title', { title: '' }],
    ['non-string title', { title: 5 }],
    ['invalid status', { status: 'finished' }],
    ['empty-string status', { status: '' }],
    ['invalid priority', { priority: 'critical' }],
    ['invalid dueDate', { dueDate: 'garbage' }],
    ['non-string description', { description: {} }],
  ])('rejects %s with 400', async (_name, body) => {
    const task = await createTask();
    const res = await request(app).put(`/tasks/${task.id}`).send(body);
    expect(res.status).toBe(400);
  });

  test('allows clearing dueDate with null', async () => {
    const task = await createTask({ title: 'A', dueDate: '2030-01-01T00:00:00.000Z' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ dueDate: null });
    expect(res.status).toBe(200);
    expect(res.body.dueDate).toBeNull();
  });

  test('[BUG-4] cannot overwrite id / createdAt / completedAt', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ id: 'evil', createdAt: '1999-01-01T00:00:00.000Z', completedAt: '1999-01-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(task.id);
    expect(res.body.createdAt).toBe(task.createdAt);
    expect(res.body.completedAt).toBeNull();
  });

  test('[BUG-4] setting status=done via PUT sets completedAt', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'done' });
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).toEqual(expect.any(String));
  });
});

describe('DELETE /tasks/:id', () => {
  test('deletes a task (204) and it is gone', async () => {
    const task = await createTask();
    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const list = await request(app).get('/tasks');
    expect(list.body).toHaveLength(0);
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/tasks/nope');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks a task complete', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).toEqual(expect.any(String));
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/nope/complete');
    expect(res.status).toBe(404);
  });

  test('[BUG-3] keeps the original priority', async () => {
    const task = await createTask({ title: 'A', priority: 'high' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.priority).toBe('high');
  });
});

describe('GET /tasks/stats', () => {
  test('returns counts by status and overdue count', async () => {
    await createTask({ title: 'a', status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    await createTask({ title: 'b', status: 'in_progress' });
    await createTask({ title: 'c', status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });

    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 1, in_progress: 1, done: 1, overdue: 1 });
  });

  test('is not swallowed by the /:id routes', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toHaveProperty('overdue');
  });
});

describe('PATCH /tasks/:id/assign (new feature)', () => {
  test('assigns a task and returns the updated task', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, assignee: 'Alice' });
  });

  test('persists the assignment', async () => {
    const task = await createTask({ title: 'A' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Alice' });
    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBe('Alice');
  });

  test('trims surrounding whitespace from the name', async () => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: '  Alice  ' });
    expect(res.body.assignee).toBe('Alice');
  });

  test('returns 404 when the task does not exist', async () => {
    const res = await request(app).patch('/tasks/nope/assign').send({ assignee: 'Alice' });
    expect(res.status).toBe(404);
  });

  test.each([
    ['missing assignee', {}],
    ['empty string', { assignee: '' }],
    ['whitespace only', { assignee: '   ' }],
    ['number', { assignee: 42 }],
    ['null', { assignee: null }],
    ['array', { assignee: ['Alice'] }],
    ['object', { assignee: { name: 'Alice' } }],
    ['too long (>100 chars)', { assignee: 'x'.repeat(101) }],
  ])('rejects %s with 400', async (_name, body) => {
    const task = await createTask({ title: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('a rejected request does not change the existing assignee', async () => {
    const task = await createTask({ title: 'A' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Alice' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: '' });
    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBe('Alice');
  });

  test('re-assigning an already-assigned task is allowed (hand-off)', async () => {
    const task = await createTask({ title: 'A' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Alice' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Bob' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Bob');
  });

  test('assigning the same person again is idempotent', async () => {
    const task = await createTask({ title: 'A' });
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Alice' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alice');
  });
});

describe('unknown routes', () => {
  test('return a JSON 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('error handling', () => {
  test('oversized body returns 413 (client error is passed through, not 500)', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'big', description: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('unexpected server faults return 500 without leaking details', async () => {
    const spy = jest.spyOn(taskService, 'getAll').mockImplementation(() => {
      throw new Error('boom: secret internal detail');
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/tasks');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
    errSpy.mockRestore();
  });
});
