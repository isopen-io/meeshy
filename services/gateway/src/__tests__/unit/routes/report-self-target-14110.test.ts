/**
 * #14110 (contre-audit N2 b) — signaler ce dont on est l'auteur ou le créateur
 * est refusé pour TOUS les types de cible, avec le même verdict qu'une cible
 * inaccessible. Le commentaire d'un autre sous sa propre publication, lui, se
 * signale.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { verifierCible } from '../../../routes/reports/target';

const MOI = '507f1f77bcf86cd799439031';
const AUTRE = '507f1f77bcf86cd799439032';
const ID = '507f1f77bcf86cd799439050';

const prismaOu = (proprietaire: string, createurConversation: boolean) => ({
  post: { findUnique: async () => ({ authorId: proprietaire, visibility: 'PUBLIC', visibilityUserIds: [], deletedAt: null }) },
  postComment: { findUnique: async () => ({ postId: ID, authorId: AUTRE, deletedAt: null }) },
  community: { findUnique: async () => ({ id: ID, createdBy: proprietaire }) },
  sound: { findUnique: async () => ({ id: ID, uploaderId: proprietaire }) },
  conversation: { findUnique: async () => ({ id: ID }) },
  participant: { findFirst: async (a: { where: { role?: string } }) => (a.where.role === 'creator' ? (createurConversation ? { id: 'p' } : null) : { id: 'p' }) },
}) as never;

const verdict = (type: 'post' | 'story' | 'community' | 'sound' | 'conversation' | 'comment', proprietaire: string, createurConversation = false) =>
  verifierCible({ prisma: prismaOu(proprietaire, createurConversation), signalant: { userId: MOI }, type, entityId: ID });

describe('verifierCible — pas d\'auto-signalement, quel que soit le type', () => {
  it.each(['post', 'story', 'community', 'sound'] as const)('%s : l\'auteur ne signale pas le sien ; un autre, si', async (type) => {
    await expect(verdict(type, MOI)).resolves.toEqual(await verdict('post', MOI));
    expect((await verdict(type, MOI)).atteignable).toBe(false);
    expect((await verdict(type, AUTRE)).atteignable).toBe(true);
  });

  it('conversation : son créateur ne la signale pas ; un autre membre, si', async () => {
    expect((await verdict('conversation', AUTRE, true)).atteignable).toBe(false);
    expect((await verdict('conversation', AUTRE, false)).atteignable).toBe(true);
  });

  it('le commentaire d\'un autre sous SA publication se signale', async () => {
    expect((await verdict('comment', MOI)).atteignable).toBe(true);
  });
});
