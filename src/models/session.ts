import { Schema, model } from 'mongoose';

const sessionSchema = new Schema({
  teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: { type: String, enum: ['AVAILABLE', 'BOOKED', 'COMPLETED'], default: 'AVAILABLE', required: true },
  completedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

sessionSchema.index({ status: 1, startTime: 1 });
sessionSchema.index({ userId: 1, status: 1, startTime: 1 });

export const Session = model('Session', sessionSchema);
