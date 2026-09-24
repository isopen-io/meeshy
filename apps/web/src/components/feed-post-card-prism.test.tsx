import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedPostCard } from './feed-post-card';

/**
 * **SUR LE CORPS D'UNE PUBLICATION, LE PRISME S'ANNONCE ET L'ORIGINAL S'OUVRE
 * AU GESTE** (#7141, critères 1 et 3) — la moitié qui manquait à la rangée de
 * commentaire.
 *
 * La mesure d'origine de l'issue le disait en deux lignes :
 *
 * ```
 * 2A corps du POST (espagnol, lu en fr) :: TRADUIT
 * 2B la CARTE offre-t-elle un accès au Prisme ? :: {"selecteurs":[], …}
 * ```
 *
 * Le texte était donc JUSTE et MUET : traduit sans le dire, sans aucun chemin
 * vers l'original.
 *
 * ## LE CORPUS SE LIT SUR UN RANG ≠ 1 (leçon 261)
 *
 * Publication ESPAGNOLE, traduite en ANGLAIS seulement, lecteur `['fr','en']` —
 * le français n'existe pas. La descente juste sert l'anglais (rang 2) ; un
 * résolveur arrêté au rang 1 servirait l'espagnol. Les deux textes diffèrent,
 * donc le témoin peut tomber.
 *
 * ## ET IL MESURE L'EFFET (loi 4)
 *
 * `PostCard` a déjà coûté au dépôt une zone « traductions disponibles »
 * cliquable dont le clic ne changeait RIEN (cycle 123 du `CLAUDE.md` racine).
 * L'assertion qui attrape ce défaut n'interroge ni le rang ni le prisme :
 * **cliquer change-t-il le texte lu ?**
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

const ORIGINAL_ES = 'Buenos días a todos';
const SERVI_EN = 'Good morning everyone';

const monter = async (post: Partial<FeedPost> & { readonly content: string }): Promise<HTMLDivElement> => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <FeedPostCard
        model={resolveFeedCardModel(
          {
            id: 'p-prisme',
            type: 'POST',
            createdAt: '2026-09-18T11:55:00.000Z',
            author: { id: 'u-nour', displayName: 'Nour', username: 'nour' },
            ...post,
          } as FeedPost,
          { preferredLanguages: ['fr', 'en'], now: new Date('2026-09-18T12:00:00.000Z') },
        )}
      />,
    ),
  );
  return container;
};

const traduit = { content: ORIGINAL_ES, originalLanguage: 'es', translations: { en: { text: SERVI_EN } } };

const corps = (host: ParentNode): string => host.querySelector('[data-feed-text]')?.textContent?.trim() ?? '';

const pastille = (host: ParentNode): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>('[data-prism-toggle]');

describe('Le corps d’une publication traduite ANNONCE le Prisme', () => {
  test('le texte servi est celui du rang 2 — distinct de l’original', async () => {
    const host = await monter(traduit);

    expect(corps(host)).toContain(SERVI_EN);
    expect(corps(host)).not.toContain(ORIGINAL_ES);
  });

  test('la carte porte la pastille À GESTE, avec le vocabulaire de la PUBLICATION', async () => {
    const host = await monter(traduit);

    const bouton = pastille(host);
    expect(bouton).not.toBe(null);
    expect(bouton?.getAttribute('aria-label')).toBe('Afficher la publication dans sa langue d’origine');
    expect(bouton?.getAttribute('aria-pressed')).toBe('false');
  });

  /** LE CONTRE-TÉMOIN — sans lui, le cas ci-dessus verdirait sur une pastille
      posée inconditionnellement, qui mentirait sur toute publication non
      traduite. */
  test('une publication NON traduite n’annonce rien', async () => {
    const host = await monter({ content: 'Bonjour à tous', originalLanguage: 'fr', translations: {} });

    expect(corps(host)).toContain('Bonjour à tous');
    expect(pastille(host)).toBe(null);
  });
});

describe('Et l’original s’ouvre AU GESTE', () => {
  test('cliquer la pastille change le texte LU', async () => {
    const host = await monter(traduit);
    expect(corps(host)).toContain(SERVI_EN);

    await act(async () => pastille(host)?.click());

    expect(corps(host)).toContain(ORIGINAL_ES);
    expect(corps(host)).not.toContain(SERVI_EN);
    expect(pastille(host)?.getAttribute('aria-pressed')).toBe('true');
  });

  test('re-cliquer revient à la langue du lecteur', async () => {
    const host = await monter(traduit);

    await act(async () => pastille(host)?.click());
    expect(corps(host)).toContain(ORIGINAL_ES);

    await act(async () => pastille(host)?.click());
    expect(corps(host)).toContain(SERVI_EN);
  });

  /** LA VOIX SUIT LE TEXTE — sinon un lecteur d'écran prononce l'espagnol avec
      une voix anglaise, le défaut que `lang` existe pour empêcher. */
  test('`lang` suit ce qui est RÉELLEMENT rendu, des deux côtés du geste', async () => {
    const host = await monter(traduit);
    const noeud = () => host.querySelector('[data-feed-text]');

    expect(noeud()?.getAttribute('lang')).toBe('en');

    await act(async () => pastille(host)?.click());

    expect(noeud()?.getAttribute('lang')).toBe('es');
  });
});
