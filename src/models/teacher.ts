import { Schema, model } from 'mongoose';

const teacherSchema = new Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  specialization: { type: String, required: true, trim: true, maxlength: 200 },
  experience: { type: Number, required: true, min: 0, max: 80 },
}, { timestamps: true, versionKey: false });

export const Teacher = model('Teacher', teacherSchema);
