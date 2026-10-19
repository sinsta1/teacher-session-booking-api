import { Types } from 'mongoose';
import { Session } from '../models/session.js';
import { User } from '../models/user.js';
import { Teacher } from '../models/teacher.js';
import { AppError } from '../utils/errors.js';

export async function createSession(teacherId: Types.ObjectId, startTime: Date, endTime: Date) {
  if (endTime <= startTime) throw new AppError(400, 'INVALID_TIME_RANGE', 'endTime must be greater than startTime');
  if (!await Teacher.exists({ _id: teacherId })) throw new AppError(404, 'TEACHER_NOT_FOUND', 'Teacher not found');
  return await Session.create({ teacherId, startTime, endTime });
}

export async function availableSessions(start: Date, end: Date) {
  return await Session.aggregate([
    { $match: { status: 'AVAILABLE', startTime: { $gte: start, $lt: end } } },
    { $sort: { startTime: 1, _id: 1 } },
    { $lookup: { from: 'teachers', localField: 'teacherId', foreignField: '_id', as: 'teacher' } },
    { $unwind: { path: '$teacher', preserveNullAndEmptyArrays: true } },
    { $project: { teacher: { email: 0 } } },
  ]);
}

export async function bookSession(id: Types.ObjectId, userId: Types.ObjectId) {
  if (!await User.exists({ _id: userId })) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  // The status condition and mutation run as one atomic database operation.
  const session = await Session.findOneAndUpdate(
    { _id: id, status: 'AVAILABLE' },
    { $set: { status: 'BOOKED', userId } },
    { returnDocument: 'after', runValidators: true },
  );
  if (session) return session;
  if (!await Session.exists({ _id: id })) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
  throw new AppError(409, 'SESSION_NOT_AVAILABLE', 'Only AVAILABLE sessions can be booked');
}

export async function completeSession(id: Types.ObjectId) {
  const session = await Session.findOneAndUpdate(
    { _id: id, status: 'BOOKED' },
    { $set: { status: 'COMPLETED', completedAt: new Date() } },
    { returnDocument: 'after', runValidators: true },
  );
  if (session) return session;
  if (!await Session.exists({ _id: id })) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
  throw new AppError(409, 'SESSION_NOT_BOOKED', 'Only BOOKED sessions can be completed');
}

export async function userSessions(userId: Types.ObjectId, now = new Date()) {
  if (!await User.exists({ _id: userId })) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  const [result] = await Session.aggregate([
    { $match: { userId } },
    { $lookup: { from: 'teachers', localField: 'teacherId', foreignField: '_id', as: 'teacher' } },
    { $unwind: { path: '$teacher', preserveNullAndEmptyArrays: true } },
    { $project: { teacher: { email: 0 } } },
    { $facet: {
      upcomingSessions: [
        { $match: { status: 'BOOKED', startTime: { $gte: now } } },
        { $sort: { startTime: 1, _id: 1 } },
      ],
      completedSessions: [
        { $match: { status: 'COMPLETED' } },
        { $sort: { completedAt: -1, _id: 1 } },
      ],
    } },
  ]);
  return result ?? { upcomingSessions: [], completedSessions: [] };
}
