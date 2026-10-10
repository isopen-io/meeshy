/**
 * `/conversations/:id/shared-translations` — ce que la route plafonne (#9899).
 *
 * Deux plafonds par minute, chacun épinglé à son CHIFFRE : les partages (120 par
 * minute et par compte) et les lectures (60 par minute et par compte).
 *
 * Les témoins de débit de la suite principale comptent jusqu'à
 * `SHARED_TRANSLATION_SHARE_RATE_LIMIT.max`, la constante qu'ils mesurent :
 * décupler le plafond ne les fait pas tomber. Ceux-ci écrivent le chiffre — un
 * plafond est une décision, et la changer doit faire rougir un témoin.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import {
  SHARED_TRANSLATION_READ_RATE_LIMIT,
  SHARED_TRANSLATION_SHARE_RATE_LIMIT,
} from '../../../routes/conversations/shared-translations';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import {
  GUEST,
  buildApp,
  guestAs,
  registeredAs,
  shareBody,
  type Harness,
} from './conversation-shared-translations-harness';
import { CONV_A, HARNESS_NOW, MSG_1, OTHER_USER_ID, USER_ID } from './me/starred-messages-harness';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('/conversations/:id/shared-translations — les plafonds par minute se comptent par COMPTE', () => {
  const FIRST_INSTANT = HARNESS_NOW.getTime();
  const url = `/conversations/${CONV_A}/shared-translations`;

  const account = (headers: Record<string, unknown>) => registeredAs(headers['x-account'] === 'peer' ? OTHER_USER_ID : USER_ID);
  type Who = 'sharer' | 'peer';

  const shareAs = (h: Harness, who: Who = 'sharer') =>
    h.app.inject({ method: 'POST', url, payload: shareBody(), headers: { 'x-account': who } });
  const readAs = (h: Harness, who: Who = 'sharer') =>
    h.app.inject({ method: 'GET', url, query: { messageIds: MSG_1, languages: 'fr' }, headers: { 'x-account': who } });

  /** `count` requêtes l'une après l'autre, leurs statuts dans l'ordre. */
  const inSequence = (count: number, request: () => Promise<{ statusCode: number }>): Promise<readonly number[]> =>
    Array.from({ length: count }).reduce<Promise<readonly number[]>>(
      async (done) => [...(await done), (await request()).statusCode],
      Promise.resolve([]),
    );

  const accepted = (status: number): boolean => status === 200 || status === 201;

  /** L'horloge du limiteur (`Date.now`), figée puis avancée à la main : « par minute » se mesure, il ne s'attend pas. */
  const clockAt = () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(FIRST_INSTANT);
    return (afterMs: number) => clock.mockReturnValue(FIRST_INSTANT + afterMs);
  };

  const appWithLimiter = () => buildApp({ authContextFor: account, rateLimit: { skipOnError: true } });

  describe('les partages : 120 par minute', () => {
    it('accepte 120 partages, refuse le 121e (429), et ne tient pas le compte voisin', async () => {
      clockAt();
      const h = await appWithLimiter();

      const statuses = await inSequence(121, () => shareAs(h));
      const beyond = await shareAs(h);
      const otherMember = await shareAs(h, 'peer');

      expect(statuses.slice(0, 120).every(accepted)).toBe(true);
      expect(statuses[120]).toBe(429);
      expect(beyond.statusCode).toBe(429);
      expect(beyond.json()).toMatchObject({ success: false, error: 'Too many shared translations. Please slow down.' });
      expect(accepted(otherMember.statusCode)).toBe(true);
    });

    it('compte par MINUTE : la fenêtre ne rouvre qu’après soixante secondes', async () => {
      const at = clockAt();
      const h = await appWithLimiter();
      await inSequence(120, () => shareAs(h));

      at(59_000);
      const stillClosed = await shareAs(h);
      at(61_000);
      const reopened = await shareAs(h);

      expect(stillClosed.statusCode).toBe(429);
      expect(accepted(reopened.statusCode)).toBe(true);
    });
  });

  describe('les lectures : 60 par minute', () => {
    it('accepte 60 lectures, refuse la 61e (429), et ne tient pas le compte voisin', async () => {
      clockAt();
      const h = await appWithLimiter();

      const statuses = await inSequence(61, () => readAs(h));
      const otherMember = await readAs(h, 'peer');

      expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
      expect(statuses[60]).toBe(429);
      expect(otherMember.statusCode).toBe(200);
    });

    it('compte par MINUTE : la fenêtre ne rouvre qu’après soixante secondes', async () => {
      const at = clockAt();
      const h = await appWithLimiter();
      await inSequence(60, () => readAs(h));

      at(59_000);
      const stillClosed = await readAs(h);
      at(61_000);
      const reopened = await readAs(h);

      expect(stillClosed.statusCode).toBe(429);
      expect(reopened.statusCode).toBe(200);
    });

    it('refuse la lecture excédentaire par son propre message', async () => {
      clockAt();
      const h = await appWithLimiter();
      await inSequence(60, () => readAs(h));

      const beyond = await readAs(h);

      expect(beyond.json()).toMatchObject({ success: false, error: 'Too many shared translation reads. Please slow down.' });
    });
  });

  describe('deux gestes, deux seaux', () => {
    it('épuiser les partages d’un compte ne lui coûte aucune lecture', async () => {
      clockAt();
      const h = await appWithLimiter();
      await inSequence(121, () => shareAs(h));

      const read = await readAs(h);

      expect(read.statusCode).toBe(200);
    });

    it('épuiser les lectures d’un compte ne lui coûte aucun partage', async () => {
      clockAt();
      const h = await appWithLimiter();
      await inSequence(61, () => readAs(h));

      const shared = await shareAs(h);

      expect(accepted(shared.statusCode)).toBe(true);
    });

    // Le plugin range déjà ses compteurs PAR ROUTE (un magasin enfant par route,
    // `méthode + url` en Redis) : deux routes ne partagent pas de seau, quelle que soit
    // la clé. La clé nomme pourtant le geste, et un magasin qui ne ferait pas cette
    // distinction (un double, un autre plugin) confondrait les deux — c'est elle qu'on
    // épingle, directement.
    describe('la clé de chaque seau', () => {
      const keyOf = (config: { readonly keyGenerator: (request: never) => string }, request: object): string =>
        config.keyGenerator(request as never);
      const registered = (userId: string) => ({ authContext: registeredAs(userId), ip: '10.0.0.1' });

      it('nomme le geste : le seau des partages et celui des lectures d’un même compte sont deux seaux', () => {
        const caller = registered(USER_ID);

        expect(keyOf(SHARED_TRANSLATION_SHARE_RATE_LIMIT, caller)).not.toBe(keyOf(SHARED_TRANSLATION_READ_RATE_LIMIT, caller));
      });

      it('nomme le compte : deux comptes de la même adresse ont deux seaux, un même compte un seul', () => {
        expect(keyOf(SHARED_TRANSLATION_SHARE_RATE_LIMIT, registered(USER_ID))).not.toBe(
          keyOf(SHARED_TRANSLATION_SHARE_RATE_LIMIT, registered(OTHER_USER_ID)),
        );
        expect(keyOf(SHARED_TRANSLATION_READ_RATE_LIMIT, registered(USER_ID))).toBe(
          keyOf(SHARED_TRANSLATION_READ_RATE_LIMIT, { ...registered(USER_ID), ip: '10.0.0.2' }),
        );
      });

      it('nomme un invité de lien partagé par sa ligne de participant', () => {
        const guest = { authContext: guestAs(GUEST), ip: '10.0.0.1' };

        expect(keyOf(SHARED_TRANSLATION_SHARE_RATE_LIMIT, guest)).toContain(GUEST);
      });

      it('retombe sur l’adresse quand aucune identité n’est posée', () => {
        const anonymousCall = { ip: '10.0.0.7' };

        expect(keyOf(SHARED_TRANSLATION_SHARE_RATE_LIMIT, anonymousCall)).toContain('ip:10.0.0.7');
        expect(keyOf(SHARED_TRANSLATION_READ_RATE_LIMIT, anonymousCall)).toContain('ip:10.0.0.7');
      });
    });
  });
});
