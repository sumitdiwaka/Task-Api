# The Untested API — Submission

Take-home for the Full Stack Developer Intern role. The original brief is in [ASSIGNMENT.md](./ASSIGNMENT.md) (the original starter README is kept as [ORIGINAL_README.md](./ORIGINAL_README.md)).

| | |
|---|---|
| **Tests** | 92 passing (unit + integration) |
| **Coverage** | 99.02% statements · 95.55% branches · 97.36% functions · 98.9% lines |
| **Bugs found** | 7 (all 7 fixed) |
| **New feature** | `PATCH /tasks/:id/assign` |
| **Live URL** | https://task-api-pied.vercel.app/tasks/stats     https://task-api-pied.vercel.app |

> **How I worked:** I read the code first, then wrote the test suite describing the *correct* behaviour
> and ran it against the **original** code. Every bug below was confirmed by a failing test
> (tagged `[BUG-n]` in the test names) rather than guessed. I then fixed the code until the suite went green.

---

## 1. Run it

```bash
cd task-api
npm install
npm start          # http://localhost:3000
npm test           # 92 tests
npm run coverage   # tests + coverage table
```

### Coverage output

```
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|----------|---------|---------|-------------------
All files        |   99.02 |    95.55 |   97.36 |    98.9 |
 src             |   89.47 |       90 |   66.66 |   89.47 |
  app.js         |   89.47 |       90 |   66.66 |   89.47 | 31-32
 src/routes      |     100 |      100 |     100 |     100 |
  tasks.js       |     100 |      100 |     100 |     100 |
 src/services    |     100 |    91.89 |     100 |     100 |
  taskService.js |     100 |    91.89 |     100 |     100 | 45,84,89
 src/utils       |     100 |    96.87 |     100 |     100 |
  validators.js  |     100 |    96.87 |     100 |     100 | 45-46
-----------------|---------|----------|---------|---------|-------------------
Test Suites: 2 passed, 2 total
Tests:       92 passed, 92 total
```

The only uncovered lines in `app.js` (31–32) are `app.listen(...)`, which only runs when the file is started
directly — tests import `app` without opening a port, on purpose.

### Test files

| File | What it covers |
|---|---|
| `tests/taskService.test.js` | Unit tests calling every service function directly |
| `tests/tasks.routes.test.js` | Supertest integration tests for every route, validation errors, 404s, 413/500 handling |

---

## 2. Bug Report (Part A)

Each entry: **where** it lives, **why** it happens, **expected vs. actual**, **how I found it**, and **the fix**.
Line numbers refer to the **original** code.

### BUG-1 — Pagination skips the first page (off-by-one) — *High*

- **Where:** `src/services/taskService.js` → `getPaginated`, line 12 (`const offset = page * limit`)
- **Why:** The API is 1-indexed (`?page=1` is the first page) but the offset formula is 0-indexed. Page 1 therefore starts at item `limit`, skipping the first `limit` tasks; they can never be reached.
- **Expected:** `?page=1&limit=10` returns tasks 1–10.
- **Actual:** It returns tasks 11–20. With 25 tasks, `?page=3&limit=10` returned an empty array.
- **Found by:** `[BUG-1]` tests — the first item of page 1 was `Task 11` instead of `Task 1`.
- **Fix:** `offset = (page - 1) * limit`.
- **Related hardening:** the route used `parseInt(x) || default`, so `page=0` silently became page 1 and `page=-1` produced a **negative slice offset** (garbage results). Pagination input is now validated: anything that is not a positive whole number → `400`, and `limit` is capped at 100.

### BUG-2 — Status filter uses substring matching — *High*

- **Where:** `src/services/taskService.js` → `getByStatus`, line 9 (`t.status.includes(status)`)
- **Why:** `String.prototype.includes` was used where equality was meant.
- **Expected:** `?status=todo` returns only `todo` tasks.
- **Actual:** `?status=do` returned both `todo` **and** `done`; `?status=in` matched `in_progress`; even `?status=o` matched everything.
- **Found by:** `[BUG-2]` tests with partial strings (`do`, `in`, `one`).
- **Fix:** strict equality (`t.status === status`). The route now also rejects unknown status values with `400` (listing the valid ones) instead of returning a confusing empty/wrong list.

