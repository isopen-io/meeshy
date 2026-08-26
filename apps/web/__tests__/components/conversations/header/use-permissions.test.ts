/**
 * `canModifyConversationImage` gouverne le bouton qui remplace l'avatar d'un
 * groupe depuis son en-tête.
 *
 * Il ne testait que le rôle **PLATEFORME** — BIGBOSS, ADMIN, MODERATOR, AUDIT,
 * ANALYST. Aucun de ces titres ne se gagne en créant un groupe : le créateur
 * d'une conversation est un `USER` ordinaire dont le rang (`creator`) vit dans
 * la conversation, pas sur son compte. Il ne pouvait donc pas changer l'image de
 * son propre groupe, quand un ANALYST de la plateforme le pouvait sur n'importe
 * lequel.
 *
 * Les deux taxonomies restent admises — un modérateur plateforme intervient
 * légitimement — mais le rang de conversation d'abord, puisque c'est lui que le
 * gateway vérifie avant d'écrire (`creator`/`admin`/`moderator`).
 */

import { renderHook } from '@testing-library/react';
import { usePermissions } from '@/components/conversations/header/use-permissions';
import { UserRoleEnum } from '@meeshy/shared/types';
import type { Conversation } from '@meeshy/shared/types';

const GROUP = { id: 'conv-1', type: 'group' } as Conversation;
const DIRECT = { id: 'conv-2', type: 'direct' } as Conversation;
const SOMEONE = { id: 'me-1' };

const canModifyImage = (conversation: Conversation, role: string) =>
  renderHook(() =>
    usePermissions(conversation, role as UserRoleEnum, SOMEONE)
  ).result.current.canModifyConversationImage();

describe('usePermissions — modification de l’image de conversation', () => {
  it.each(['creator', 'admin', 'moderator'])(
    'autorise le rang %s de la conversation',
    (role) => {
      expect(canModifyImage(GROUP, role)).toBe(true);
    }
  );

  it('refuse un simple membre', () => {
    expect(canModifyImage(GROUP, 'member')).toBe(false);
  });

  it.each([UserRoleEnum.BIGBOSS, UserRoleEnum.ADMIN, UserRoleEnum.MODERATOR])(
    'autorise encore le staff plateforme (%s)',
    (role) => {
      expect(canModifyImage(GROUP, role)).toBe(true);
    }
  );

  it("refuse toujours sur un tête-à-tête, quel que soit le rang", () => {
    // Une DM n'a pas d'image propre : elle affiche celle de l'interlocuteur.
    expect(canModifyImage(DIRECT, 'creator')).toBe(false);
    expect(canModifyImage(DIRECT, UserRoleEnum.BIGBOSS)).toBe(false);
  });
});
