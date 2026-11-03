/**
 * #14110 (contre-audit N2 b) — signaler ce dont on est l'AUTEUR est refusé,
 * avec le même verdict qu'une cible inaccessible. Le commentaire d'un autre sous
 * sa propre publication, lui, se signale.
 *
 * #14626 — une conversation n'a pas d'auteur : son rôle `creator` (celui qui a
 * ouvert le tête-à-tête, ou hérité du groupe) ne retire pas le signalement.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { verifierCible } from '../../../routes/reports/target';

const MOI = '507f1f77bcf86cd799439031';
const AUTRE = '507f1f77bcf86cd799439032';
const ID = '507f1f77bcf86cd799439050';

type Ligne = { readonly id: string; readonly conversationId: string; readonly userId: string; readonly role: string; readonly isActive: boolean };

const prismaOu = (proprietaire: string, membres: readonly Ligne[] = []) => ({
  post: { findUnique: async () => ({ authorId: proprietaire, visibility: 'PUBLIC', visibilityUserIds: [], deletedAt: null }) },
  postComment: { findUnique: async () => ({ postId: ID, authorId: AUTRE, deletedAt: null }) },
  community: { findUnique: async () => ({ id: ID, createdBy: proprietaire }) },
  sound: { findUnique: async () => ({ id: ID, uploaderId: proprietaire }) },
  conversation: { findUnique: async () => ({ id: ID }) },
  participant: {
    findFirst: async (a: { where: Record<string, unknown> }) =>
      membres.find((ligne) => Object.entries(a.where).every(([cle, valeur]) => ligne[cle as keyof Ligne] === valeur)) ?? null,
  },
}) as never;

const verdict = (type: 'post' | 'story' | 'community' | 'sound' | 'conversation' | 'comment', proprietaire: string, membres: readonly Ligne[] = []) =>
  verifierCible({ prisma: prismaOu(proprietaire, membres), signalant: { userId: MOI }, type, entityId: ID });

const membre = (role: string, isActive = true): Ligne => ({ id: 'p', conversationId: ID, userId: MOI, role, isActive });

describe('verifierCible — pas d\'auto-signalement, quel que soit le type', () => {
  it.each(['post', 'story', 'community', 'sound'] as const)('%s : l\'auteur ne signale pas le sien ; un autre, si', async (type) => {
    await expect(verdict(type, MOI)).resolves.toEqual(await verdict('post', MOI));
    expect((await verdict(type, MOI)).atteignable).toBe(false);
    expect((await verdict(type, AUTRE)).atteignable).toBe(true);
  });

  it.each(['creator', 'CREATOR', 'admin', 'member'])('conversation : un membre actif de rôle %s la signale', async (role) => {
    expect((await verdict('conversation', AUTRE, [membre(role)])).atteignable).toBe(true);
  });

  it('conversation : qui n\'en est pas membre actif ne la signale pas, même s\'il l\'a créée', async () => {
    expect((await verdict('conversation', AUTRE, [membre('creator', false)])).atteignable).toBe(false);
    expect((await verdict('conversation', AUTRE)).atteignable).toBe(false);
  });

  it('le commentaire d\'un autre sous SA publication se signale', async () => {
    expect((await verdict('comment', MOI)).atteignable).toBe(true);
  });
});
