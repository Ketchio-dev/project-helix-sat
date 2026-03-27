import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../services/api/src/store.mjs';
import { verifyToken } from '../services/api/src/auth.mjs';

describe('auth', () => {
  it('demo user can login with demo1234 and get a valid token', () => {
    const store = createStore();
    const result = store.loginUser({ email: 'mina@example.com', password: 'demo1234' });
    assert.ok(result.user);
    assert.ok(result.token);
    assert.equal(result.user.email, 'mina@example.com');
  });

  it('loginUser throws for wrong password', () => {
    const store = createStore();
    assert.throws(
      () => store.loginUser({ email: 'mina@example.com', password: 'wrongpassword' }),
      /Invalid credentials/i,
    );
  });

  it('loginUser throws for unknown email', () => {
    const store = createStore();
    assert.throws(
      () => store.loginUser({ email: 'nobody@example.com', password: 'demo1234' }),
      /Invalid credentials/i,
    );
  });

  it('registerUser creates a new user and returns token', () => {
    const store = createStore();
    const result = store.registerUser({ name: 'Test User', email: 'test@example.com', password: 'pass1234' });
    assert.ok(result.user);
    assert.ok(result.token);
    assert.equal(result.user.name, 'Test User');
    assert.equal(result.user.email, 'test@example.com');
    assert.equal(result.user.role, 'student');
    assert.equal(result.user.password, undefined, 'password should not be returned');
  });

  it('registered user can login with their password', () => {
    const store = createStore();
    store.registerUser({ name: 'Test User', email: 'test@example.com', password: 'pass1234' });
    const result = store.loginUser({ email: 'test@example.com', password: 'pass1234' });
    assert.ok(result.user);
    assert.ok(result.token);
    assert.equal(result.user.email, 'test@example.com');
  });

  it('registerUser rejects duplicate email', () => {
    const store = createStore();
    store.registerUser({ name: 'First', email: 'dup@example.com', password: 'pass1234' });
    assert.throws(
      () => store.registerUser({ name: 'Second', email: 'dup@example.com', password: 'pass4567' }),
      /already registered/i,
    );
  });

  it('registerUser rejects privileged role input', () => {
    const store = createStore();
    assert.throws(
      () => store.registerUser({ name: 'Bad Role', email: 'badrole@example.com', password: 'pass1234', role: 'teacher' }),
      /only create student/i,
    );
  });

  it('token from login can be verified with verifyToken', () => {
    const store = createStore();
    const result = store.loginUser({ email: 'mina@example.com', password: 'demo1234' });
    const payload = verifyToken(result.token);
    assert.ok(payload);
    assert.ok(payload.userId);
    assert.ok(payload.role);
  });

  it('verifyToken returns null for garbage input', () => {
    assert.equal(verifyToken('garbage.token'), null);
    assert.equal(verifyToken(null), null);
    assert.equal(verifyToken(''), null);
    assert.equal(verifyToken('notavalidtoken'), null);
  });

  it('registered student gets initialized profile, skillStates, errorDna', () => {
    const store = createStore();
    const result = store.registerUser({ name: 'Student', email: 'student@example.com', password: 'pass1234' });
    const userId = result.user.id;
    assert.deepEqual(store.getSkillStates(userId), []);
    assert.deepEqual(store.getErrorDna(userId), {});
    assert.deepEqual(store.getReflections(userId), []);
  });

  it('registerUser stores scrypt password hashes', () => {
    const store = createStore();
    const result = store.registerUser({ name: 'Student', email: 'secure@example.com', password: 'pass1234' });
    assert.match(store.getUser(result.user.id).password, /^scrypt-v1\$/);
  });
});
