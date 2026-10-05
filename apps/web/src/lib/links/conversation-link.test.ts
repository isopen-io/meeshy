import { describe, expect, test } from 'bun:test';

import { conversationLinksIn, conversationLinkOfPath } from './conversation-link';

/**
 * **QUELLES ADRESSES DÉSIGNENT UNE CONVERSATION (#8099).**
 *
 * Deux familles, mêmes formes qu'iOS (`ShareLinkModels.swift`, `DeepLinkRouter`) :
 * - lien de PARTAGE : `/chat/<lien>` (l'adresse que tout client émet) et
 *   `/join/<lien>` (qu'iOS accepte aussi) ;
 * - lien DIRECT : `/c/<conversation>`.
 * `/l/<jeton>` est un lien de SUIVI, jamais une conversation.
 */

const CONTEXT = { origins: ['https://staging.meeshy.me'], isAppPath: (path: string) => /^\/(c|chat|u)\//u.test(path) };

const RECOGNISED: ReadonlyArray<readonly [string, { readonly kind: string; readonly identifier: string }]> = [
  ['/chat/mshy_beta', { kind: 'share-link', identifier: 'mshy_beta' }],
  ['/join/mshy_beta', { kind: 'share-link', identifier: 'mshy_beta' }],
  ['/c/507f1f77bcf86cd799439033', { kind: 'direct', identifier: '507f1f77bcf86cd799439033' }],
  ['/chat/mshy%20espace', { kind: 'share-link', identifier: 'mshy espace' }],
];

const IGNORED: readonly string[] = ['/u/alice', '/l/Ab12cd', '/c/', '/chat', '/c/abc/extra', '/'];

describe('conversationLinkOfPath', () => {
  for (const [path, expected] of RECOGNISED) {
    test(`${path} ⇒ une conversation`, () => {
      expect(conversationLinkOfPath(path)).toEqual(expected);
    });
  }

  for (const path of IGNORED) {
    test(`${path} ⇒ rien`, () => {
      expect(conversationLinkOfPath(path)).toBeNull();
    });
  }
});

describe('conversationLinksIn', () => {
  test('trouve un lien direct Meeshy sur un hôte de l’environnement', () => {
    const text = 'Regarde https://staging.meeshy.me/c/507f1f77bcf86cd799439033 !';
    expect(conversationLinksIn(text, CONTEXT)).toEqual([{ kind: 'direct', identifier: '507f1f77bcf86cd799439033' }]);
  });

  test('ignore les hôtes étrangers, même au même chemin', () => {
    expect(conversationLinksIn('https://evil.example/chat/mshy_beta', CONTEXT)).toEqual([]);
  });

  test('ne rend chaque conversation qu’une fois', () => {
    const text = 'https://meeshy.me/chat/mshy_beta et encore https://meeshy.me/chat/mshy_beta';
    expect(conversationLinksIn(text, CONTEXT)).toEqual([{ kind: 'share-link', identifier: 'mshy_beta' }]);
  });

  test('une seule carte par message, la première conversation du texte (comme iOS)', () => {
    const text = 'https://meeshy.me/chat/mshy_a puis https://meeshy.me/c/507f1f77bcf86cd799439033';
    expect(conversationLinksIn(text, CONTEXT)).toEqual([{ kind: 'share-link', identifier: 'mshy_a' }]);
  });

  test('lit l’adresse d’origine d’un lien rendu traçable par la passerelle', () => {
    const text = 'Viens : https://meeshy.me/chat/mshy_beta';
    const tracked = [{ token: 'Ab12cd', url: 'https://meeshy.me/chat/mshy_beta' }];
    expect(conversationLinksIn(text, { ...CONTEXT, trackingLinks: tracked })).toEqual([
      { kind: 'share-link', identifier: 'mshy_beta' },
    ]);
  });

  test('un texte sans lien ne coûte rien', () => {
    expect(conversationLinksIn('Bonjour à tous', CONTEXT)).toEqual([]);
  });
});
