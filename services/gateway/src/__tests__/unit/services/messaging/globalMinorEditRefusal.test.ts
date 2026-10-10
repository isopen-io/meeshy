/**
 * Un mineur lit Global sans pouvoir y écrire (#9927) — et RÉÉCRIRE est écrire.
 *
 * Un message posté dans Global avant la déclaration d'âge reste éditable par
 * son auteur pendant 24 h : sans cette règle, un mineur déclaré y changerait
 * le texte de son message, c'est-à-dire écrirait dans Global par la porte de
 * l'édition. `admitMessageEdit` est l'unique énoncé de l'édition pour ses
 * quatre transports ; la règle y vit donc une fois.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { admitMessageEdit, isEditRefused } from '../../../../services/messaging/messageEditAdmission';

const AUTHOR = 'user-author';
const CONV = 'conv-global';
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function buildPrisma(birthDate: Date | null, globalRole = 'USER') {
  const findUnique = jest.fn(async (args: { select: Record<string, boolean> }) => ({
    ...(args.select.role ? { role: globalRole } : {}),
    ...(args.select.birthDate ? { birthDate } : {})
  }));
  const findFirst = jest.fn(async () => ({ id: 'part-1', user: { role: globalRole } }));
  return { user: { findUnique }, participant: { findFirst } };
}

const edit = (params: { type: string; birthDate: Date | null; editor?: string; globalRole?: string }) => {
  const prisma = buildPrisma(params.birthDate, params.globalRole);
  return {
    prisma,
    result: admitMessageEdit({
      prisma: prisma as never,
      editorUserId: params.editor ?? AUTHOR,
      message: {
        authorUserId: AUTHOR,
        conversationId: CONV,
        conversation: { isActive: true, closedAt: null, type: params.type },
        createdAt: new Date(NOW - 60_000),
        messageType: 'text',
        metadata: null
      },
      now: NOW
    })
  };
};

describe('admitMessageEdit — un mineur déclaré ne réécrit rien dans Global (#9927)', () => {
  it('17 ans : l’auteur, dans sa fenêtre, est refusé — motif minor-global', async () => {
    const admission = await edit({ type: 'global', birthDate: day('2009-01-01') }).result;
    expect(isEditRefused(admission) && admission.reason).toBe('minor-global');
  });

  it('un modérateur plateforme mineur n’en est pas dispensé', async () => {
    const admission = await edit({ type: 'global', birthDate: day('2009-01-01'), editor: 'user-mod', globalRole: 'MODERATOR' }).result;
    expect(isEditRefused(admission) && admission.reason).toBe('minor-global');
  });

  it('18 ans le jour même : admis', async () => {
    const admission = await edit({ type: 'global', birthDate: day('2008-10-10') }).result;
    expect(admission.admitted).toBe(true);
  });

  it('âge non déclaré : admis', async () => {
    const admission = await edit({ type: 'global', birthDate: null }).result;
    expect(admission.admitted).toBe(true);
  });

  it('hors de Global, l’édition d’un mineur reste intacte — et ne lit pas sa date de naissance', async () => {
    const { prisma, result } = edit({ type: 'group', birthDate: day('2009-01-01') });
    expect((await result).admitted).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
