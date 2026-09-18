import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/database/pool';
import bcrypt from 'bcrypt';

describe('POST /api/auth/register', () => {
  beforeAll(async () => {
    // Clean up test users table before running tests
    await pool.query('DELETE FROM users');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users');
    await pool.end();
  });

  it('1. Successfully registers a user and returns 201 Created with id and email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'register_test1@example.com',
        password: 'securePassword123',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('email', 'register_test1@example.com');
    expect(res.body.password).toBeUndefined();
    expect(res.body.password_hash).toBeUndefined();
    expect(res.body.totp_secret_encrypted).toBeUndefined();
  });

  it('2. Rejects registration with a duplicate email (409 Conflict)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'REGISTER_TEST1@example.com', // Case insensitive check
        password: 'anotherPassword123',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it('3. Rejects registration with invalid email format (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email-format',
        password: 'securePassword123',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid email format');
  });

  it('4. Rejects registration with short password (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'short_pass@example.com',
        password: 'short',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('at least 8 characters');
  });

  it('5. Verifies password is hashed in database and NOT stored as plaintext', async () => {
    const email = 'db_hash_check@example.com';
    const plainPassword = 'mySecretPassword999';

    await request(app)
      .post('/api/auth/register')
      .send({ email, password: plainPassword });

    const dbRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    expect(dbRes.rows).toHaveLength(1);

    const user = dbRes.rows[0];
    expect(user.password_hash).not.toEqual(plainPassword);
    expect(user.password_hash).toMatch(/^\$2[ayb]\$/); // Valid bcrypt hash prefix

    const isMatch = await bcrypt.compare(plainPassword, user.password_hash);
    expect(isMatch).toBe(true);
  });
});
