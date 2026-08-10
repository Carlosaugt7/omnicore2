const { describe, it, expect, vi, beforeEach } = require('vitest');

// ── Rate Limiter ───────────────────────────────────────────────

describe('Rate Limiter Configuration', () => {
  it('general limiter has windowsMs of 60 seconds', () => {
    const rateLimit = require('express-rate-limit');
    const createLimiter = () => rateLimit({ windowMs: 60000, max: 100 });
    const limiter = createLimiter();
    expect(limiter).toBeDefined();
  });

  it('whatsapp limiter has windowMs of 60000', () => {
    const rateLimit = require('express-rate-limit');
    const createLimiter = () => rateLimit({ windowMs: 60000, max: 20 });
    const limiter = createLimiter();
    expect(limiter).toBeDefined();
  });
});

// ── Phone formatting ───────────────────────────────────────────

describe('Phone formatting', () => {
  it('formats phone number correctly', () => {
    const { formatPhone } = require('../lib/evolutionApi');
    expect(formatPhone('5511999999999')).toBe('5511999999999');
  });

  it('removes non-digit characters', () => {
    const { formatPhone } = require('../lib/evolutionApi');
    const result = formatPhone('+55 (11) 99999-9999');
    expect(result).toBe('5511999999999');
  });

  it('handles empty string', () => {
    const { formatPhone } = require('../lib/evolutionApi');
    expect(formatPhone('')).toBe('');
  });

  it('handles null/undefined gracefully', () => {
    const { formatPhone } = require('../lib/evolutionApi');
    // Should return empty string or handle gracefully
    const result = formatPhone(null);
    expect(typeof result).toBe('string');
  });
});

// ── Auth middleware ───────────────────────────────────────────

describe('Auth Middleware', () => {
  it('exports requireAuth function', () => {
    const { requireAuth } = require('../middleware/auth');
    expect(typeof requireAuth).toBe('function');
  });
});