### BUG-3 — Completing a task overwrites its priority — *Medium*

- **Where:** `src/services/taskService.js` → `completeTask`, line 69 (`priority: 'medium'`)
- **Why:** A hard-coded `priority: 'medium'` inside the object that marks a task done. It looks like leftover/copy-paste code; nothing in the spec says completing a task changes priority.
- **Expected:** `PATCH /tasks/:id/complete` changes only `status` and `completedAt`.
- **Actual:** A `high`-priority task becomes `medium` (data loss). Also, completing an already-completed task **re-stamped `completedAt`**, destroying the real completion time.
- **Found by:** `[BUG-3]` tests — created a `high` task, completed it, priority was `medium`; and a fake-timer test that completes twice.
- **Fix:** removed the priority line; completing an already-`done` task is now an idempotent no-op that keeps the original `completedAt`.

### BUG-4 — `PUT /tasks/:id` allows overwriting protected fields (mass assignment) and leaves state inconsistent — *High*

- **Where:** `src/services/taskService.js` → `update`, line 50 (`{ ...tasks[index], ...fields }`)
- **Why:** The request body is spread straight onto the stored task. Validation only looks at title/status/priority/dueDate, so every other key passes through untouched.
- **Expected:** Only `title`, `description`, `status`, `priority`, `dueDate` can be changed. Moving a task to `done` sets `completedAt`; moving it out of `done` clears it.
- **Actual:**
  - A client could change `id`, `createdAt`, `completedAt`, or inject arbitrary keys (`{"id":"evil","hacker":true}`).
  - `PUT {status:"done"}` produced a `done` task with `completedAt: null` — which also makes reporting inconsistent.
- **Found by:** `[BUG-4]` tests sending `id`/`createdAt`/`completedAt` in the body, and a test that PUTs `status: "done"`.
- **Fix:** whitelist (`UPDATABLE_FIELDS`) in the service, plus logic that keeps `status` and `completedAt` in sync.
- **Related hardening (`validators.js`, lines 8/11/14/24/27/30):** checks used truthiness (`body.status && ...`), so falsy-but-invalid values like `status: ""` skipped validation and were **stored**. Now `!== undefined` is used so any supplied value must be valid. `description` must be a string, and `dueDate: null` is accepted to clear a due date.

### BUG-5 — Status filter and pagination cannot be combined — *Medium*

- **Where:** `src/routes/tasks.js` → `GET /`, lines 14–17 (early `return` when `status` is set)
- **Why:** The `if (status) return ...` branch runs first, so `page`/`limit` are never read when a status is present.
- **Expected:** `?status=todo&page=2&limit=2` returns the 2nd page of `todo` tasks.
- **Actual:** It returned **every** `todo` task and ignored `page`/`limit` — a large response for a client that asked for a small page.
- **Found by:** `[BUG-5]` test with 5 `todo` + 3 `done` tasks.
- **Fix:** `getPaginated(page, limit, status)` accepts an optional status; the route calls it whenever pagination is requested.

### BUG-6 — Malformed JSON returns 500 instead of 400 — *Medium*

- **Where:** `src/app.js`, error middleware, lines 9–12
- **Why:** `express.json()` throws a client error (`entity.parse.failed`, status 400) for bad JSON, but the global handler ignores the error's status and always answers `500 Internal server error` (and logs a stack trace for what is just a client typo).
- **Expected:** `400` with a clear message. Oversized bodies → `413`.
- **Actual:** `500`, which would also trigger server-error alerts in production for user mistakes.
- **Found by:** `[BUG-6]` test posting `'{"title": '`.
- **Fix:** handler maps `entity.parse.failed` → 400, passes through other 4xx errors (e.g. 413), and keeps 500 (with no internal details leaked) only for real server faults. I also added a JSON `404` for unknown routes (Express otherwise returns an HTML page from a JSON API).

