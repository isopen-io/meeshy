import { describe, expect, test } from 'bun:test';

import { noRelationLevel, resolveRelationLevel, type RelationLevelProvider } from './scene-export-branding-level';

const signal = new AbortController().signal;

describe("le port du niveau de lien : l'export n'attend jamais le réseau au-delà de son budget", () => {
  test("l'implémentation par défaut ne sait rien : null", async () => {
    expect(await resolveRelationLevel({ provider: noRelationLevel, authorId: 'u1', self: false, budgetMs: 50, signal })).toBeNull();
  });

  test('un fournisseur injecté rend le niveau servi ; il reçoit l\'auteur', async () => {
    const seen: string[] = [];
    const provider: RelationLevelProvider = async ({ authorId }) => {
      seen.push(authorId);
      return 'CLOSE';
    };
    expect(await resolveRelationLevel({ provider, authorId: 'u1', self: false, budgetMs: 50, signal })).toBe('CLOSE');
    expect(seen).toEqual(['u1']);
  });

  test('sa propre story : le fournisseur n\'est même pas interrogé', async () => {
    let calls = 0;
    const provider: RelationLevelProvider = async () => {
      calls += 1;
      return 'BLOOD';
    };
    expect(await resolveRelationLevel({ provider, authorId: 'me', self: true, budgetMs: 50, signal })).toBeNull();
    expect(calls).toBe(0);
  });

  test('un fournisseur plus lent que le budget : null, l\'export continue sans logo', async () => {
    const slow: RelationLevelProvider = () => new Promise((resolve) => setTimeout(() => resolve('CLOSE'), 200));
    const startedAt = Date.now();
    expect(await resolveRelationLevel({ provider: slow, authorId: 'u1', self: false, budgetMs: 20, signal })).toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(150);
  });

  test('un fournisseur qui échoue : null, jamais une exception', async () => {
    const broken: RelationLevelProvider = async () => {
      throw new Error('réseau');
    };
    expect(await resolveRelationLevel({ provider: broken, authorId: 'u1', self: false, budgetMs: 50, signal })).toBeNull();
  });
});
