import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Bubble } from './bubble';
import { FeedPostCard } from './feed-post-card';
import { FocalRow } from './focal-row';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { amina, message, threadMoment, translation, VIEWER_ID } from '@/lib/api/fixtures-base';
import type { FeedPost } from '@/lib/api/feed-pages';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

/**
 * **LES TROIS SURFACES APPELLENT LA MÊME LOI** (#7032) — et deux témoins de ce
 * fichier ne peuvent PAS tomber ailleurs :
 *
 *  - **le texte TRADUIT.** Le porteur a tranché : l'enrichissement porte sur ce
 *    que le lecteur LIT, pas sur l'original. Les témoins sont écrits sur un
 *    RANG ≠ 1 (leçon 261) — original espagnol, traduction ANGLAISE, prisme
 *    `['fr', 'en']` : au rang 1 une implémentation qui n'enrichirait que
 *    l'original et une juste rendraient le même résultat, donc le témoin ne
 *    pourrait pas tomber.
 *  - **le hashtag.** Cliquable en PUBLICATION, texte mort en CONVERSATION.
 *    C'est le témoin NÉGATIF qui empêche un lot de « compléter la parité » en
 *    installant un lien vers un écran que le serveur ne sert pas.
 */

const hrefsOf = (html: string): readonly string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? '');

/**
 * **LA QUESTION SE POSE SUR L'ANCÊTRE, JAMAIS SUR LA BALISE** — et c'est une
 * mesure, pas une précaution. La forme précédente de ce témoin cherchait
 * `/<a[^>]*aria-hidden/` : en remettant `aria-hidden` sur le `<p>` ENTIER —
 * exactement la régression que `plainTextHidden` existe pour empêcher — les
 * seize témoins de ce fichier restaient VERTS, `check-reading-mode.mjs`
 * compris. Un élément focusable est masqué par n'importe lequel de ses
 * ancêtres ; une chaîne ne sait pas lire une ascendance, un DOM si.
 */
const focusablesMasques = (html: string): readonly string[] => {
  const hote = document.createElement('div');
  hote.innerHTML = html;
  return [...hote.querySelectorAll('a[href], button, [tabindex]')]
    .filter((element) => element.closest('[aria-hidden="true"]') !== null)
    .map((element) => element.outerHTML);
};

/** La PROSE qu'aucun `aria-hidden` ne couvre — la moitié inverse du témoin
 * ci-dessus : sans elle, retirer tout masque rendrait la chaîne verte en
 * rétablissant le doublon de lecture de #5935. */
const proseNue = (html: string): readonly string[] => {
  const hote = document.createElement('div');
  hote.innerHTML = html;
  const paragraphe = hote.querySelector('[data-rich-text]');
  if (paragraphe === null) return ['aucun [data-rich-text] rendu'];
  const walker = document.createTreeWalker(paragraphe, NodeFilter.SHOW_TEXT);
  const nue: string[] = [];
  for (let noeud = walker.nextNode(); noeud !== null; noeud = walker.nextNode()) {
    const texte = (noeud.textContent ?? '').trim();
    const parent = noeud.parentElement;
    if (texte === '' || parent === null || parent.closest('a') !== null) continue;
    if (parent.closest('[aria-hidden="true"]') === null) nue.push(texte);
  }
  return nue;
};

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const placeOf = (msg: Message): PlacedMessage => ({ message: msg, head: true, tail: true, opensDay: null });

const threadMessage = (partial: Partial<Message> & { readonly id: string; readonly content: string }): Message =>
  message({
    senderId: 'u-amina',
    sender: amina,
    originalLanguage: 'fr',
    translations: [],
    createdAt: threadMoment(10),
    ...partial,
  });

const renderBubble = (msg: Message) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf(msg)}
      languages={['fr', 'en']}
      isGrouped={false}
      viewerId={VIEWER_ID}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

