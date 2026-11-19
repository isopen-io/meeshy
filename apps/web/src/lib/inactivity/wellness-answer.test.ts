import { describe, expect, test } from 'bun:test';

import { WELLNESS_CHECK_NOTIFICATION_TYPE } from '@meeshy/shared/types/inactivity-check';

import type { NotificationRecord } from '@/lib/notifications/record';

import { WELLNESS_CHECK_TYPE, answerWellnessCheck } from './wellness-answer';

/**
 * « TOUT VA BIEN ? », ONGLET OUVERT (#18738) — toucher la question, dans la cloche ou sa bannière, répond
 * « Je vais bien » (`POST /me/wellness/ok`) ; toucher toute autre notification ne répond rien.
 */

const record = (type: string): NotificationRecord => ({
  id: 'n1',
  type,
  title: 'Tout va bien ?',
  content: 'Aucune activité depuis 12 h. Touchez pour rassurer vos Sangs.',
  actor: null,
  context: {},
  metadata: {},
  state: { isRead: false, createdAt: '2026-11-18T20:00:00.000Z' },
});

describe('répondre à « Tout va bien ? » en la touchant', () => {
  test('le type écrit en littéral est celui du contrat', () => {
    expect(WELLNESS_CHECK_TYPE).toBe(WELLNESS_CHECK_NOTIFICATION_TYPE);
  });

  test('la question touchée répond « Je vais bien », une fois', async () => {
    const sent: string[] = [];
    expect(await answerWellnessCheck(record('wellness_check'), { send: async () => void sent.push('ok') })).toBe(true);
    expect(sent).toEqual(['ok']);
  });

  test('une autre notification ne répond rien', async () => {
    const sent: string[] = [];
    expect(await answerWellnessCheck(record('inactivity_alert'), { send: async () => void sent.push('ok') })).toBe(false);
    expect(sent).toEqual([]);
  });

  test('un échec réseau ne lève pas', async () => {
    expect(await answerWellnessCheck(record('wellness_check'), { send: async () => Promise.reject(new Error('hors ligne')) })).toBe(false);
  });
});
