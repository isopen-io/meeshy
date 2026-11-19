/**
 * LE PUSH DE LA CHUTE (#18748) — push SEUL (aucune ligne `Notification` : rien de la chute ne survit
 * à l'épisode), texte d'écran verrouillé GÉNÉRIQUE dans la langue et le fuseau du destinataire, sans
 * aucun mot de santé ; type, catégorie et fil NEUTRES et opaques (audit I3) ; `time-sensitive` et
 * Ne pas déranger traversé, sauf au-delà du plafond quotidien (audit I6) ; la levée chez qui perd
 * l'accès remplace l'alerte (audit B1).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { loggableCollapseId, SAFETY_ALERT_PUSH_CATEGORY } from '../../../../services/notifications/push-header';
import { fallPusherOf, type FallPushSend } from '../../../../services/fallDetection/fallPush';
import { table } from '../../../helpers/messaging-circle-world';

const PERSONNE = '6700000000000000000000e1';
const SANG = '6700000000000000000000b1';
const AT = '2026-11-19T15:42:00.000Z';

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
  it('l\'alerte : titre et corps génériques, heure du lecteur, catégorie et type neutres, time-sensitive', async () => {
    const m = monde();
    expect(await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'detected', at: AT, urgent: true })).toBe(true);
    const thread = m.sent[0]!.payload.collapseId!;
    expect(m.sent).toEqual([{
      userId: SANG,
      bypassDnd: true,
      types: ['apns', 'fcm'],
      payload: {
        title: '⚠️ Alerte de sécurité',
        body: 'Awa · 16:42 — ouvrez Meeshy',
        category: SAFETY_ALERT_PUSH_CATEGORY,
        interruptionLevel: 'time-sensitive',
        collapseId: thread,
        threadId: thread,
        ttlMs: 6 * 3_600_000,
        data: { type: 'safety_alert', userId: PERSONNE },
      },
    }]);
    expect(SAFETY_ALERT_PUSH_CATEGORY).toBe('MEESHY_SAFETY_ALERT');
  });

  it('le fil est OPAQUE et STABLE : ni l\'identifiant de l\'émetteur, ni un mot de santé, le même d\'un push à l\'autre', async () => {
    const m = monde();
    await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'detected', at: AT, urgent: true });
    await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'responded', at: AT });
    const [first, second] = m.sent.map((s) => s.payload.collapseId!);
    expect(first).toBe(second);
    expect(first.toLowerCase()).not.toContain(PERSONNE);
    expect(first).not.toMatch(/fall|chute|health/i);
    expect(first.length).toBeLessThanOrEqual(64);
  });

  it('la réponse : « a répondu », même fil (remplace l\'alerte), sans heure', async () => {
    const m = monde({ systemLanguage: 'en', timezone: null });
    await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'responded', at: '2026-11-19T15:50:00.000Z' });
    expect(m.sent[0]?.payload).toMatchObject({
      title: 'Safety alert lifted',
      body: 'Awa responded',
      category: SAFETY_ALERT_PUSH_CATEGORY,
      ttlMs: 6 * 3_600_000,
      data: { type: 'safety_alert_cleared', userId: PERSONNE },
    });
    expect(m.sent[0]?.payload.interruptionLevel).toBeUndefined();
  });

  it('la levée chez qui perd l\'accès : neutre, sans dire que la personne a répondu', async () => {
    const m = monde({ systemLanguage: 'en', timezone: null });
    await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'lifted', at: AT });
    expect(m.sent[0]?.payload).toMatchObject({ title: 'Safety alert lifted', body: 'Awa', data: { type: 'safety_alert_cleared', userId: PERSONNE } });
    expect(m.sent[0]?.payload.interruptionLevel).toBeUndefined();
  });

  it('au-delà du plafond quotidien, l\'alerte part sans percer ni traverser Ne pas déranger', async () => {
    const m = monde();
    await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'detected', at: AT, urgent: false });
    expect(m.sent[0]?.bypassDnd).toBe(false);
    expect(m.sent[0]?.payload.interruptionLevel).toBeUndefined();
    expect(m.sent[0]?.payload.data).toEqual({ type: 'safety_alert', userId: PERSONNE });
  });

  it('un fuseau illisible retombe sur UTC ; un destinataire inconnu ne reçoit rien', async () => {
    const m = monde({ systemLanguage: 'fr', timezone: 'Pas/UnFuseau' });
    await m.push({ readerId: SANG, emitterId: PERSONNE, kind: 'detected', at: AT, urgent: true });
    expect(m.sent[0]?.payload.body).toBe('Awa · 15:42 — ouvrez Meeshy');
    expect(await m.push({ readerId: '6700000000000000000000ff', emitterId: PERSONNE, kind: 'detected', at: AT, urgent: true })).toBe(false);
  });
});

describe('le transport ne journalise jamais le fil d\'une alerte de sécurité', () => {
  it('safety_alert et safety_alert_cleared : aucun collapseId au journal ; les autres types gardent le leur', () => {
    expect(loggableCollapseId({ collapseId: 'sa-0123', data: { type: 'safety_alert' } })).toBeUndefined();
    expect(loggableCollapseId({ collapseId: 'sa-0123', data: { type: 'safety_alert_cleared' } })).toBeUndefined();
    expect(loggableCollapseId({ collapseId: 'badge-1', data: { type: 'badge_sync' } })).toBe('badge-1');
    expect(loggableCollapseId({ collapseId: 'game-photo-moment' })).toBe('game-photo-moment');
    expect(loggableCollapseId({ data: { type: 'safety_alert' } })).toBeUndefined();
  });
});
