# Teacher Session Booking API

A REST API for creating teacher sessions, booking them for users, and viewing completed session history. Built with Node.js, TypeScript, Express 5, MongoDB, and Mongoose.

## Quick start

Prerequisites: Node.js 22 or newer, npm, and MongoDB 7/8 locally or a MongoDB Atlas connection. Docker is optional.

```bash
npm ci
cp .env.example .env
# Optional: start a local MongoDB instance using Docker
docker compose up -d
npm run dev
```

If you already have MongoDB, skip Docker and set `MONGODB_URI` in `.env`. The server connects to the database and builds indexes before accepting requests. Check `GET http://localhost:3000/health`.

For a compiled build:

```bash
npm run build
npm start
```

| Variable | Purpose | Default |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string | Required; sample in `.env.example` |
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | Runtime environment | Set in `.env.example` |

Never commit `.env` or database credentials. `.env.example` contains only a local sample connection.

## Test the API in Postman

1. Import `postman/teacher-sessions.postman_collection.json`.
2. Set the collection variable `baseUrl` to your running API (default `http://localhost:3000`).
3. Run the complete collection in order using Collection Runner.

The collection creates its own teacher, unique user, and future session. It automatically stores IDs and dates, verifies the booking/completion lifecycle, and checks error cases. No manual ID copying is needed. Run it only against a development database; it leaves its sample records in place.

Command-line alternative, while the server is running:

```bash
npm run test:postman
```

Optional teacher seed (prints the teacher ID and reuses the sample record on subsequent sequential runs):

```bash
npm run seed
```

## Endpoints

Successful responses use `{ "data": ... }`. Errors use `{ "error": { "code": "...", "message": "..." } }`. Health is a small standalone status response.

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| POST | `/users` | 201 | Create a user with a unique email |
| POST | `/teachers` | 201 | Supporting endpoint to create a teacher |
| POST | `/sessions` | 201 | Create an AVAILABLE session |
| GET | `/sessions/available?dateTimestamp=...` | 200 | List AVAILABLE sessions for a UTC date using aggregation |
| POST | `/sessions/:id/book` | 200 | Atomically book an AVAILABLE session |
| PATCH | `/sessions/:id/complete` | 200 | Atomically complete a BOOKED session |
| GET | `/users/:id/sessions` | 200 | Separate upcoming/completed sessions using aggregation |
| GET | `/health` | 200 / 503 | Database readiness |

### Create a user

`POST /users`

```json
{
  "fullName": "Demo Student",
  "email": "student@example.com",
  "phone": "+91 9000000000"
}
```

All fields are required. Emails are trimmed and lowercased. A database unique index enforces uniqueness, including concurrent requests. Duplicate emails return `409 DUPLICATE_EMAIL`.

### Create a teacher

`POST /teachers`

```json
{
  "fullName": "Demo Teacher",
  "email": "teacher@example.com",
  "specialization": "Computer Science",
  "experience": 5
}
```

Experience is a number of years from 0 to 80. This supporting endpoint is included because session creation requires an existing teacher, while the assignment does not specify a teacher-creation API. Teacher emails are not unique, matching the supplied schema.

### Create a session

`POST /sessions`

```json
{
  "teacherId": "REPLACE_WITH_TEACHER_ID",
  "startTime": "2040-06-15T10:00:00.000Z",
  "endTime": "2040-06-15T11:00:00.000Z"
}
```

The teacher must exist and `endTime` must be later than `startTime`. Dates require ISO 8601 strings with an explicit timezone (`Z` or an offset). Status is always initially `AVAILABLE`; `userId` and `completedAt` are `null`. Client-supplied status/ownership fields are ignored.

### Available sessions

`GET /sessions/available?dateTimestamp=<Unix milliseconds>`

For example, obtain a timestamp with `new Date('2040-06-15T10:00:00Z').getTime()` in JavaScript. The query selects sessions whose **start time** falls within that UTC calendar day, from inclusive midnight to exclusive next midnight. Results are sorted by start time and contain teacher details without the teacher's email. An empty day returns `data: []`.

