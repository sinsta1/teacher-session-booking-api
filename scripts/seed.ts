import mongoose from 'mongoose';
import { readConfig } from '../src/config/env.js';
import { connectDatabase } from '../src/config/database.js';
import { Teacher } from '../src/models/teacher.js';

try {
  await connectDatabase(readConfig().mongoUri);
  const teacher = await Teacher.findOneAndUpdate(
    { email: 'teacher@example.com' },
    { $setOnInsert: { fullName: 'Demo Teacher', email: 'teacher@example.com', specialization: 'Computer Science', experience: 5 } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  console.log(`Sample teacherId: ${teacher!._id}`);
} finally { await mongoose.disconnect(); }
