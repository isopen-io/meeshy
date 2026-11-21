/**
 * LES NOTIFICATIONS DE L'INACTIVITÉ (#18738) — « Tout va bien ? » à la personne, l'alerte et le
 * retour à un Sang, cadrés dans la langue du destinataire. Ni la batterie ni la position ne sont
 * JAMAIS dans le texte.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { inactivityPusherOf, wellnessAskerOf, type InactivityNotifier } from '../../../../services/inactivityCheck/inactivityPush';
import { table } from '../../../helpers/messaging-circle-world';

const PERSONNE = '6700000000000000000000e1';
const SANG = '6700000000000000000000b1';
const DEPUIS = '2026-11-16T08:00:00.000Z';
const AT = '2026-11-16T20:30:00.000Z';

function monde(readerLang: Record<string, string | null> = { systemLanguage: 'fr' }) {
  const created: Array<Parameters<InactivityNotifier['createNotification']>[0]> = [];
  const notifications: InactivityNotifier = {
    createNotification: async (params) => {
      created.push(params);
      return { id: 'n1' } as never;
    },
  };
  const langs = { regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null };
  const prisma = {
    user: table([
      { id: PERSONNE, username: 'jacques', displayName: 'Jacques', avatar: null, systemLanguage: 'en', ...langs },
      { id: SANG, username: 'sang', displayName: null, avatar: null, ...langs, ...readerLang },
    ]),
  };
  const replaced: unknown[] = [];
  const options = { prisma: prisma as never, notifications, now: () => Date.parse(AT) };
  return {
    push: inactivityPusherOf({ ...options, replacePrevious: async (pair) => void replaced.push(pair) }),
    ask: wellnessAskerOf({ ...options, replacePrevious: async (userId) => void replaced.push(userId) }),
    created,
    replaced,
  };
}

const alerte = { kind: 'alert' as const, inactiveSince: DEPUIS, at: AT };
const etat = (extra: object = {}) => ({ userId: PERSONNE, inactiveSince: DEPUIS, alertedAt: AT, ...extra });

describe('« Tout va bien ? »', () => {
  it('part à la personne, dans SA langue, en remplaçant la question précédente', async () => {
    const m = monde();
    await m.ask(PERSONNE, { inactiveSince: DEPUIS, delayHours: 12 });
    expect(m.replaced).toEqual([PERSONNE]);
    expect(m.created[0]).toMatchObject({
      userId: PERSONNE,
      type: 'wellness_check',
      priority: 'high',
      title: 'Are you OK?',
      content: 'No activity for 13 h. Tap to reassure your Blood.',
      metadata: { action: 'none', wellnessCheck: true },
      collapseId: `wellness-${PERSONNE}`,
    });
  });
});

describe('l\'alerte et le retour à un Sang', () => {
  it('dit depuis combien d\'heures, sans batterie quand elle n\'est pas servie, et jamais la position', async () => {
    const m = monde();
    await m.push({ readerId: SANG, emitterId: PERSONNE, announcement: alerte, state: etat({ lastPosition: { latitude: 48.8566, longitude: 2.3522, recordedAt: DEPUIS } }) });
    expect(m.created[0]).toMatchObject({
      userId: SANG,
      type: 'inactivity_alert',
      priority: 'high',
      title: 'Jacques n’a pas répondu à « Tout va bien ? »',
      content: 'Aucune activité depuis 13 h',
      metadata: { action: 'view_profile', userId: PERSONNE, inactivityKind: 'alert' },
      collapseId: `inactivity-${PERSONNE}`,
    });
    expect(JSON.stringify(m.created[0])).not.toContain('48.8566');
    expect(m.replaced).toEqual([{ emitterId: PERSONNE, readerId: SANG }]);
  });

  it('ne range jamais la batterie dans le texte, même quand l\'état servi la porte', async () => {
    const m = monde({ systemLanguage: 'en' });
    await m.push({ readerId: SANG, emitterId: PERSONNE, announcement: alerte, state: etat({ lastBattery: { level: 9, measuredAt: DEPUIS } }) });
    expect(m.created[0]?.content).toBe('No activity for 13 h');
    expect(JSON.stringify(m.created[0])).not.toContain('9%');
  });

  it('le retour dit que la personne va bien', async () => {
    const m = monde();
    await m.push({ readerId: SANG, emitterId: PERSONNE, announcement: { kind: 'responded', inactiveSince: DEPUIS, at: AT } });
    expect(m.created[0]).toMatchObject({ title: 'Jacques va bien', content: 'Son téléphone est de nouveau actif', priority: 'normal' });
  });
});
