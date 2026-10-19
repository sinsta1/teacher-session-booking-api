import type { Request, Response } from 'express';
import { User } from '../models/user.js';
import { Teacher } from '../models/teacher.js';
import * as sessions from '../services/session-service.js';
import { bodyObject, textField, emailField, objectId, dateField, utcDateRange } from '../utils/validation.js';
import { AppError } from '../utils/errors.js';

export async function createUser(req: Request, res: Response) {
  const body = bodyObject(req.body);
  const user = await User.create({
    fullName: textField(body.fullName, 'fullName'), email: emailField(body.email), phone: textField(body.phone, 'phone', 25),
  });
  res.status(201).json({ data: user });
}

export async function createTeacher(req: Request, res: Response) {
  const body = bodyObject(req.body);
  if (typeof body.experience !== 'number' || !Number.isFinite(body.experience) || body.experience < 0 || body.experience > 80) {
    throw new AppError(400, 'VALIDATION_ERROR', 'experience must be a number from 0 to 80 (years)');
  }
  const teacher = await Teacher.create({
    fullName: textField(body.fullName, 'fullName'), email: emailField(body.email),
    specialization: textField(body.specialization, 'specialization', 200), experience: body.experience,
  });
  res.status(201).json({ data: teacher });
}

export async function createSession(req: Request, res: Response) {
  const body = bodyObject(req.body);
  const session = await sessions.createSession(objectId(body.teacherId, 'teacherId'), dateField(body.startTime, 'startTime'), dateField(body.endTime, 'endTime'));
  res.status(201).json({ data: session });
}

export async function availableSessions(req: Request, res: Response) {
  const { start, end } = utcDateRange(req.query.dateTimestamp);
  res.json({ data: await sessions.availableSessions(start, end) });
}

export async function bookSession(req: Request, res: Response) {
  const id = objectId(req.params.id);
  const body = bodyObject(req.body);
  res.json({ data: await sessions.bookSession(id, objectId(body.userId, 'userId')) });
}

export async function completeSession(req: Request, res: Response) {
  res.json({ data: await sessions.completeSession(objectId(req.params.id)) });
}

export async function userSessions(req: Request, res: Response) {
  res.json({ data: await sessions.userSessions(objectId(req.params.id)) });
}
