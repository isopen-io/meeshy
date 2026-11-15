import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { linkEventOf } from './link-clicks';

/**
 * LE CLIC D'UN LIEN DANS UN CONTENU (#10505) — d'où il a été touché et vers
 * quel domaine enregistrable ; jamais l'URL, jamais une décoration de l'URL.
 */
const OWN = ['https://meeshy.me'];
const anchor = (href: string, postId: string | null = 'a'.repeat(24), textContent = '') => ({
  href,
  textContent,
  closest: (selector: string) => (selector === '[data-feed-card-id]' && postId !== null ? { getAttribute: () => postId } : null),
});

describe('linkEventOf', () => {
  test('un lien externe dans une publication du fil : outbound_click, le domaine seul, la publication en parent', () => {
    expect(linkEventOf(anchor('https://news.exemple.co.uk/a?b=c#d'), { ownOrigins: OWN, pathname: '/feed' })).toEqual({
      type: 'link',
      action: 'outbound_click',
      target: { kind: 'link', id: 'exemple.co.uk', parent: { kind: 'post', id: 'a'.repeat(24) } },
      surface: 'feed',
      domain: 'exemple.co.uk',
    });
  });

  test('un lien de suivi /l/ : tracking_link_followed et le domaine de l’adresse affichée, jamais le jeton', () => {
    expect(linkEventOf(anchor('https://meeshy.me/l/AbC123', 'a'.repeat(24), 'www.exemple.fr/promo'), { ownOrigins: OWN, pathname: '/post/x' })).toEqual({
      type: 'link',
      action: 'tracking_link_followed',
      target: { kind: 'link', id: 'exemple.fr', parent: { kind: 'post', id: 'a'.repeat(24) } },
      surface: 'detail',
      domain: 'exemple.fr',
    });
  });

  test('un lien de suivi sous un libellé ne dit pas sa destination : rien (la redirection compte le clic)', () => {
    expect(linkEventOf(anchor('https://meeshy.me/l/AbC123', null, 'notre boutique'), { ownOrigins: OWN, pathname: '/feed' })).toBeNull();
  });

  test('un lien interne, un lien dans une conversation, une adresse IP : rien', () => {
    expect(linkEventOf(anchor('https://meeshy.me/u/alice'), { ownOrigins: OWN, pathname: '/feed' })).toBeNull();
    expect(linkEventOf(anchor('https://exemple.org'), { ownOrigins: OWN, pathname: '/c/123' })).toBeNull();
    expect(linkEventOf(anchor('http://10.0.0.1/x'), { ownOrigins: OWN, pathname: '/feed' })).toBeNull();
  });
});

describe('garde : aucun texte libre ni adresse dans les événements v2 du web', () => {
  test('les types ne déclarent ni query, ni url, ni href, ni text', () => {
    const source = readFileSync(join(import.meta.dirname, '../api/social-events-v2-types.ts'), 'utf8');
    expect(source).not.toMatch(/readonly (query|url|href|text|searchText|caption|message)\??:/);
  });
});