### BUG-7 — Service leaks references to its internal store — *Low*

- **Where:** `src/services/taskService.js` → `getAll` (line 5), `findById` (line 7), `getByStatus`, `getPaginated`, `create`, `update`
- **Why:** `getAll` copies the *array* (`[...tasks]`) but not the task *objects*, so callers hold live references to stored data.
- **Expected:** Changing a returned object doesn't change the store.
- **Actual:** `getAll()[0].title = 'x'` silently edits the stored task without going through `update`/validation. Harmless today, but a trap the moment a second caller appears.
- **Found by:** `[BUG-7]` test mutating returned objects.
- **Fix:** every function returns shallow copies (`clone`).

### Also noticed (not counted as code bugs)

- **Spec inconsistency:** `ASSIGNMENT.md` says statuses are `todo | in_progress | done`, but the original README said `pending | in-progress | completed`. The code (and validators) use the `ASSIGNMENT.md` values, so I treated that as the source of truth.
- A task created directly with `status: "done"` had no `completedAt`. Fixed in `create` for the same reason as BUG-4.

---

## 3. Fixes (Part B)

The brief said to fix *one* bug; I fixed **all seven**, since each was small, isolated, and covered by a test.
The tests tagged `[BUG-n]` fail on the original code and pass now. Files changed:

| File | Changes |
|---|---|
| `src/services/taskService.js` | BUG-1, 2, 3, 4, 5, 7 + `assignTask` |
| `src/routes/tasks.js` | BUG-5 (combined filter + pagination), input validation, `/assign` route |
| `src/utils/validators.js` | Stricter validation, `parsePagination`, `validateStatusQuery`, `validateAssign` |
| `src/app.js` | BUG-6, JSON 404 |

---

## 4. New feature — `PATCH /tasks/:id/assign` (Part C)

```http
PATCH /tasks/:id/assign
Content-Type: application/json

{ "assignee": "Alice" }
```

**Responses**

| Case | Status |
|---|---|
| Success — returns the full updated task | `200` |
| Task id doesn't exist | `404` |
| `assignee` missing / not a string / empty / whitespace-only / > 100 chars | `400` |

### Design decisions

1. **Empty or whitespace-only name → `400`.** An empty assignee is meaningless and would look assigned-but-nobody-knows-who. Names are **trimmed** before validation *and* storage, so `"  Alice  "` is stored as `"Alice"`.
2. **Non-strings (number, null, array, object) → `400`.** The brief says a name (string); silently coercing `42` to `"42"` hides client bugs.
3. **Max 100 characters.** A sanity limit so the field can't be used to store arbitrarily large text.
4. **Already assigned → allowed (re-assign replaces the assignee, `200`).** Real teams hand tasks off. Returning `409 Conflict` would force clients to "unassign" first, and there is no unassign endpoint. Assigning the same person twice is idempotent. *If the product wanted "first come, first served", switching to 409 is a small change in the route.*
5. **Order of checks: 404 before 400.** First "does this resource exist?", then "is the body valid?". A client hitting a wrong id gets told that, not a misleading validation message.
6. **New tasks start with `assignee: null`**, matching how `dueDate`/`completedAt` represent "not set".
7. **A rejected request never changes the existing assignee** (covered by a test).
8. **Unassigning** (`assignee: null`) is deliberately *not* supported — it wasn't asked for and would change the "must be a non-empty string" rule. Noted as a follow-up below.

Tests were written alongside the implementation: one unit block in `taskService.test.js`, and one integration block in `tasks.routes.test.js` (happy path, persistence, trimming, 404, 8 invalid-input cases, re-assign, idempotency).

---

## 5. Notes for the reviewer

