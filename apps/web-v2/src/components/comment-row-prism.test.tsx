import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { type PostComment } from '@/lib/api/publication-comments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentRow } from './comment-row';

/**
 * **SUR UN COMMENTAIRE, LE PRISME S'ANNONCE ET L'ORIGINAL S'OUVRE AU GESTE**
 * (#7141, critères 1 et 3).
 *
 * La rangée SERVAIT déjà la bonne traduction et posait `lang` — la voix était
 * juste. Mais rien ne DISAIT au lecteur qui VOIT que le texte est une
 * traduction, et **aucun geste n'ouvrait l'original**. `PrismPastille` existe
 * dans ce dépôt, documentée comme « l'indicateur discret du Prisme », servie
 * par le fil ; l'écran des publications en était la seule surface de contenu
 * traduit dépourvue — même produit, deux comportements.
 *
 * ## LE CORPUS SE LIT SUR UN RANG ≠ 1 (leçon 261)
 *
 * Au rang 1, une descente juste et un résolveur qui ne lit que le premier rang
 * rendent le MÊME verdict : le témoin ne peut pas tomber. Le commentaire est
 * donc ESPAGNOL, traduit en ANGLAIS seulement, pour un lecteur qui préfère
 * `['fr','en']` — le français n'existe pas.
 *
 * | ce qui lit | ce qu'il sert |
 * |---|---|
 * | la descente juste | **Good morning** (rang 2, `en`) |
 * | un résolveur arrêté au rang 1 | Buenos días (l'original) |
 *
 * Les deux textes DIFFÈRENT : le témoin distingue donc « le bon rang » de
 * « aucune descente ».
 *
 * ## ET IL MESURE L'EFFET, PAS L'ANNONCE (loi 4)
 *
 * Le défaut qui a coûté `PostCard` au dépôt (cycle 123 du `CLAUDE.md` racine)
 * n'était pas une pastille absente : c'était une pastille qui ANNONÇAIT une
 * langue sans la SERVIR — un contrôle inerte, pire qu'une surface non câblée.
 * L'assertion qui l'attrape n'interroge ni le rang ni le prisme : **cliquer
 * change-t-il le texte LU ?**
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const ORIGINAL_ES = 'Buenos días';
const SERVI_EN = 'Good morning';

const commentaire = (patch: Partial<PostComment> = {}): PostComment =>
  ({
    id: 'c-prisme',
    content: ORIGINAL_ES,
    createdAt: '2026-09-19T11:58:00.000Z',
    author: { id: 'u1', displayName: 'Noa Berger', username: 'noa' },
    originalLanguage: 'es',
    translations: { en: { text: SERVI_EN, translationModel: 'nllb', createdAt: '2026-09-19T11:59:00.000Z' } },
    ...patch,
  }) as PostComment;

const monter = async (comment: PostComment): Promise<HTMLDivElement> => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <ul>
        <CommentRow
          comment={comment}
          language="fr"
          preferredLanguages={['fr', 'en']}
          locale="fr-FR"
          now={new Date('2026-09-19T12:00:00.000Z')}
        />
      </ul>,
    ),
  );
  return container;
};

const texteLu = (host: ParentNode): string =>
  host.querySelector('[data-comment-row] p')?.textContent?.trim() ?? '';

const pastille = (host: ParentNode): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>('[data-prism-toggle]');

describe('Une rangée de commentaire traduite ANNONCE le Prisme', () => {
  test('le texte servi est celui du rang 2 — et le témoin le distingue de l’original', async () => {
    const host = await monter(commentaire());

    expect(texteLu(host)).toBe(SERVI_EN);
    expect(texteLu(host)).not.toBe(ORIGINAL_ES);
  });

  test('la rangée porte la pastille À GESTE, avec le vocabulaire du COMMENTAIRE', async () => {
    const host = await monter(commentaire());

    const bouton = pastille(host);
    expect(bouton).not.toBe(null);
    expect(bouton?.getAttribute('aria-label')).toBe('Afficher le commentaire dans sa langue d’origine');
    expect(bouton?.getAttribute('aria-pressed')).toBe('false');
  });

  /** LE CONTRE-TÉMOIN — sans lui, le cas ci-dessus verdirait sur une pastille
      posée INCONDITIONNELLEMENT, qui mentirait sur toute rangée non traduite. */
  test('une rangée NON traduite n’annonce rien : il n’y a pas de traduction à dire', async () => {
    const host = await monter(commentaire({ originalLanguage: 'fr', content: 'Bonjour', translations: {} }));

    expect(texteLu(host)).toBe('Bonjour');
    expect(pastille(host)).toBe(null);
  });
});

describe('Et l’original s’ouvre AU GESTE — c’est l’effet qui est mesuré, pas l’annonce', () => {
  test('cliquer la pastille change le texte LU', async () => {
    const host = await monter(commentaire());
    expect(texteLu(host)).toBe(SERVI_EN);

    await act(async () => pastille(host)?.click());

    expect(texteLu(host)).toBe(ORIGINAL_ES);
    expect(pastille(host)?.getAttribute('aria-pressed')).toBe('true');
    expect(pastille(host)?.getAttribute('aria-label')).toBe('Masquer le commentaire dans sa langue d’origine');
  });

  test('re-cliquer revient à la langue du lecteur — le geste est réversible', async () => {
    const host = await monter(commentaire());

    await act(async () => pastille(host)?.click());
    expect(texteLu(host)).toBe(ORIGINAL_ES);

    await act(async () => pastille(host)?.click());
    expect(texteLu(host)).toBe(SERVI_EN);
    expect(pastille(host)?.getAttribute('aria-pressed')).toBe('false');
  });

  /**
   * LA VOIX SUIT LE TEXTE. `lang` disait la langue SERVIE ; si le geste ouvre
   * l'original sans le corriger, un lecteur d'écran prononce l'espagnol avec
   * une voix anglaise — le défaut que `lang` existe pour empêcher, déplacé
   * d'un cran.
   */
  test('`lang` suit ce qui est RÉELLEMENT rendu, des deux côtés du geste', async () => {
    const host = await monter(commentaire());
    const paragraphe = () => host.querySelector('[data-comment-row] p');

    expect(paragraphe()?.getAttribute('lang')).toBe('en');

    await act(async () => pastille(host)?.click());

    expect(paragraphe()?.getAttribute('lang')).toBe('es');
  });
});
