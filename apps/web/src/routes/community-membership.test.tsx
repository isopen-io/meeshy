import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { CommunityMembershipAction } from './community-membership';

/**
 * REJOINDRE / QUITTER DESSINÉS (#6378) — ce que le détail offre selon le rôle
 * servi, ce qu'il annonce à un lecteur d'écran, et ce qu'il dit d'un refus.
 */

const noop = () => undefined;
const base = { pending: false, online: true, failure: null, onJoin: noop, onLeave: noop } as const;

describe('CommunityMembershipAction', () => {
  test('« Rejoindre » est un bouton nommé, actif', () => {
    const html = renderToStaticMarkup(<CommunityMembershipAction language="fr" action="join" {...base} />);
    expect(html).toContain('data-community-join');
    expect(html).toContain('Rejoindre');
    expect(html).toContain('aria-disabled="false"');
    expect(html).not.toContain(' disabled="');
  });

  test('« Quitter la communauté » ne part pas au clic : il ouvre une confirmation', () => {
    const html = renderToStaticMarkup(<CommunityMembershipAction language="fr" action="leave" {...base} />);
    expect(html).toContain('data-community-leave');
    expect(html).toContain('Quitter la communauté');
    expect(html).not.toContain('data-confirm-dialog');
  });

  test('aucun geste quand le rôle ne le permet pas', () => {
    expect(renderToStaticMarkup(<CommunityMembershipAction language="fr" action="none" {...base} />)).toBe('');
  });

  test('pendant la réponse, le geste est inerte et le dit', () => {
    const html = renderToStaticMarkup(<CommunityMembershipAction language="fr" action="join" {...base} pending />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(' disabled="');
    expect(html).toContain('Adhésion…');
  });

  test('hors ligne, le geste est inerte et l’écran dit pourquoi', () => {
    const html = renderToStaticMarkup(<CommunityMembershipAction language="fr" action="leave" {...base} online={false} />);
    expect(html).toContain(' disabled="');
    expect(html).toContain('role="status"');
    expect(html).toContain('Hors ligne');
  });

  test('un refus d’adhésion se dit dans la langue du lecteur', async () => {
    await loadInterfaceCatalog('en');
    const html = renderToStaticMarkup(<CommunityMembershipAction language="en" action="join" {...base} failure="refused" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('only join by invitation');
  });
});
