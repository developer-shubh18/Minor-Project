const express = require('express');
const request = require('supertest');
const { signupValidation, loginValidation, translateValidation } = require('../middleware/validationMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');

describe('Security & Validation Middleware Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Validation Middleware', () => {
    test('POST /test-signup rejects invalid signup payloads', async () => {
      app.post('/test-signup', signupValidation, (req, res) => res.json({ status: 'ok' }));

      const res = await request(app)
        .post('/test-signup')
        .send({ username: 'a', email: 'not-an-email', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThanOrEqual(3);
    });

    test('POST /test-signup accepts valid signup payloads', async () => {
      app.post('/test-signup', signupValidation, (req, res) => res.json({ status: 'ok' }));

      const res = await request(app)
        .post('/test-signup')
        .send({ username: 'valid_user', email: 'user@example.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    test('POST /test-translate rejects payload exceeding max length', async () => {
      app.post('/test-translate', translateValidation, (req, res) => res.json({ status: 'ok' }));

      const hugeText = 'a'.repeat(5001);
      const res = await request(app)
        .post('/test-translate')
        .send({ text: hugeText, targetLanguage: 'hi' });

      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('text');
    });
  });

  describe('Admin Authorization Middleware', () => {
    test('rejects non-admin users with 403', async () => {
      app.get('/test-admin', (req, res, next) => {
        req.user = { id: '123', isAdmin: false };
        next();
      }, adminOnly, (req, res) => res.json({ status: 'admin_ok' }));

      const res = await request(app).get('/test-admin');
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Admin privileges required');
    });

    test('allows admin users with 200', async () => {
      app.get('/test-admin', (req, res, next) => {
        req.user = { id: '123', isAdmin: true };
        next();
      }, adminOnly, (req, res) => res.json({ status: 'admin_ok' }));

      const res = await request(app).get('/test-admin');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('admin_ok');
    });
  });
});
