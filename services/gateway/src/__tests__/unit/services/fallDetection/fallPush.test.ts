/**
 * LE PUSH DE LA CHUTE (#18748) — push SEUL (aucune ligne `Notification` : rien de la chute ne survit
 * à l'épisode), texte d'écran verrouillé GÉNÉRIQUE dans la langue et le fuseau du destinataire, sans
 * aucun mot de santé ; catégorie iOS dédiée, `time-sensitive`, Ne pas déranger traversé.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { FALL_ALERT_PUSH_CATEGORY } from '../../../../services/notifications/push-header';
import { fallPusherOf, type FallPushSend } from '../../../../services/fallDetection/fallPush';
import { table } from '../../../helpers/messaging-circle-world';

const PERSONNE = '6700000000000000000000e1';
const SANG = '6700000000000000000000b1';

function monde(reader: Record<string, string | null> = { systemLanguage: 'fr', timezone: 'Europe/Paris' }) {
  const sent: Array<Parameters<FallPushSend>[0]> = [];
  const langs = { regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null, timezone: null };
  const prisma = {
    user: table([
      { id: PERSONNE, username: 'awa', displayName: 'Awa', avatar: null, systemLanguage: 'en', ...langs },
      { id: SANG, username: 'sang', displayName: null, avatar: null, ...langs, ...reader },
    ]),
  };
  const push = fallPusherOf({ prisma: prisma as never, send: async (options) => void sent.push(options) });
  return { push, sent };
}

describe('le push de la chute', () => {
  it('l\'alerte : titre et corps génériques, heure du lecteur, catégorie dédiée, time-sensitive, sans données de santé', async () => {
    const m = monde();
    expect(await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'detected', at: '2026-11-19T15:42:00.000Z' })).toBe(true);
    expect(m.sent).toEqual([{
      userId: SANG,
      bypassDnd: true,
      types: ['apns', 'fcm'],
      payload: {
        title: '⚠️ Alerte de sécurité',
        body: 'Awa · 16:42 — ouvrez Meeshy',
        category: FALL_ALERT_PUSH_CATEGORY,
        interruptionLevel: 'time-sensitive',
        collapseId: `fall-${PERSONNE}`,
        threadId: `fall-${PERSONNE}`,
        ttlMs: 6 * 3_600_000,
        data: { type: 'fall_detected', userId: PERSONNE },
      },
    }]);
    expect(FALL_ALERT_PUSH_CATEGORY).toBe('MEESHY_FALL_ALERT');
  });

  it('la réponse : « a répondu », même fil (remplace l\'alerte), sans heure', async () => {
    const m = monde({ systemLanguage: 'en', timezone: null });
    await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'responded', at: '2026-11-19T15:50:00.000Z' });
    expect(m.sent[0]?.payload).toEqual({
      title: 'Safety alert lifted',
      body: 'Awa responded',
      category: FALL_ALERT_PUSH_CATEGORY,
      collapseId: `fall-${PERSONNE}`,
      threadId: `fall-${PERSONNE}`,
      ttlMs: 6 * 3_600_000,
      data: { type: 'fall_cleared', userId: PERSONNE },
    });
  });

  it('un fuseau illisible retombe sur UTC ; un destinataire inconnu ne reçoit rien', async () => {
    const m = monde({ systemLanguage: 'fr', timezone: 'Pas/UnFuseau' });
    await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'detected', at: '2026-11-19T15:42:00.000Z' });
    expect(m.sent[0]?.payload.body).toBe('Awa · 15:42 — ouvrez Meeshy');
    expect(await m.push({ readerId: '6700000000000000000000ff', emitterId: PERSONNE, kind: 'detected', at: '2026-11-19T15:42:00.000Z' })).toBe(false);
  });
});
