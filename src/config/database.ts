import mongoose from 'mongoose';
import { User } from '../models/user.js';
import { Teacher } from '../models/teacher.js';
import { Session } from '../models/session.js';

export async function connectDatabase(uri: string) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  // Build the unique email index before accepting requests, including first startup.
  await User.init();
  await Teacher.init();
  await Session.init();
}
