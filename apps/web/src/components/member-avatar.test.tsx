import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ConversationMember } from '@/lib/api/conversation-members';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MemberAvatar } from './member-avatar';

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});
afterAll(() => releaseHappyDomIfRegistered());

const member = (overrides: Partial<ConversationMember> = {}): ConversationMember => ({
  id: 'p-nour',
  userId: 'u-nour',
  username: 'nour',
  displayName: 'Nour Haddad',
  avatar: undefined,
  role: 'member',
  ...overrides,
});

const filet = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null } as const;

describe('l’avatar d’un membre dans la liste des membres (#10713)', () => {
  test('un membre qui porte un contour équipé le dessine dans l’empreinte de la rangée', () => {
    const html = renderToStaticMarkup(<MemberAvatar member={member({ ring: filet })} accent="#6366F1" size={40} conversationId="c1" />);
    expect(html).toContain('data-avatar-ring="filet"');
    expect(html).toContain('width:40px;height:40px');
  });

  test('un membre sans contour garde l’avatar d’avant', () => {
    expect(renderToStaticMarkup(<MemberAvatar member={member()} accent="#6366F1" size={40} conversationId="c1" />)).not.toContain('data-avatar-ring');
  });
});
