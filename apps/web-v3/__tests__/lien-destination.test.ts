/**
 * @jest-environment node
 */

import type { CibleDuLien } from '@/lib/api/links';
import {
  cheminDuLienClos,
  destinationDe,
  estUnJetonServable,
} from '@/app/(public)/l/[token]/destination';

const cible = (partiel: Partial<CibleDuLien>): CibleDuLien => ({
  genre: 'tracking',
  typeDeCible: 'POST',
  idDeCible: '507f1f77bcf86cd799439011',
  urlOriginale: null,
  ...partiel,
});

describe('destinationDe — un lien ouvre le contenu de la v3, jamais une route de compte', () => {
  it.each([
    ['STORY', '/stories/507f1f77bcf86cd799439011'],
    ['REEL', '/reels/507f1f77bcf86cd799439011'],
    ['POST', '/posts/507f1f77bcf86cd799439011'],
    ['STATUS', '/moods/507f1f77bcf86cd799439011'],
    ['PROFILE', '/u/507f1f77bcf86cd799439011'],
  ] as const)('%s mène à %s', (typeDeCible, attendu) => {
    expect(destinationDe({ token: '8fz3', cible: cible({ typeDeCible }) })).toBe(attendu);
  });

  /**
   * Régime 4 (§ 5.1) : `resolveTarget` rend `conversationId`, et
   * `/conversations/<id>` est fermée aux anonymes — c'est-à-dire au RÔLE
   * PREMIER. Tant que l'issue passerelle n'est pas livrée, la clé qui ouvre la
   * conversation est le JETON du lien, jamais l'identifiant de la conversation.
   */
  it('CONVERSATION mène à /chat/<jeton> — la porte de l’invité —, jamais à /conversations/<id>', () => {
    const chemin = destinationDe({
      token: 'mshy_lagos',
      cible: cible({ genre: 'conversation', typeDeCible: 'CONVERSATION', idDeCible: 'c1' }),
    });

    expect(chemin).toBe('/chat/mshy_lagos');
    expect(chemin).not.toContain('c1');
  });

  it('EXTERNAL mène à son URL d’origine', () => {
    expect(
      destinationDe({
        token: 't',
        cible: cible({ typeDeCible: 'EXTERNAL', idDeCible: null, urlOriginale: 'https://exemple.org/a?b=1' }),
      }),
    ).toBe('https://exemple.org/a?b=1');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', '//evil.example'])(
    'refuse %s : un lien tracé ne devient pas une redirection ouverte',
    (urlOriginale) => {
      expect(
        destinationDe({ token: 't', cible: cible({ typeDeCible: 'EXTERNAL', idDeCible: null, urlOriginale }) }),
      ).toBe('/l/t/expired');
    },
  );

  it('mène au lien clos quand la cible n’a pas d’identifiant', () => {
    expect(destinationDe({ token: 't', cible: cible({ idDeCible: null }) })).toBe('/l/t/expired');
  });

  it('mène au lien clos sur un type que la v3 ne sait pas ouvrir', () => {
    expect(destinationDe({ token: 't', cible: cible({ typeDeCible: 'INCONNU' }) })).toBe('/l/t/expired');
  });

  it('échappe le jeton et l’identifiant : ils viennent du réseau', () => {
    expect(destinationDe({ token: 'a b/c', cible: cible({ idDeCible: 'x y' }) })).toBe('/posts/x%20y');
    expect(cheminDuLienClos('a b/c')).toBe('/l/a%20b%2Fc/expired');
  });
});

/**
 * La forme d'un jeton — LE site qui la connaît.
 *
 * La passerelle la déclare dans le schéma de `GET /tracking-links/:token/resolve`
 * (`^[a-zA-Z0-9_-]{2,50}$`) et la refuse elle-même. Les DEUX surfaces de
 * `/l/:token` — la redirection et l'écran clos — la vérifient avant d'appeler
 * pour rien ; l'écrire deux fois serait la jumelle qui dérive au premier
 * caractère admis en plus.
 */
describe('estUnJetonServable — ce qu’on accepte de porter jusqu’à la passerelle', () => {
  it.each(['8fz3-lagos', 'mshy_support', 'AB'])('accepte %s', (jeton) => {
    expect(estUnJetonServable(jeton)).toBe(true);
  });

  it.each(['', 'a', '../../secret', 'a b', 'a/b', 'é'.repeat(4), 'x'.repeat(51)])(
    'refuse %s',
    (jeton) => {
      expect(estUnJetonServable(jeton)).toBe(false);
    },
  );
});
