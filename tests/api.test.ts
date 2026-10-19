import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import { User } from '../src/models/user.js';
import { Teacher } from '../src/models/teacher.js';
import { Session } from '../src/models/session.js';

let mongo: MongoMemoryServer;
let teacherId: string;
let userId: string;
const future = '2040-06-15T10:00:00.000Z';
const later = '2040-06-15T11:00:00.000Z';
const absentId = new Types.ObjectId().toHexString();

before(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Session.deleteMany({});
  await User.deleteMany({});
  await Teacher.deleteMany({});
  teacherId = (await Teacher.create({ fullName: 'Test Teacher', email: 'teacher@example.com', specialization: 'Math', experience: 3 })).id;
  userId = (await User.create({ fullName: 'Test Student', email: 'student@example.com', phone: '+91 9000000000' })).id;
});

async function createSession() {
  const response = await request(app).post('/sessions').send({ teacherId, startTime: future, endTime: later }).expect(201);
  return response.body.data._id as string;
}

test('create user: normalize email, timestamps, and prevent case-insensitive duplicates', async () => {
  const result = await request(app).post('/users').send({ fullName: ' New Student ', email: ' New@Example.com ', phone: '1234567890' }).expect(201);
  assert.equal(result.body.data.fullName, 'New Student');
  assert.equal(result.body.data.email, 'new@example.com');
  assert.ok(result.body.data.createdAt);
  const duplicate = await request(app).post('/users').send({ fullName: 'Other', email: 'NEW@example.com', phone: '1234567890' }).expect(409);
  assert.equal(duplicate.body.error.code, 'DUPLICATE_EMAIL');
});

