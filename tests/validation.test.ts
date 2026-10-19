import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { app } from '../src/app.js';
import { AppError } from '../src/utils/errors.js';
import { bodyObject, emailField, objectId, dateField, utcDateRange } from '../src/utils/validation.js';

test('accept valid ObjectIds and reject objects, operators and malformed IDs', () => {
  assert.equal(objectId('507f1f77bcf86cd799439011').toHexString(), '507f1f77bcf86cd799439011');
  for (const value of [null, '', 'invalid', { $ne: null }, 42]) assert.throws(() => objectId(value), AppError);
});

test('body must be an object and email is normalized', () => {
  assert.deepEqual(bodyObject({ fullName: 'Student' }), { fullName: 'Student' });
  for (const value of [null, [], 'string', 1]) assert.throws(() => bodyObject(value), AppError);
  assert.equal(emailField(' USER@Example.com '), 'user@example.com');
  for (const value of ['missing-at', 'a b@example.com', 12, { $gt: '' }]) assert.throws(() => emailField(value), AppError);
});

test('parse timezone-aware datetimes and reject impossible dates or local times', () => {
  assert.equal(dateField('2040-06-15T15:30:00+05:30', 'startTime').toISOString(), '2040-06-15T10:00:00.000Z');
  assert.equal(dateField('2040-02-29T10:00:00Z', 'startTime').toISOString(), '2040-02-29T10:00:00.000Z');
  for (const value of ['2041-02-29T10:00:00Z', '2040-02-30T10:00:00Z', '2040-06-15T24:00:00Z', '2040-06-15T10:00:00', 123, null]) {
    assert.throws(() => dateField(value, 'startTime'), AppError);
  }
});

test('UTC date range handles year boundaries and the epoch', () => {
  const range = utcDateRange(String(Date.parse('2040-12-31T23:59:59.999Z')));
  assert.equal(range.start.toISOString(), '2040-12-31T00:00:00.000Z');
  assert.equal(range.end.toISOString(), '2041-01-01T00:00:00.000Z');
  assert.equal(utcDateRange('0').start.toISOString(), '1970-01-01T00:00:00.000Z');
});

test('reject missing, repeated, fractional and out-of-range query values', () => {
  for (const value of [undefined, ['1', '2'], '1.5', 'abc', '', '999999999999999999', '8640000000000000']) {
    assert.throws(() => utcDateRange(value), AppError);
  }
});

test('HTTP middleware reports malformed JSON, oversized bodies and unknown routes', async () => {
  const malformed = await request(app).post('/users').set('Content-Type', 'application/json').send('{').expect(400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  const large = await request(app).post('/users').send({ fullName: 'a'.repeat(110000) }).expect(413);
  assert.equal(large.body.error.code, 'PAYLOAD_TOO_LARGE');
  const missing = await request(app).get('/missing').expect(404);
  assert.equal(missing.body.error.code, 'ROUTE_NOT_FOUND');
});

test('HTTP validation and readiness work before the database is connected', async () => {
  await request(app).get('/health').expect(503);
  await request(app).post('/users').send({}).expect(400);
  await request(app).get('/sessions/available?dateTimestamp=invalid').expect(400);
  await request(app).post('/sessions/invalid/book').send({ userId: 'invalid' }).expect(400);
});
