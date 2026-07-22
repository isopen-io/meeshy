import { formatLastSeenLabel } from '@/utils/presence-format';

/**
 * `formatLastSeenLabel` est le wrapper tolérant (nullable/illisible) de
 * `formatPresenceLabel`, adopté par la liste de contacts. Ces tests figent le
 * contrat que la copie locale divergente de `contacts/page.tsx` n'honorait pas :
 * règle de présence canonique 1/3/5 (le libellé s'accorde à la pastille), math
 * de jour calendaire, heure exacte au-delà de 24 h, plus les gardes
 * absent → neverSeen / illisible → offline.
 */
const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

// Ancre fixe injectée via `now` — aucun recours à l'horloge réelle.
const NOW = new Date('2024-01-15T12:00:00Z').getTime();

describe('formatLastSeenLabel', () => {
  describe('gardes absent / illisible', () => {
    it('rend status.online quand lastActiveAt est absent mais isOnline=true', () => {
      expect(formatLastSeenLabel({ lastActiveAt: undefined, isOnline: true, t, now: NOW })).toBe(
        'status.online',
      );
    });

    it('rend status.neverSeen quand lastActiveAt est absent et isOnline=false', () => {
      expect(formatLastSeenLabel({ lastActiveAt: undefined, isOnline: false, t, now: NOW })).toBe(
        'status.neverSeen',
      );
    });

    it('rend status.neverSeen quand lastActiveAt est null et isOnline inconnu', () => {
      expect(formatLastSeenLabel({ lastActiveAt: null, t, now: NOW })).toBe('status.neverSeen');
    });

    it('rend status.offline quand lastActiveAt est illisible (NaN)', () => {
      expect(formatLastSeenLabel({ lastActiveAt: 'not-a-date', isOnline: false, t, now: NOW })).toBe(
        'status.offline',
      );
    });
  });

  describe("règle de présence canonique (le libellé s'accorde à la pastille)", () => {
    it("traite un isOnline périmé (>5 min) comme hors-ligne — plus « en ligne »", () => {
      // Copie locale (buggée) : isOnline brut → status.online, désaccordé de la pastille.
      const tenMinAgo = new Date('2024-01-15T11:50:00Z').toISOString();
      expect(formatLastSeenLabel({ lastActiveAt: tenMinAgo, isOnline: true, t, now: NOW })).toBe(
        'status.lastSeenMinutes:{"count":10}',
      );
    });

    it("traite une activité < 60 s comme « en ligne » même si isOnline=false", () => {
      // Copie locale (buggée) : diffMin<1 → status.justNow, désaccordé de la pastille.
      const thirtySecAgo = new Date('2024-01-15T11:59:30Z').toISOString();
      expect(formatLastSeenLabel({ lastActiveAt: thirtySecAgo, isOnline: false, t, now: NOW })).toBe(
        'status.online',
      );
    });
  });

  describe('délégation aux paliers canoniques', () => {
    it('palier minutes', () => {
      const thirtyMinAgo = new Date('2024-01-15T11:30:00Z').toISOString();
      expect(formatLastSeenLabel({ lastActiveAt: thirtyMinAgo, isOnline: false, t, now: NOW })).toBe(
        'status.lastSeenMinutes:{"count":30}',
      );
    });

    it('palier heures', () => {
      const fourHoursAgo = new Date('2024-01-15T08:00:00Z').toISOString();
      expect(formatLastSeenLabel({ lastActiveAt: fourHoursAgo, isOnline: false, t, now: NOW })).toBe(
        'status.lastSeenHours:{"count":4}',
      );
    });

    it('jour calendaire « hier » avec heure exacte', () => {
      const lastActive = new Date('2024-01-14T12:00:00Z');
      const time = lastActive.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      expect(
        formatLastSeenLabel({ lastActiveAt: lastActive.toISOString(), isOnline: false, t, now: NOW }),
      ).toBe(`status.lastSeenYesterday:${JSON.stringify({ time })}`);
    });

    it('jour calendaire « avant-hier » avec heure exacte', () => {
      const lastActive = new Date('2024-01-13T12:00:00Z');
      const time = lastActive.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      expect(
        formatLastSeenLabel({ lastActiveAt: lastActive.toISOString(), isOnline: false, t, now: NOW }),
      ).toBe(`status.lastSeenBeforeYesterday:${JSON.stringify({ time })}`);
    });

    it('date absolue AVEC heure au-delà de 48 h (heure conservée, contrairement à la copie locale)', () => {
      const lastActive = new Date('2024-01-01T12:00:00Z');
      const time = lastActive.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' });
      const date = lastActive.toLocaleDateString('fr');
      expect(
        formatLastSeenLabel({
          lastActiveAt: lastActive.toISOString(),
          isOnline: false,
          t,
          locale: 'fr',
          now: NOW,
        }),
      ).toBe(`status.lastSeenDateTime:${JSON.stringify({ date, time })}`);
    });
  });
});