### What I'd test next with more time
- **Property-based tests** (e.g. `fast-check`) for pagination: for any N tasks/page/limit, concatenating all pages must equal the full list with no gaps or duplicates.
- **Time boundaries for `overdue`:** due exactly *now*, timezone offsets, date-only strings (`2030-01-01`) vs full ISO.
- **Concurrency/ordering:** fine in one Node process, but I'd add tests around rapid create/delete interleaving if this ever moves to a real DB.
- **Contract tests** against a written OpenAPI spec so docs and behaviour can't drift (as they already had).
- **Load/limit behaviour** — very large task counts and the body-size limit.

### What surprised me
- The **docs disagreed with the code** (status names), so I had to decide which to trust before writing a single test.
- Several bugs were **plausible-looking one-liners** (`includes`, `page * limit`, a stray `priority: 'medium'`) — they read fine in a quick skim and only show up when you assert exact expected values.
- `PUT` is documented as a "full update" but behaves as a partial merge — I kept the partial behaviour (more useful, backwards-compatible).
- The original validators skipped falsy values, so `status: ""` was **accepted and stored**.

### Questions I'd ask before shipping to production
1. **Persistence:** is losing all data on restart acceptable? What's the intended database?
2. **Auth & ownership:** who may create/edit/delete/assign? Should `assignee` reference a real user id rather than a free-text name?
3. **Should `PUT` be a true full replace** (missing fields reset to defaults) or stay a partial update?
4. **Status transitions:** can a `done` task be reopened, and should that be allowed via `PUT`?
5. **Pagination contract:** should list responses include metadata (`total`, `page`, `totalPages`) instead of a bare array? (I kept the bare array so as not to break existing clients.)
6. **Unassign & re-assign policy:** first-come-first-served (409) or hand-off (current behaviour)? Do we need an unassign action?
7. **Operational needs:** rate limiting, request logging, CORS, health-check endpoint, API versioning.

### A note on AI tools
I used an AI assistant to speed up drafting. To make sure the submission reflects real understanding, every bug above was reproduced with a failing test before fixing, and I documented where each bug lives and why it happens (not only the symptom), plus the trade-offs in the feature design.

---

## 6. Deployment (live link)

The app has no database and reads `PORT` from the environment, so it deploys as-is to most Node hosts. Two ready-to-go paths are included in the repo (pick whichever platform has capacity):

### Option A — Vercel (serverless, no Docker, dashboard only)

`api/index.js` and `vercel.json` are already in `task-api/` for this.

1. Push this repo to GitHub.
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. **Root Directory:** `task-api` (Vercel auto-detects `vercel.json` from there).
4. Deploy, then verify: `GET https://<your-app>.vercel.app/tasks/stats`.

### Option B — Back4app Containers (Docker, persistent server)

A `Dockerfile` is already in `task-api/` for this.

1. Push this repo to GitHub.
2. [back4app.com](https://back4app.com) → **Containers** → connect the repo, install the Back4app Containers GitHub app.
3. Set **Dockerfile path** to `task-api/Dockerfile` and **Context** to `task-api`.
4. Deploy, then verify: `GET https://<your-app>.back4app.io/tasks/stats`.

### Option C — Render / Railway, if capacity frees up

Same idea as above: **Root Directory** `task-api` · **Build Command** `npm install` · **Start Command** `npm start`.

> Data is in-memory, so it resets whenever the service restarts, sleeps, or (on Vercel) a new serverless instance spins up. Fine for demoing this API; a real deployment would use a database.

## Project structure

```
task-api/
  src/
    app.js                  # Express setup, 404 + error handling
    routes/tasks.js         # Route handlers
    services/taskService.js # Business logic + in-memory store
    utils/validators.js     # Input validation & parsing helpers
  api/index.js               # Vercel serverless entrypoint (Option A)
  vercel.json                 # Vercel routing config (Option A)
  Dockerfile                  # Container image for Back4app etc. (Option B)
  tests/
    taskService.test.js     # Unit tests
    tasks.routes.test.js    # Integration tests (Supertest)
  coverage-summary.txt      # Saved coverage output
ASSIGNMENT.md               # Original brief
ORIGINAL_README.md          # Original starter README
README.md                   # This file (submission write-up)
```
