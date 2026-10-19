import { Router } from 'express';
import * as controllers from '../controllers/controllers.js';

export const router = Router();
router.post('/users', controllers.createUser);
router.post('/teachers', controllers.createTeacher);
router.post('/sessions', controllers.createSession);
router.get('/sessions/available', controllers.availableSessions);
router.post('/sessions/:id/book', controllers.bookSession);
router.patch('/sessions/:id/complete', controllers.completeSession);
router.get('/users/:id/sessions', controllers.userSessions);
