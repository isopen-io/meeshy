/**
 * Ce que bannir RETIRE, et ce que débannir doit RENDRE — exactement, pas plus.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  resolveBanWrite,
  resolveUnbanWrite,
} from '../../../../services/conversations/conversationBanState';

const BAN_AT = new Date('2026-08-10T12:00:00.000Z');
const LEFT_LONG_AGO = new Date('2026-01-04T09:30:00.000Z');

describe('resolveBanWrite — un membre actif', () => {
  it('sort de la conversation, horodaté au bannissement', () => {
    const { data, membershipEnded } = resolveBanWrite({ isActive: true, leftAt: null }, BAN_AT);

    expect(data).toEqual({ bannedAt: BAN_AT, isActive: false, leftAt: BAN_AT });
    expect(membershipEnded).toBe(true);
  });

  it('sort aussi quand la ligne ne dit rien de son activité', () => {
    // `isActive` absent du `select` : la lecture ne prouve pas un départ
    // antérieur, donc le bannissement se comporte comme il l'a toujours fait.
    const { data, membershipEnded } = resolveBanWrite({}, BAN_AT);

    expect(data).toEqual({ bannedAt: BAN_AT, isActive: false, leftAt: BAN_AT });
    expect(membershipEnded).toBe(true);
  });
});

describe('resolveBanWrite — un ancien membre, déjà parti', () => {
  it("n'écrase pas la date de son départ", () => {
    // Bannir quelqu'un qui est déjà parti reste une capacité — c'est ainsi
    // qu'on empêche un revenant d'entrer par un lien de partage
    // (`resolveConversationEntry` refuse sur `bannedAt`). Mais ce bannissement
    // ne RETIRE aucune appartenance : il n'en reste plus à retirer.
    const { data, membershipEnded } = resolveBanWrite(
      { isActive: false, leftAt: LEFT_LONG_AGO },
      BAN_AT
    );

    expect(data).toEqual({ bannedAt: BAN_AT });
    expect(membershipEnded).toBe(false);
  });

  it("ne réécrit rien d'autre que la marque du bannissement", () => {
    const { data } = resolveBanWrite({ isActive: false, leftAt: LEFT_LONG_AGO }, BAN_AT);

    expect(data).not.toHaveProperty('isActive');
    expect(data).not.toHaveProperty('leftAt');
  });
});

describe('resolveUnbanWrite — le bannissement avait mis fin à l\'appartenance', () => {
  it('la rend, exactement comme le bannissement l\'avait prise', () => {
    // La trace laissée par `resolveBanWrite` : `leftAt` et `bannedAt` viennent
    // du MÊME instant, donc l'égalité est exacte, jamais approchée.
    const { data, membershipRestored } = resolveUnbanWrite({
      isActive: false,
      leftAt: BAN_AT,
      bannedAt: BAN_AT,
    });

    expect(data).toEqual({ bannedAt: null, isActive: true, leftAt: null });
    expect(membershipRestored).toBe(true);
  });

  it('la rend aussi quand la ligne ne porte pas de trace lisible', () => {
    // Lignes écrites avant ce cycle, ou `select` partiel : sans trace opposée,
    // on garde le comportement historique plutôt que de retirer une capacité.
    const { data, membershipRestored } = resolveUnbanWrite({});

    expect(data).toEqual({ bannedAt: null, isActive: true, leftAt: null });
    expect(membershipRestored).toBe(true);
  });
});

describe("resolveUnbanWrite — la personne était partie AVANT d'être bannie", () => {
  it('lève le bannissement sans la faire rentrer', () => {
    const { data, membershipRestored } = resolveUnbanWrite({
      isActive: false,
      leftAt: LEFT_LONG_AGO,
      bannedAt: BAN_AT,
    });

    expect(data).toEqual({ bannedAt: null });
    expect(membershipRestored).toBe(false);
  });

  it("ne ressuscite ni l'appartenance ni l'effacement du départ", () => {
    const { data } = resolveUnbanWrite({
      isActive: false,
      leftAt: LEFT_LONG_AGO,
      bannedAt: BAN_AT,
    });

    expect(data).not.toHaveProperty('isActive');
    expect(data).not.toHaveProperty('leftAt');
  });

  it('laisse la porte ouverte : sans bannissement, elle peut revenir par un lien', () => {
    // `resolveConversationEntry` refuse sur `bannedAt != null` et rend `rejoin`
    // sur une ligne seulement inactive. Le débannissement doit donc effacer
    // `bannedAt` même quand il ne réintègre pas — sinon lever le bannissement
    // ne lèverait rien.
    const { data } = resolveUnbanWrite({
      isActive: false,
      leftAt: LEFT_LONG_AGO,
      bannedAt: BAN_AT,
    });

    expect(data.bannedAt).toBeNull();
  });
});

describe('resolveBanWrite ∘ resolveUnbanWrite — la paire est une involution', () => {
  it("rend l'état de départ à un membre actif banni puis débanni", () => {
    const banned = resolveBanWrite({ isActive: true, leftAt: null }, BAN_AT);
    const restored = resolveUnbanWrite({
      isActive: false,
      leftAt: 'leftAt' in banned.data ? banned.data.leftAt : null,
      bannedAt: banned.data.bannedAt,
    });

    expect(restored.membershipRestored).toBe(true);
    expect(restored.data).toEqual({ bannedAt: null, isActive: true, leftAt: null });
  });

  it("laisse dehors un ancien membre banni puis débanni", () => {
    const banned = resolveBanWrite({ isActive: false, leftAt: LEFT_LONG_AGO }, BAN_AT);
    const restored = resolveUnbanWrite({
      isActive: false,
      leftAt: LEFT_LONG_AGO,
      bannedAt: banned.data.bannedAt,
    });

    expect(banned.membershipEnded).toBe(false);
    expect(restored.membershipRestored).toBe(false);
    expect(restored.data).toEqual({ bannedAt: null });
  });
});
