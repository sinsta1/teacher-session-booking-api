import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
  phone: { type: String, required: true, trim: true, maxlength: 25 },
}, { timestamps: true, versionKey: false });

export const User = model('User', userSchema);
