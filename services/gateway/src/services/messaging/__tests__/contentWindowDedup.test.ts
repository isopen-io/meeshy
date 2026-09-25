/**
 * Témoins du repli de déduplication par contenu (#6910).
 *
 * Ce qui se teste ici est la DÉCISION — éligibilité, borne de la fenêtre, forme
 * de ce qu'on va chercher. La requête elle-même est injectée : un faux Prisma
 * accepterait n'importe quelle forme, seul `tsc` valide une requête (leçon du
 * dépôt), et c'est `MessageProcessor` qui la lui donne, typée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  CONTENT_WINDOW_DEDUP_MS,
  isContentWindowDedupEligible,
  findRecentIdenticalMessage,
  type ContentWindowLookup,
} from '../contentWindowDedup';

const candidate = (overrides: Partial<{ conversationId: string; senderId: string; content: string }> = {}) => ({
  conversationId: 'conv-1',
  senderId: 'sender-1',
  content: 'La proximité qui manque',
  ...overrides,
});

const lookupReturning = <T>(value: T | null) => {
  const calls: Array<{ conversationId: string; senderId: string; content: string; since: Date }> = [];
  const lookup: ContentWindowLookup<T> = async (args) => {
    calls.push(args);
    return value;
  };
  return { lookup, calls };
};

describe("un message renvoyé avec une clé NEUVE ne crée plus de seconde ligne (#6910)", () => {
  describe('éligibilité', () => {
    it('retient un message qui porte du texte', () => {
      expect(isContentWindowDedupEligible(candidate())).toBe(true);
    });

    it("ÉCARTE un contenu vide — deux pièces jointes distinctes portent toutes deux `content: ''`", () => {
      expect(isContentWindowDedupEligible(candidate({ content: '' }))).toBe(false);
    });

    it("ÉCARTE un contenu qui n'est que de l'espace — il sera stocké vide", () => {
      expect(isContentWindowDedupEligible(candidate({ content: '   \n\t ' }))).toBe(false);
    });

    it("ÉCARTE un message qui PORTE des pièces jointes, même avec du texte — deux envois du même texte peuvent porter des médias DIFFÉRENTS", () => {
      expect(isContentWindowDedupEligible({ ...candidate(), attachmentIds: ['att-1'] })).toBe(false);
    });

    it('retient un message dont la liste de pièces jointes est VIDE — il n\'en porte aucune', () => {
      expect(isContentWindowDedupEligible({ ...candidate(), attachmentIds: [] })).toBe(true);
    });
  });

  describe("les emojis partent EN SÉRIE (#7985)", () => {
    it("ÉCARTE un message fait d'un seul emoji — 😂😂😂 tapés d'affilée sont trois messages", () => {
      expect(isContentWindowDedupEligible(candidate({ content: '😂' }))).toBe(false);
    });

    it("ÉCARTE plusieurs emojis, séquences ZWJ et variantes comprises", () => {
      expect(isContentWindowDedupEligible(candidate({ content: '❤️👍🏽' }))).toBe(false);
      expect(isContentWindowDedupEligible(candidate({ content: ' 👨‍👩‍👧 ' }))).toBe(false);
    });

    it("retient un texte qui CONTIENT un emoji — le filet contre #6915 garde le texte", () => {
      expect(isContentWindowDedupEligible(candidate({ content: 'Bravo 😂' }))).toBe(true);
    });

    it("n'interroge pas la base pour un emoji seul", async () => {
      const { lookup, calls } = lookupReturning({ id: 'm-1' });
      const found = await findRecentIdenticalMessage({ candidate: candidate({ content: '😂' }), now: new Date(), lookup });
      expect(found).toBeNull();
      expect(calls).toHaveLength(0);
    });
  });

  describe('la recherche', () => {
    it("rend le message existant quand la conversation, l'expéditeur et le contenu coïncident dans la fenêtre", async () => {
      const { lookup, calls } = lookupReturning({ id: 'msg-deja-la' });

      const found = await findRecentIdenticalMessage({
        candidate: candidate(),
        now: new Date('2026-09-17T10:01:57.922Z'),
        lookup,
      });

      expect(found).toEqual({ id: 'msg-deja-la' });
      expect(calls).toHaveLength(1);
    });

    it('borne la recherche à la fenêtre mesurée, comptée depuis maintenant', async () => {
      const { lookup, calls } = lookupReturning({ id: 'peu-importe' });
      const now = new Date('2026-09-17T10:01:57.922Z');

      await findRecentIdenticalMessage({ candidate: candidate(), now, lookup });

      expect(calls[0]?.since.getTime()).toBe(now.getTime() - CONTENT_WINDOW_DEDUP_MS);
    });

    it('cherche le contenu ROGNÉ — c\'est sous cette forme que le message est stocké', async () => {
      const { lookup, calls } = lookupReturning({ id: 'peu-importe' });

      await findRecentIdenticalMessage({
        candidate: candidate({ content: '  Bonsoir à tous  ' }),
        now: new Date(),
        lookup,
      });

      expect(calls[0]?.content).toBe('Bonsoir à tous');
    });

    it("n'interroge MÊME PAS la base pour un contenu vide — la garde est en amont du coût", async () => {
      const { lookup, calls } = lookupReturning({ id: 'ne-doit-pas-sortir' });

      const found = await findRecentIdenticalMessage({
        candidate: candidate({ content: '' }),
        now: new Date(),
        lookup,
      });

      expect(found).toBeNull();
      expect(calls).toHaveLength(0);
    });

    it("rend `null` quand la lecture ÉCHOUE — un palliatif n'empêche JAMAIS un envoi", async () => {
      const onError = jest.fn();
      const lookup: ContentWindowLookup<{ id: string }> = async () => {
        throw new Error('findFirst indisponible');
      };

      const found = await findRecentIdenticalMessage({ candidate: candidate(), now: new Date(), lookup, onError });

      expect(found).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it("n'exige pas de rapporteur d'erreur pour rester passant", async () => {
      const lookup: ContentWindowLookup<{ id: string }> = async () => {
        throw new Error('findFirst indisponible');
      };

      await expect(findRecentIdenticalMessage({ candidate: candidate(), now: new Date(), lookup })).resolves.toBeNull();
    });

    it('rend `null` quand rien ne coïncide — le message se crée normalement', async () => {
      const { lookup } = lookupReturning(null);

      const found = await findRecentIdenticalMessage({
        candidate: candidate(),
        now: new Date(),
        lookup,
      });

      expect(found).toBeNull();
    });

    it('laisse la fenêtre se resserrer ou s\'élargir sans toucher au code appelant', async () => {
      const { lookup, calls } = lookupReturning({ id: 'peu-importe' });
      const now = new Date('2026-09-17T10:00:00.000Z');

      await findRecentIdenticalMessage({ candidate: candidate(), now, lookup, windowMs: 5000 });

      expect(calls[0]?.since.getTime()).toBe(now.getTime() - 5000);
    });
  });

  describe('la fenêtre elle-même', () => {
    it("vaut 2 s — au-delà des 0,6 s que les deux clients déclarent, loin sous l'intervalle d'une répétition humaine (médiane mesurée : 197 s)", () => {
      expect(CONTENT_WINDOW_DEDUP_MS).toBe(2000);
    });
  });
});

describe("le repli NE REMPLACE PAS la garde nominale", () => {
  it('ne prétend rien décider sans contenu : un message sans texte reste rendu à `clientMessageId` seul', async () => {
    const seen = jest.fn();
    const lookup: ContentWindowLookup<{ id: string }> = async (args) => {
      seen(args);
      return { id: 'jamais' };
    };

    for (const content of ['', ' ', '\n', '\t\t']) {
      expect(await findRecentIdenticalMessage({ candidate: candidate({ content }), now: new Date(), lookup })).toBeNull();
    }
    expect(seen).not.toHaveBeenCalled();
  });
});