test('concurrent duplicate emails produce one user and one conflict', async () => {
  const payload = { fullName: 'Student', email: 'race@example.com', phone: '1234567890' };
  const results = await Promise.all([request(app).post('/users').send(payload), request(app).post('/users').send(payload)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(await User.countDocuments({ email: payload.email }), 1);
});

test('reject missing, malformed and non-object user inputs', async () => {
  for (const body of [{}, { fullName: 'Student', email: 'bad', phone: '123' }, { fullName: 'Student', email: 'ok@example.com', phone: 123 }, []]) {
    await request(app).post('/users').send(body).expect(400);
  }
});

test('teacher setup endpoint validates experience and creates teacher', async () => {
  const data = { fullName: 'Teacher', email: 'demo@example.com', specialization: 'CS', experience: 4.5 };
  await request(app).post('/teachers').send(data).expect(201);
  await request(app).post('/teachers').send({ ...data, experience: -1 }).expect(400);
});

test('create available session and ignore client-supplied ownership/status', async () => {
  const result = await request(app).post('/sessions').send({ teacherId, startTime: future, endTime: later, status: 'COMPLETED', userId, completedAt: future }).expect(201);
  assert.equal(result.body.data.status, 'AVAILABLE');
  assert.equal(result.body.data.userId, null);
  assert.equal(result.body.data.completedAt, null);
});

test('reject missing teacher, invalid IDs, invalid dates and non-increasing times', async () => {
  await request(app).post('/sessions').send({ teacherId: absentId, startTime: future, endTime: later }).expect(404);
  await request(app).post('/sessions').send({ teacherId: 'wrong', startTime: future, endTime: later }).expect(400);
  for (const [startTime, endTime] of [[future, future], [later, future], ['bad', later], ['2040-06-15T10:00:00', later], ['2040-02-30T10:00:00Z', later]]) {
    await request(app).post('/sessions').send({ teacherId, startTime, endTime }).expect(400);
  }
});

test('availability aggregation includes UTC midnight, excludes next day and non-available records', async () => {
  const rows = [
    { startTime: '2040-06-14T23:59:59.999Z', status: 'AVAILABLE' },
    { startTime: '2040-06-15T00:00:00.000Z', status: 'AVAILABLE' },
    { startTime: '2040-06-15T23:59:59.999Z', status: 'AVAILABLE' },
    { startTime: '2040-06-16T00:00:00.000Z', status: 'AVAILABLE' },
    { startTime: future, status: 'BOOKED', userId },
    { startTime: future, status: 'COMPLETED', userId },
  ];
  await Session.insertMany(rows.map(row => ({ ...row, teacherId, endTime: new Date(new Date(row.startTime).getTime() + 3600000) })));
  const response = await request(app).get('/sessions/available').query({ dateTimestamp: Date.parse(future) }).expect(200);
  assert.deepEqual(response.body.data.map((s: { startTime: string }) => s.startTime), ['2040-06-15T00:00:00.000Z', '2040-06-15T23:59:59.999Z']);
  assert.equal(response.body.data[0].teacher.fullName, 'Test Teacher');
  assert.equal(response.body.data[0].teacher.email, undefined);
});

test('availability rejects missing, repeated, fractional, and out-of-range timestamps', async () => {
  for (const query of ['', '?dateTimestamp=bad', '?dateTimestamp=1.5', '?dateTimestamp=99999999999999999', '?dateTimestamp=1&dateTimestamp=2']) {
    await request(app).get(`/sessions/available${query}`).expect(400);
  }
});

test('availability returns an empty array for a day with no sessions', async () => {
  const result = await request(app).get('/sessions/available').query({ dateTimestamp: Date.parse(future) }).expect(200);
  assert.deepEqual(result.body.data, []);
});

test('book session, reject a second booking, complete it and preserve completedAt', async () => {
  const id = await createSession();
  const booked = await request(app).post(`/sessions/${id}/book`).send({ userId }).expect(200);
  assert.equal(booked.body.data.userId, userId);
  assert.equal(booked.body.data.status, 'BOOKED');
  await request(app).post(`/sessions/${id}/book`).send({ userId }).expect(409);
  const complete = await request(app).patch(`/sessions/${id}/complete`).expect(200);
  assert.equal(complete.body.data.status, 'COMPLETED');
  assert.ok(Number.isFinite(Date.parse(complete.body.data.completedAt)));
  await request(app).patch(`/sessions/${id}/complete`).expect(409);
  await request(app).post(`/sessions/${id}/book`).send({ userId }).expect(409);
  assert.equal((await Session.findById(id))!.completedAt!.toISOString(), complete.body.data.completedAt);
});

test('two simultaneous users cannot book the same session', async () => {
  const id = await createSession();
  const other = await User.create({ fullName: 'Other', email: 'other@example.com', phone: '1234567890' });
  const results = await Promise.all([
    request(app).post(`/sessions/${id}/book`).send({ userId }),
    request(app).post(`/sessions/${id}/book`).send({ userId: other.id }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const winner = results.find(r => r.status === 200)!;
  assert.equal((await Session.findById(id))!.userId!.toString(), winner.body.data.userId);
});

test('two simultaneous completion requests yield one success and one conflict', async () => {
  const id = await createSession();
  await request(app).post(`/sessions/${id}/book`).send({ userId }).expect(200);
  const results = await Promise.all([request(app).patch(`/sessions/${id}/complete`), request(app).patch(`/sessions/${id}/complete`)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});

test('booking validates user and session existence without changing availability', async () => {
  const id = await createSession();
  await request(app).post(`/sessions/${id}/book`).send({ userId: absentId }).expect(404);
  await request(app).post(`/sessions/${absentId}/book`).send({ userId }).expect(404);
  await request(app).post(`/sessions/${id}/book`).send({ userId: 'invalid' }).expect(400);
  await request(app).post('/sessions/invalid/book').send({ userId }).expect(400);
  assert.equal((await Session.findById(id))!.status, 'AVAILABLE');
});

test('completion rejects available sessions, invalid IDs and nonexistent sessions', async () => {
  const id = await createSession();
  await request(app).patch(`/sessions/${id}/complete`).expect(409);
  await request(app).patch(`/sessions/${absentId}/complete`).expect(404);
  await request(app).patch('/sessions/invalid/complete').expect(400);
});

test('user history separates upcoming and completed; excludes other users and past uncompleted sessions', async () => {
  const id = await createSession();
  await request(app).post(`/sessions/${id}/book`).send({ userId }).expect(200);
  const completed = await Session.create({ teacherId, userId, startTime: '2020-01-01', endTime: '2020-01-02', status: 'COMPLETED', completedAt: '2020-01-02' });
  await Session.create({ teacherId, userId, startTime: '2020-01-01', endTime: '2020-01-02', status: 'BOOKED' });
  await Session.create({ teacherId, userId: new Types.ObjectId(), startTime: future, endTime: later, status: 'BOOKED' });
  const result = await request(app).get(`/users/${userId}/sessions`).expect(200);
  assert.deepEqual(result.body.data.upcomingSessions.map((s: { _id: string }) => s._id), [id]);
  assert.deepEqual(result.body.data.completedSessions.map((s: { _id: string }) => s._id), [completed.id]);
  assert.equal(result.body.data.completedSessions[0].teacher.email, undefined);
});

test('user history returns empty groups for an existing user and 404 for a missing user', async () => {
  const result = await request(app).get(`/users/${userId}/sessions`).expect(200);
  assert.deepEqual(result.body.data, { upcomingSessions: [], completedSessions: [] });
  await request(app).get(`/users/${absentId}/sessions`).expect(404);
  await request(app).get('/users/invalid/sessions').expect(400);
});

test('health and central JSON/route/body-size error handling', async () => {
  await request(app).get('/health').expect(200);
  const missing = await request(app).get('/missing').expect(404);
  assert.equal(missing.body.error.code, 'ROUTE_NOT_FOUND');
  const invalid = await request(app).post('/users').set('Content-Type', 'application/json').send('{').expect(400);
  assert.equal(invalid.body.error.code, 'INVALID_JSON');
  const large = await request(app).post('/users').send({ fullName: 'a'.repeat(110000) }).expect(413);
  assert.equal(large.body.error.code, 'PAYLOAD_TOO_LARGE');
});