Implementation: `$match` → `$sort` → `$lookup` → `$unwind` → `$project` in `src/services/session-service.ts`. Filtering by status and start time uses a compound index.

### Book a session

`POST /sessions/:id/book`

```json
{ "userId": "REPLACE_WITH_USER_ID" }
```

The user and session must exist. An atomic conditional `findOneAndUpdate` changes `AVAILABLE` to `BOOKED` and sets `userId`. The status check is part of the database update, so competing requests cannot both succeed. A second booking returns `409 SESSION_NOT_AVAILABLE`.

### Complete a session

`PATCH /sessions/:id/complete` — no body required.

Only a BOOKED session can become COMPLETED. The atomic update sets `completedAt` from the server clock. Repeated completion returns `409 SESSION_NOT_BOOKED` and preserves the original timestamp.

### User sessions

`GET /users/:id/sessions`

```json
{
  "data": {
    "upcomingSessions": [],
    "completedSessions": []
  }
}
```

An existing user with no sessions gets both empty arrays. An unknown user gets 404. Both groups include teacher details without the teacher's email.

Implementation: `$match` by user → teacher `$lookup`/`$unwind` → `$project` → `$facet`. The facet produces upcoming and completed arrays in one aggregation query. Upcoming sessions are sorted earliest first; completed sessions are sorted by latest completion first.

## Assumptions and scope

- `dateTimestamp` means Unix **milliseconds**; date filtering uses **UTC**. These conventions are explicit because the assignment leaves them unspecified.
- Upcoming means `BOOKED` with `startTime >= now`. Past bookings not marked completed are excluded from both lists; completion is explicit, not inferred from elapsed time.
- Completion is allowed for any BOOKED session, even before its end time, because the assignment only specifies a status precondition.
- Session creation/booking does not impose extra past-time, overlapping-slot, or per-user scheduling restrictions that the assignment does not request.
- Authentication, authorization, payments, and cancellation are outside this assignment. This is an assignment API, not a public production service.
- `POST /teachers` and `GET /health` are supporting endpoints. The six required endpoints retain the exact requested paths.

## Validation and errors

| Status | Meaning / examples |
| --- | --- |
| 400 | Invalid ObjectId, body, email, timestamp, datetime, or time range |
| 404 | User, teacher, session, or route does not exist |
| 409 | Duplicate user email or invalid session state transition |
| 413 | Request body exceeds 100 KB |
| 500 | Unexpected server error; internal details are not returned |

All handlers use async/await. Express 5 forwards rejected async handlers to centralized error middleware. MongoDB failures are handled centrally; no manual Promise chains are used. Startup fails if the database configuration/connection is invalid. SIGINT/SIGTERM stop incoming requests and disconnect MongoDB.

## Automated checks

```bash
npm run typecheck
npm run build
npm test
```

Use `npm run test:unit` for database-independent validation and HTTP middleware checks, or `npm run test:integration` for the database-backed API suite.

Integration tests use Supertest and an isolated **real MongoDB process** started by `mongodb-memory-server`. No Atlas credentials or running external database are needed. The first run downloads an official MongoDB binary, so it needs internet access. Tests do not use or modify the database configured in `.env`.

The tests cover all six required APIs, UTC day boundaries, empty results, malformed input, email uniqueness, missing records, state transitions, concurrent bookings/completions, and user-history isolation. GitHub Actions runs type checking, build, and tests on pushes and pull requests.

## Project structure

```text
src/
  app.ts                 Express setup
  server.ts              Startup and shutdown
  config/                Environment and database connection
  controllers/           HTTP input/output
  middleware/            Central error handling
  models/                Mongoose schemas and indexes
  routes/                Endpoint registration
  services/              Session rules and aggregation pipelines
  utils/                 Input validation and application errors
scripts/seed.ts           Optional sample teacher
tests/api.test.ts         Integration tests
postman/                 Runnable API collection
compose.yaml             Optional local MongoDB
```
