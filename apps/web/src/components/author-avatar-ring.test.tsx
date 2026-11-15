import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { AuthorRingsContext } from '@/lib/profile-decor/author-ring';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AuthorAvatar } from './author-avatar';

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});
afterAll(() => releaseHappyDomIfRegistered());

const filet: ServedProfileDecorItem = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };

const perle: ServedProfileDecorItem = { pack: 'contours-essentiels', item: 'perle', origin: 'builtin', contract: null };

const avatar = (rings: ReadonlyMap<string, ServedProfileDecorItem>, authorId: string, sender?: unknown) =>
  renderToStaticMarkup(
    <AuthorRingsContext.Provider value={rings}>
      <AuthorAvatar authorId={authorId} initials="AD" color="#6366F1" size={36} name="Awa" {...(sender === undefined ? {} : { sender })} />
    </AuthorRingsContext.Provider>,
  );

describe('le contour équipé d’un auteur dans le fil (#10713)', () => {
  test('un auteur dont la passerelle sert un contour le porte, dans l’empreinte de son avatar', () => {
    const html = avatar(new Map([['u1', filet]]), 'u1');
    expect(html).toContain('data-avatar-ring="filet"');
    expect(html).toContain('width:36px;height:36px');
  });

  test('un auteur sans contour garde l’avatar d’avant', () => {
    expect(avatar(new Map([['u1', filet]]), 'u2')).not.toContain('data-avatar-ring');
    expect(avatar(new Map(), 'u1')).not.toContain('data-avatar-ring');
  });

  test('un auteur absent des participants chargés porte le contour servi AVEC son message', () => {
    const html = avatar(new Map(), 'u9', { id: 'p9', userId: 'u9', profileDecor: { avatarRing: filet } });
    expect(html).toContain('data-avatar-ring="filet"');
  });

  test('le contour des participants prime sur celui du message, plus ancien', () => {
    const html = avatar(new Map([['u1', perle]]), 'u1', { profileDecor: { avatarRing: filet } });
    expect(html).toContain('data-avatar-ring="perle"');
  });

  test('un message sans contour (ancienne passerelle, invité) garde l’avatar d’avant', () => {
    expect(avatar(new Map(), 'u9', { id: 'p9', userId: 'u9' })).not.toContain('data-avatar-ring');
  });
});
