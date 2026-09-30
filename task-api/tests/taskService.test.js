/**
 * Unit tests for src/services/taskService.js
 *
 * These call the service functions directly (no HTTP). Each test starts from
 * an empty store via _reset(), so tests are independent of each other.
 *
 * Tests tagged [BUG-n] fail on the ORIGINAL code and pass after the fix.
 * See README.md -> "Bug Report" for the full write-up.
 */
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

describe('create', () => {
  test('creates a task with defaults', () => {
    const task = taskService.create({ title: 'Write tests' });

    expect(task).toMatchObject({
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
      assignee: null,
    });
    expect(task.id).toEqual(expect.any(String));
    expect(new Date(task.createdAt).toString()).not.toBe('Invalid Date');
  });

  test('respects provided fields', () => {
    const due = '2030-01-01T00:00:00.000Z';
    const task = taskService.create({
      title: 'A',
      description: 'desc',
      status: 'in_progress',
      priority: 'high',
      dueDate: due,
    });
    expect(task).toMatchObject({ description: 'desc', status: 'in_progress', priority: 'high', dueDate: due });
  });

  test('generates unique ids', () => {
    const a = taskService.create({ title: 'A' });
    const b = taskService.create({ title: 'B' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('getAll / findById', () => {
  test('getAll returns every task', () => {
    taskService.create({ title: 'A' });
    taskService.create({ title: 'B' });
    expect(taskService.getAll()).toHaveLength(2);
  });

  test('findById returns the task or undefined', () => {
    const t = taskService.create({ title: 'A' });
    expect(taskService.findById(t.id).title).toBe('A');
    expect(taskService.findById('nope')).toBeUndefined();
  });

  test('[BUG-7] mutating a returned task does not change the store', () => {
    const t = taskService.create({ title: 'A' });
    taskService.getAll()[0].title = 'HACKED';
    taskService.findById(t.id).title = 'HACKED';
    expect(taskService.findById(t.id).title).toBe('A');
  });
});

describe('getByStatus', () => {
  beforeEach(() => {
    taskService.create({ title: 'T', status: 'todo' });
    taskService.create({ title: 'P', status: 'in_progress' });
    taskService.create({ title: 'D', status: 'done' });
  });

  test('returns only tasks with the exact status', () => {
    const result = taskService.getByStatus('todo');
    expect(result.map((t) => t.title)).toEqual(['T']);
  });

  test('[BUG-2] partial status strings do not match (no substring matching)', () => {
    expect(taskService.getByStatus('do')).toEqual([]);
    expect(taskService.getByStatus('in')).toEqual([]);
    expect(taskService.getByStatus('one')).toEqual([]);
  });
});

describe('getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 25; i++) taskService.create({ title: `Task ${i}` });
  });

  test('[BUG-1] page 1 returns the FIRST items', () => {
    const page = taskService.getPaginated(1, 10);
    expect(page).toHaveLength(10);
    expect(page[0].title).toBe('Task 1');
    expect(page[9].title).toBe('Task 10');
  });

  test('[BUG-1] page 2 continues where page 1 stopped', () => {
    const page = taskService.getPaginated(2, 10);
    expect(page[0].title).toBe('Task 11');
  });

  test('last page may be partial', () => {
    expect(taskService.getPaginated(3, 10)).toHaveLength(5);
  });

  test('page past the end returns an empty array', () => {
    expect(taskService.getPaginated(99, 10)).toEqual([]);
  });
});

describe('getStats', () => {
  test('returns zero counts on an empty store', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('counts tasks by status and overdue ones', () => {
    const past = '2000-01-01T00:00:00.000Z';
    const future = '2999-01-01T00:00:00.000Z';
    taskService.create({ title: 'a', status: 'todo', dueDate: past }); // overdue
    taskService.create({ title: 'b', status: 'in_progress', dueDate: past }); // overdue
    taskService.create({ title: 'c', status: 'done', dueDate: past }); // done => never overdue
    taskService.create({ title: 'd', status: 'todo', dueDate: future }); // not yet due
    taskService.create({ title: 'e', status: 'todo' }); // no due date

    expect(taskService.getStats()).toEqual({ todo: 3, in_progress: 1, done: 1, overdue: 2 });
  });
});

describe('update', () => {
  test('updates allowed fields and keeps the rest', () => {
    const t = taskService.create({ title: 'Old', priority: 'low' });
    const updated = taskService.update(t.id, { title: 'New' });
    expect(updated.title).toBe('New');
    expect(updated.priority).toBe('low');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.update('nope', { title: 'x' })).toBeNull();
  });

  test('[BUG-4] cannot overwrite protected fields (id, createdAt, completedAt)', () => {
    const t = taskService.create({ title: 'A' });
    const updated = taskService.update(t.id, {
      id: 'evil',
      createdAt: '1999-01-01T00:00:00.000Z',
      completedAt: '1999-01-01T00:00:00.000Z',
      hacker: true,
    });
    expect(updated.id).toBe(t.id);
    expect(updated.createdAt).toBe(t.createdAt);
    expect(updated.completedAt).toBeNull();
    expect(updated).not.toHaveProperty('hacker');
  });

  test('[BUG-4] moving to done sets completedAt; moving away clears it', () => {
    const t = taskService.create({ title: 'A' });
    const done = taskService.update(t.id, { status: 'done' });
    expect(done.completedAt).toEqual(expect.any(String));

    const reopened = taskService.update(t.id, { status: 'todo' });
    expect(reopened.completedAt).toBeNull();
  });
});

describe('remove', () => {
  test('removes an existing task', () => {
    const t = taskService.create({ title: 'A' });
    expect(taskService.remove(t.id)).toBe(true);
    expect(taskService.getAll()).toHaveLength(0);
  });

  test('returns false for an unknown id', () => {
    expect(taskService.remove('nope')).toBe(false);
  });
});

describe('completeTask', () => {
  test('marks the task done and sets completedAt', () => {
    const t = taskService.create({ title: 'A' });
    const done = taskService.completeTask(t.id);
    expect(done.status).toBe('done');
    expect(new Date(done.completedAt).toString()).not.toBe('Invalid Date');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.completeTask('nope')).toBeNull();
  });

  test('[BUG-3] does NOT change the priority', () => {
    const t = taskService.create({ title: 'A', priority: 'high' });
    expect(taskService.completeTask(t.id).priority).toBe('high');
    const l = taskService.create({ title: 'B', priority: 'low' });
    expect(taskService.completeTask(l.id).priority).toBe('low');
  });

  test('[BUG-3] completing twice keeps the original completedAt', () => {
    jest.useFakeTimers();
    try {
      const t = taskService.create({ title: 'A' });
      jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
      const first = taskService.completeTask(t.id);
      jest.setSystemTime(new Date('2030-06-01T00:00:00.000Z'));
      const second = taskService.completeTask(t.id);
      expect(second.completedAt).toBe(first.completedAt);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('assignTask (new feature)', () => {
  test('stores the assignee on the task', () => {
    const t = taskService.create({ title: 'A' });
    const assigned = taskService.assignTask(t.id, 'Alice');
    expect(assigned.assignee).toBe('Alice');
    expect(taskService.findById(t.id).assignee).toBe('Alice');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.assignTask('nope', 'Alice')).toBeNull();
  });

  test('re-assigning replaces the previous assignee', () => {
    const t = taskService.create({ title: 'A' });
    taskService.assignTask(t.id, 'Alice');
    expect(taskService.assignTask(t.id, 'Bob').assignee).toBe('Bob');
  });
});