const renderFocal = (msg: Message) =>
  renderToStaticMarkup(
    <FocalRow
      mode="focal"
      place={placeOf(msg)}
      languages={['fr', 'en']}
      viewerId={VIEWER_ID}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

const renderCard = (post: Partial<FeedPost> & { readonly content: string }) =>
  renderToStaticMarkup(
    <FeedPostCard
      model={resolveFeedCardModel(
        {
          id: 'p-rich',
          type: 'POST',
          createdAt: '2026-09-18T11:55:00.000Z',
          originalLanguage: 'fr',
          author: { id: 'u-nour', displayName: 'Nour', username: 'nour' },
          ...post,
        },
        { preferredLanguages: ['fr', 'en'], now: new Date('2026-09-18T12:00:00.000Z') },
      )}
    />,
  );

describe('la BULLE enrichit le texte', () => {
  test('une mention validée devient un lien vers son profil', () => {
    const html = renderBubble(threadMessage({ id: 'm1', content: 'merci @kwame-mensah', validatedMentions: ['kwame-mensah'] }));
    expect(hrefsOf(html)).toEqual(['/u/kwame-mensah']);
  });

  test('un pseudo NON validé reste du texte — aucun lien vers un profil inexistant', () => {
    const html = renderBubble(threadMessage({ id: 'm2', content: 'merci @fantome', validatedMentions: [] }));
    expect(hrefsOf(html)).toEqual([]);
    expect(html).toContain('@fantome');
  });

  test('une URL devient un lien externe', () => {
    const html = renderBubble(threadMessage({ id: 'm3', content: 'voir https://meeshy.me/a' }));
    expect(hrefsOf(html)).toEqual(['https://meeshy.me/a']);
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('**gras** et *italique* sont rendus, sans leurs étoiles', () => {
    const html = renderBubble(threadMessage({ id: 'm4', content: 'c’est **important** et *urgent*' }));
    expect(html).toContain('<strong>important</strong>');
    expect(html).toContain('<em>urgent</em>');
    expect(html).not.toContain('**');
  });

  /** LE CONTRE-TÉMOIN : les hashtags n'existent que pour les publications. */
  test('un #hashtag reste du TEXTE — aucune adresse de hashtag en conversation', () => {
    const html = renderBubble(threadMessage({ id: 'm5', content: 'sous #livraison' }));
    expect(html).toContain('#livraison');
    expect(hrefsOf(html)).toEqual([]);
  });

  /** RANG ≠ 1 : l'anglais SERT, le français n'existe pas. */
  test('l’enrichissement porte sur le texte TRADUIT, pas sur l’original', () => {
    const html = renderBubble(
      threadMessage({
        id: 'm6',
        content: 'Hola @kwame-mensah, mira https://meeshy.me/es',
        originalLanguage: 'es',
        translations: [translation('m6', 'en', 'Hi @kwame-mensah, look at https://meeshy.me/en')],
        validatedMentions: ['kwame-mensah'],
      }),
    );
    expect(html).toContain('lang="en"');
    expect(html).not.toContain('meeshy.me/es');
    expect(hrefsOf(html)).toEqual(['/u/kwame-mensah', 'https://meeshy.me/en']);
  });
});

describe('la RANGÉE PLATE enrichit le texte sans violer l’arbre d’accessibilité', () => {
  test('une mention y devient un lien', () => {
    const html = renderFocal(threadMessage({ id: 'f1', content: 'merci @kwame-mensah', validatedMentions: ['kwame-mensah'] }));
    expect(hrefsOf(html)).toContain('/u/kwame-mensah');
  });

  test('AUCUN élément focusable ne vit sous un `aria-hidden`, fût-ce par son ancêtre — c’est la violation aria-hidden-focus', () => {
    const html = renderFocal(threadMessage({ id: 'f2', content: 'merci @kwame-mensah, vois https://meeshy.me/a', validatedMentions: ['kwame-mensah'] }));
    expect(focusablesMasques(html)).toEqual([]);
  });

  test('la PROSE reste masquée, feuille par feuille — le libellé de la rangée la porte déjà', () => {
    const html = renderFocal(threadMessage({ id: 'f3', content: 'merci @kwame-mensah, et voilà', validatedMentions: ['kwame-mensah'] }));
    expect(proseNue(html)).toEqual([]);
    expect(html).toContain('aria-hidden="true"');
  });

  test('un #hashtag y reste du texte, comme dans la bulle', () => {
    expect(hrefsOf(renderFocal(threadMessage({ id: 'f4', content: 'sous #livraison' })))).toEqual([]);
  });

  test('l’enrichissement porte sur le texte TRADUIT (rang ≠ 1)', () => {
    const html = renderFocal(
      threadMessage({
        id: 'f5',
        content: 'Hola, mira https://meeshy.me/es',
        originalLanguage: 'es',
        translations: [translation('f5', 'en', 'Hi, look at https://meeshy.me/en')],
      }),
    );
    expect(hrefsOf(html)).toEqual(['https://meeshy.me/en']);
  });
});

describe('la CARTE DE PUBLICATION enrichit le texte — hashtags COMPRIS', () => {
  test('un #hashtag y devient un lien, contrairement à la conversation', () => {
    const html = renderCard({ content: 'compte rendu sous #Livraison' });
    expect(hrefsOf(html)).toEqual(['/hashtag/livraison']);
  });

  test('une mention validée par le serveur devient un lien', () => {
    const html = renderCard({ content: 'merci @kwame-mensah', mentions: [{ username: 'kwame-mensah' }] });
    expect(hrefsOf(html)).toContain('/u/kwame-mensah');
  });

  test('un pseudo hors du jeu servi reste du texte', () => {
    const html = renderCard({ content: 'merci @fantome', mentions: [] });
    expect(hrefsOf(html)).toEqual([]);
  });

  test('une URL devient un lien externe', () => {
    expect(hrefsOf(renderCard({ content: 'voir https://meeshy.me/a' }))).toEqual(['https://meeshy.me/a']);
  });

  test('l’enrichissement porte sur le texte TRADUIT (rang ≠ 1)', () => {
    const html = renderCard({
      content: 'Mira #Entrega y https://meeshy.me/es',
      originalLanguage: 'es',
      translations: { en: { text: 'Look at #Delivery and https://meeshy.me/en' } },
    });
    expect(html).toContain('lang="en"');
    expect(hrefsOf(html)).toEqual(['/hashtag/delivery', 'https://meeshy.me/en']);
  });
});
