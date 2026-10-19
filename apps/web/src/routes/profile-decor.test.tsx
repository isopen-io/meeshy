import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ServedProfileDecor } from '@meeshy/shared/types/profile-decor';

import type { PublicProfile } from '@/lib/api/public-profile';
import { loadProfileDecorCatalog } from '@/lib/i18n-profile-decor-catalog';
import { BUILTIN_BANNER_PACKS, BUILTIN_RING_PACKS } from '@/lib/profile-decor/catalog';
import { resolveBanner, resolveRing } from '@/lib/profile-decor/resolve';

import { DecorEntries, ProfileHero as OwnHero } from './profile-sections';
import { ProfileHero as PublicHero } from './user-profile-header';

await loadProfileDecorCatalog('fr');

const noop = () => undefined;

const decor: ServedProfileDecor = {
  avatarRing: { pack: 'contours-essentiels', item: 'laurier', origin: 'builtin', contract: null },
  banner: { pack: 'bannieres-essentielles', item: 'aurore', origin: 'builtin', contract: null },
};

const ownProfile = { username: 'ada', displayName: 'Ada', avatar: null, banner: 'media:banner-1' };

const publicProfile = (extra: Partial<PublicProfile> = {}): PublicProfile => ({
  id: 'u2',
  username: 'grace',
  displayName: 'Grace',
  avatar: null,
  banner: 'media:banner-2',
  bio: null,
  createdAt: null,
  ...extra,
});

const designs = { ring: resolveRing(decor.avatarRing, new Map()), banner: resolveBanner(decor.banner, new Map()) };

const ownHero = (props: Partial<Parameters<typeof OwnHero>[0]> = {}) =>
  renderToStaticMarkup(
    <OwnHero language="fr" profile={ownProfile} editing={false} pending={{}} onPick={noop} onCancelUpload={noop} {...props} />,
  );

const publicHero = (profile: PublicProfile) => renderToStaticMarkup(<PublicHero profile={profile} name="Grace" accent="#4F46E5" presence={null} />);

describe('la couleur d\u2019accent du profil est la m\u00eame pour moi et pour les autres (#10741)', () => {
  test('mon avatar sans photo et ma banni\u00e8re de design se peignent de l\u2019accent re\u00e7u, pas de l\u2019indigo de marque', () => {
    const html = ownHero({ profile: { ...ownProfile, banner: null }, decor: { ring: null, banner: designs.banner }, accent: '#22C55E' });
    expect(html.toLowerCase()).toContain('#22c55e');
    expect(html).not.toContain('var(--color-ios-brand)"');
    const same = publicHero({ id: 'u1', username: 'ada', displayName: 'Ada', avatar: null, banner: null, bio: null, createdAt: null, decor });
    expect(same.toLowerCase()).toContain('#4f46e5');
  });
});

describe('mon profil', () => {
  test('sans décor servi, le rendu est celui d’avant : l’image de bannière, aucun contour', () => {
    const html = ownHero();
    expect(html).not.toContain('data-avatar-ring');
    expect(html).not.toContain('data-banner-design');
    expect(html).toContain('<img');
  });

  test('le contour se rend autour de l’avatar', () => {
    const html = ownHero({ decor: { ring: designs.ring, banner: null } });
    expect(html).toContain('data-avatar-ring="laurier"');
  });

  test('ma photo de bannière gagne toujours sur le design équipé, et s’ouvre au toucher (#10933)', () => {
    const html = ownHero({ decor: { ring: null, banner: designs.banner } });
    expect(html).not.toContain('data-banner-design');
    expect(html).toContain('<img');
    expect(html).toContain('data-profile-open-image="banner"');
  });

  test('sans photo de bannière, le design équipé se peint (#10933)', () => {
    const html = ownHero({ profile: { ...ownProfile, banner: null }, decor: { ring: null, banner: designs.banner } });
    expect(html).toContain('data-banner-design="aurore"');
    expect(html).not.toContain('<img');
  });

  test('pendant le téléversement d’une photo, l’aperçu de la photo prend la main sur le design', () => {
    const html = ownHero({ decor: { ring: null, banner: designs.banner }, pending: { banner: 'blob:preview' } });
    expect(html).not.toContain('data-banner-design');
    expect(html).toContain('<img');
  });
});

describe('le profil d’un autre', () => {
  test('profil sans décor (ancien serveur) : rendu inchangé', () => {
    const html = publicHero(publicProfile());
    expect(html).not.toContain('data-avatar-ring');
    expect(html).not.toContain('data-banner-design');
    expect(html).toContain('<img');
  });

  test('le contour et la bannière servis se voient chez les autres, sans photo de bannière', () => {
    const html = publicHero(publicProfile({ banner: null, decor }));
    expect(html).toContain('data-avatar-ring="laurier"');
    expect(html).toContain('data-banner-design="aurore"');
    expect(html).not.toContain('<img');
  });

  test('chez les autres aussi, la photo de bannière gagne sur le design et s’ouvre au toucher (#10933)', () => {
    const html = publicHero(publicProfile({ decor }));
    expect(html).not.toContain('data-banner-design');
    expect(html).toContain('<img');
    expect(html).toContain('data-profile-open-image="banner"');
  });

  test('un décor servi mais illisible (choix inconnu) n’ajoute rien', () => {
    const html = publicHero(publicProfile({ decor: { avatarRing: { ...decor.avatarRing!, item: 'fantome' }, banner: null } }));
    expect(html).not.toContain('data-avatar-ring');
    expect(html).toContain('<img');
  });
});

describe('les entrées Bannière, Cadre et Contour', () => {
  const names = { banner: 'Aurore', avatarRing: null, bannerFrame: null };

  test('trois entrées nommées, avec le choix courant ou le défaut — le cadre de bannière rejoint la bannière et le contour (#10936)', () => {
    const html = renderToStaticMarkup(<DecorEntries language="fr" names={names} disabled={false} onOpen={noop} />);
    expect(html).toContain('data-profile-decor-entry="banner"');
    expect(html).toContain('data-profile-decor-entry="bannerFrame"');
    expect(html).toContain('Cadre de la bannière');
    expect(renderToStaticMarkup(<DecorEntries language="fr" names={{ ...names, bannerFrame: 'Celte animé' }} disabled={false} onOpen={noop} />)).toContain('Celte animé');
    expect(html).toContain('data-profile-decor-entry="avatarRing"');
    expect(html).toContain('Aurore');
    expect(html).toContain('Aucun');
  });

  test('hors ligne, elles ne s’ouvrent pas', () => {
    const html = renderToStaticMarkup(<DecorEntries language="fr" names={names} disabled onOpen={noop} />);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
  });

  test('le catalogue embarqué fournit bien un contour laurier et une bannière aurore', () => {
    expect(BUILTIN_RING_PACKS[0]?.items.some((ring) => ring.key === 'laurier')).toBe(true);
    expect(BUILTIN_BANNER_PACKS[0]?.items.some((design) => design.key === 'aurore')).toBe(true);
  });
});
