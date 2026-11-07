import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CommunityMember } from '@/lib/api/community-members';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadCommunityMembershipCatalog } from '@/lib/i18n-community-membership-catalog';

import { CommunityMembersLink, MemberRow, MemberSection, MembersEmpty, MembersLoadError } from './community-members-parts';

/**
 * LES MEMBRES DESSINÉS (#6375) — le rôle de chaque ligne, la présence telle que
 * servie, le menu d'un administrateur (une divulgation, pas une couche), et le
 * chemin depuis le détail.
 */

const noop = () => undefined;

const member = (over: Partial<CommunityMember> = {}): CommunityMember => ({
  id: 'row-1',
  userId: 'u-bob',
  role: 'moderator',
  name: 'Bob Diallo',
  username: 'bob',
  avatar: null,
  online: false,
  ...over,
});

const row = (over: Partial<Parameters<typeof MemberRow>[0]> = {}) =>
  renderToStaticMarkup(
    <ul>
      <MemberRow
        language="fr"
        member={member()}
        isViewer={false}
        gestures={{ roles: [], canRemove: false }}
        expanded={false}
        pending={false}
        onToggle={noop}
        onRole={noop}
        onRemove={noop}
        first
        {...over}
      />
    </ul>,
  );

describe('l’écran Membres', () => {
  beforeAll(async () => {
    await loadInterfaceCatalog('fr');
    await loadCommunityMembershipCatalog('fr');
  });

  test('une ligne dit le nom et le rôle, dans la langue', () => {
    const html = row();
    expect(html).toContain('Bob Diallo');
    expect(html).toContain('data-community-member-role="moderator"');
    expect(html).toContain('Modérateur');
  });

  test('le lecteur se reconnaît dans la liste', () => {
    expect(row({ isViewer: true })).toContain('Vous');
  });

  test('un membre hors ligne ou dont la présence n’est pas servie n’a AUCUN point', () => {
    expect(row()).not.toContain('data-presence');
    expect(row({ member: member({ online: true }) })).toContain('data-presence');
  });

  test('sans geste offert, aucun bouton', () => {
    expect(row()).not.toContain('<button');
  });

  test('le menu d’un administrateur est un bouton NOMMÉ, replié au repos', () => {
    const html = row({ gestures: { roles: ['admin', 'member'], canRemove: true } });
    expect(html).toContain('aria-label="Gérer Bob Diallo"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-community-member-gestures');
  });

  test('déplié, il offre les AUTRES rôles et le retrait', () => {
    const html = row({ gestures: { roles: ['admin', 'member'], canRemove: true }, expanded: true });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-community-member-make="admin"');
    expect(html).toContain('data-community-member-make="member"');
    expect(html).not.toContain('data-community-member-make="moderator"');
    expect(html).toContain('Nommer administrateur');
    expect(html).toContain('Retirer de la communauté');
  });

  test('une section dit son rôle et son compte', () => {
    const html = renderToStaticMarkup(
      <MemberSection language="fr" role="admin" count={2}>
        <li />
      </MemberSection>,
    );
    expect(html).toContain('Administrateurs · 2');
  });

  test('les états vide et en erreur se disent, l’erreur se relance', () => {
    expect(renderToStaticMarkup(<MembersEmpty language="fr" />)).toContain('Aucun membre');
    const error = renderToStaticMarkup(<MembersLoadError language="fr" onRetry={noop} />);
    expect(error).toContain('role="alert"');
    expect(error).toContain('Réessayer');
  });

  test('le détail mène aux membres de SA communauté', () => {
    const html = renderToStaticMarkup(<CommunityMembersLink language="fr" communityId="m-deploiement" />);
    expect(html).toContain('href="/communities/m-deploiement/members"');
    expect(html).toContain('Membres');
  });
});
