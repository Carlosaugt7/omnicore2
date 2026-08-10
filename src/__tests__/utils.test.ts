import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatBRL,
  getLocalDateStr,
  formatDate,
  getDisplayStatus,
  replaceMessageVars,
  CLIENT_STATUS_COLORS,
  TRANSACTION_STATUS_COLORS,
  LOG_STATUS_COLORS,
  TRANSACTION_TYPE_LABELS,
  cn,
} from '@/lib/utils';

// ── formatBRL ──────────────────────────────────────────────────

describe('formatBRL', () => {
  it('formats zero correctly', () => {
    expect(formatBRL(0)).toBe('R$\xa00,00');
  });

  it('formats integer values', () => {
    expect(formatBRL(1000)).toBe('R$\xa01.000,00');
  });

  it('formats decimal values', () => {
    expect(formatBRL(29.90)).toBe('R$\xa029,90');
  });

  it('formats negative values', () => {
    expect(formatBRL(-50)).toBe('-R$\xa050,00');
  });

  it('formats large values', () => {
    expect(formatBRL(1234567.89)).toBe('R$\xa01.234.567,89');
  });
});

// ── getLocalDateStr ────────────────────────────────────────────

describe('getLocalDateStr', () => {
  it('returns YYYY-MM-DD format for known date', () => {
    const d = new Date(2024, 0, 15); // Jan 15, 2024
    expect(getLocalDateStr(d)).toBe('2024-01-15');
  });

  it('pads single-digit month and day', () => {
    const d = new Date(2024, 3, 5); // Apr 5, 2024
    expect(getLocalDateStr(d)).toBe('2024-04-05');
  });

  it('handles year boundary', () => {
    const d = new Date(2023, 11, 31); // Dec 31, 2023
    expect(getLocalDateStr(d)).toBe('2023-12-31');
  });
});

// ── formatDate ─────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats date string to DD/MM/AAAA', () => {
    expect(formatDate('2024-06-15')).toBe('15/06/2024');
  });

  it('formats year boundary', () => {
    expect(formatDate('2024-01-01')).toBe('01/01/2024');
  });
});

// ── getDisplayStatus ───────────────────────────────────────────

describe('getDisplayStatus', () => {
  it('returns "cancelado" when status is cancelado', () => {
    expect(getDisplayStatus({ status: 'cancelado', due_date: null })).toBe('cancelado');
  });

  it('returns "suspenso" when status is suspenso', () => {
    expect(getDisplayStatus({ status: 'suspenso', due_date: null })).toBe('suspenso');
  });

  it('returns status when due_date is null', () => {
    expect(getDisplayStatus({ status: 'custom', due_date: null })).toBe('custom');
  });

  it('returns "vencido" for past due_date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastDate = getLocalDateStr(yesterday);
    expect(getDisplayStatus({ status: 'ativo', due_date: pastDate })).toBe('vencido');
  });

  it('returns "ativo" for future due_date beyond tomorrow', () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const futureDate = getLocalDateStr(future);
    expect(getDisplayStatus({ status: 'ativo', due_date: futureDate })).toBe('ativo');
  });

  it('returns "à vencer" for today', () => {
    const today = getLocalDateStr(new Date());
    expect(getDisplayStatus({ status: 'ativo', due_date: today })).toBe('à vencer');
  });

  it('returns "à vencer" for tomorrow', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrow = getLocalDateStr(d);
    expect(getDisplayStatus({ status: 'ativo', due_date: tomorrow })).toBe('à vencer');
  });

  it('cancelado overrides due_date vencido', () => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const pastDate = getLocalDateStr(d);
    expect(getDisplayStatus({ status: 'cancelado', due_date: pastDate })).toBe('cancelado');
  });
});

// ── replaceMessageVars ─────────────────────────────────────────

describe('replaceMessageVars', () => {
  const sampleClient = {
    name: 'João Silva',
    plan: 'IPTV Premium',
    value: 49.90,
    due_date: '2024-06-15',
    server: 'Server SP',
  };

  it('replaces all variables in template', () => {
    const template = 'Olá {nome}! Seu plano {plano} de R$ {valor} vence em {vencimento}. Servidor: {servidor}. Pix: {chavePix}.';
    const result = replaceMessageVars(template, sampleClient, 'minha-chave');
    expect(result).toContain('João Silva');
    expect(result).toContain('IPTV Premium');
    expect(result).toContain('49.90');
    expect(result).toContain('15/06/2024');
    expect(result).toContain('Server SP');
    expect(result).toContain('minha-chave');
  });

  it('handles null name', () => {
    const result = replaceMessageVars('Olá {nome}!', { name: null }, undefined);
    expect(result).toBe('Olá !');
  });

  it('handles missing value', () => {
    const result = replaceMessageVars('Valor: {valor}', { value: null }, undefined);
    expect(result).toBe('Valor: 0.00');
  });

  it('handles case-insensitive placeholders', () => {
    const result = replaceMessageVars('Olá {NOME}, plano {Plano}', sampleClient, undefined);
    expect(result).toBe('Olá João Silva, plano IPTV Premium');
  });
});

// ── Status Colors ──────────────────────────────────────────────

describe('Status Colors', () => {
  it('CLIENT_STATUS_COLORS has all required keys', () => {
    const keys = Object.keys(CLIENT_STATUS_COLORS);
    expect(keys).toContain('ativo');
    expect(keys).toContain('vencido');
    expect(keys).toContain('à vencer');
    expect(keys).toContain('suspenso');
    expect(keys).toContain('cancelado');
  });

  it('TRANSACTION_STATUS_COLORS has all required keys', () => {
    const keys = Object.keys(TRANSACTION_STATUS_COLORS);
    expect(keys).toContain('pago');
    expect(keys).toContain('pendente');
    expect(keys).toContain('cancelado');
  });

  it('LOG_STATUS_COLORS has all required keys', () => {
    const keys = Object.keys(LOG_STATUS_COLORS);
    expect(keys).toContain('success');
    expect(keys).toContain('failed');
    expect(keys).toContain('pending');
  });

  it('TRANSACTION_TYPE_LABELS has all required keys', () => {
    const keys = Object.keys(TRANSACTION_TYPE_LABELS);
    expect(keys).toContain('entrada');
    expect(keys).toContain('saida');
    expect(keys).toContain('renovacao');
  });
});

// ── cn (classname merge) ───────────────────────────────────────

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'extra')).toBe('base extra');
  });

  it('resolves Tailwind conflicts', () => {
    expect(cn('px-4', 'px-8')).toBe('px-8');
  });
});
