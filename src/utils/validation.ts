import { Types } from 'mongoose';
import { AppError } from './errors.js';

function invalid(message: string): never {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

export function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Body must be a JSON object');
  return value as Record<string, unknown>;
}

export function textField(value: unknown, name: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    invalid(`${name} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

export function emailField(value: unknown): string {
  const email = textField(value, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('email must be a valid email address');
  return email;
}

export function objectId(value: unknown, name = 'id'): Types.ObjectId {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) invalid(`${name} must be a valid ObjectId`);
  return new Types.ObjectId(value);
}

export function dateField(value: unknown, name: string): Date {
  // Require an explicit timezone so server locale cannot change the booking time.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    invalid(`${name} must be an ISO 8601 datetime with a timezone`);
  }
  const date = new Date(value);
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) {
    invalid(`${name} must be a valid datetime`);
  }
  const calendarDate = value.slice(0, 10);
  const calendar = new Date(`${calendarDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== calendarDate) {
    invalid(`${name} must be a valid datetime`);
  }
  return date;
}

export function utcDateRange(value: unknown): { start: Date; end: Date } {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) invalid('dateTimestamp must be a Unix timestamp in milliseconds');
  const timestamp = Number(value);
  const date = new Date(timestamp);
  if (!Number.isSafeInteger(timestamp) || !Number.isFinite(date.getTime())) invalid('dateTimestamp is out of range');
  date.setUTCHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + 1);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(end.getTime())) invalid('dateTimestamp is out of range');
  return { start: date, end };
}
