import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider, onlineManager, type QueryKey } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { authorPostsQueryKey } from '@/lib/api/author-posts';
import { BOOKMARKS_QUERY_KEY } from '@/lib/api/bookmarked-posts';
import type { FeedPost } from '@/lib/api/feed-pages';
import { POST_IMAGE_FR } from '@/lib/api/fixtures-feed';
import { REEL_MARKET_IMAGES, REEL_STUDIO } from '@/lib/api/fixtures-reels';
import { hashtagQueryKey } from '@/lib/api/hashtag-posts';
import { postQueryKey } from '@/lib/api/publication-detail';
import { appQueryClient } from '@/lib/api/query-client';
import { reelsQueryKey } from '@/lib/api/reels';
import { navigate } from '@/lib/router';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Router } from './route-table';

/**
 * **OUVRIR UNE PUBLICATION DÉJÀ PEINTE LA PEINT TOUT DE SUITE** (#7384).
 *
 * La fiche `/post/$post` et le lecteur des Réels amorçaient leur première
 * peinture depuis le Flux SEUL : touchée sur la page d'un hashtag, sur un
 * profil, dans les enregistrées ou dans un fil de Réels, une publication que
 * l'écran précédent AFFICHAIT s'ouvrait sur un squelette et attendait le
 * réseau (Cache-First violé, « une lenteur est un bug »).
 *
 * Chaque témoin monte l'ÉCRAN RÉEL par le routeur de l'application, avec la
 * publication dans UNE SEULE caisse du registre (`card-caches.ts`) et le
 * réseau SUSPENDU (`onlineManager` hors ligne : TanStack met la requête en
 * pause, elle ne peut PAS répondre). Rien d'autre que le cache ne peut donc
 * peindre la carte. Les identifiants sont absents des fixtures : même rendu au
 * réseau, la passerelle factice répondrait 404, jamais la carte.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/feed' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  onlineManager.setOnline(value);
};

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
  appQueryClient.clear();
  setOnline(true);
  navigate('/feed', true);
});

const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

/** L'écran est DÉCOUPÉ (`lazy`) : on attend qu'il soit monté, jamais une
 * durée au jugé. */
async function mountAt(url: string, screen: string): Promise<HTMLDivElement> {
  navigate(url, true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <Router wrap={(children) => <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>} skeleton={<div data-route-pending />} />,
    );
  });
  for (let attempt = 0; attempt < 50 && container.querySelector(screen) === null; attempt += 1) await tick();
  if (container.querySelector(screen) === null) throw new Error(`écran ${screen} jamais monté`);
  await tick();
  return container;
}

const FICHE = '#contenu';
const LECTEUR = '[data-reels]';
const FICHE_SQUELETTE = '[aria-label="Chargement de la publication"]';

type Caisse = { readonly nom: string; readonly key: QueryKey; readonly poser: (posts: readonly FeedPost[]) => unknown };

const keyset = (posts: readonly FeedPost[]) => ({ pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }], pageParams: [undefined] });

/** Les formes RÉELLES des caisses : le hashtag pagine par décalage, les autres par curseur. */
const HASHTAG: Caisse = { nom: 'la page d’un hashtag', key: hashtagQueryKey('livraison'), poser: (posts) => ({ pages: [{ posts, nextCursor: null }], pageParams: [0] }) };
const PROFIL: Caisse = { nom: 'les publications d’un profil', key: authorPostsQueryKey('u-auteur'), poser: keyset };
const ENREGISTREES: Caisse = { nom: 'les enregistrées', key: BOOKMARKS_QUERY_KEY, poser: keyset };
const REELS: Caisse = { nom: 'un fil de Réels', key: reelsQueryKey('reel-graine'), poser: keyset };

const poser = (caisse: Caisse, posts: readonly FeedPost[], updatedAt?: number) =>
  appQueryClient.setQueryData(caisse.key, caisse.poser(posts), updatedAt === undefined ? undefined : { updatedAt });

const publication = (id: string): FeedPost => ({ ...POST_IMAGE_FR, id, content: `Publication ${id}, peinte depuis le cache.` });
const reel = (id: string): FeedPost => ({ ...REEL_STUDIO, id, content: `Réel ${id}, peint depuis le cache.` });

describe('la fiche /post/$post se peint depuis TOUTE caisse qui porte la publication, réseau suspendu', () => {
  for (const caisse of [HASHTAG, PROFIL, ENREGISTREES, REELS]) {
    test(`ouverte depuis ${caisse.nom} : la carte, sans squelette`, async () => {
      const id = `pub-seule-${String(caisse.key[0])}`;
      poser(caisse, [publication(id)]);
      setOnline(false);

      const el = await mountAt(`/post/${id}`, FICHE);

      expect(el.querySelector(FICHE_SQUELETTE)).toBeNull();
      expect(el.querySelector(`[data-feed-card-id="${id}"]`)).not.toBeNull();
      expect(el.textContent).toContain(`Publication ${id}, peinte depuis le cache.`);
    });
  }

  test('AUCUNE caisse ne la porte : le squelette reste, et aucune autre carte n’est empruntée', async () => {
    poser(HASHTAG, [publication('pub-voisine')]);
    setOnline(false);

    const el = await mountAt('/post/pub-absente', FICHE);

    expect(el.querySelector(FICHE_SQUELETTE)).not.toBeNull();
    expect(el.querySelector('[data-feed-card-id]')).toBeNull();
  });

  test('la carte amorcée porte la DATE de la caisse qui l’a fournie — la revalidation en fond reste juste', async () => {
    const servie = Date.now() - 90_000;
    poser(PROFIL, [publication('pub-datee')], servie);
    setOnline(false);

    await mountAt('/post/pub-datee', FICHE);

    expect(appQueryClient.getQueryState(postQueryKey('pub-datee'))?.dataUpdatedAt).toBe(servie);
  });
});

/** Un squelette qui ne dure qu'UNE image est déjà un clignement : on le guette
 * à chaque mutation du DOM, pas seulement à la fin. */
function watchForSkeleton(container: HTMLElement, selector: string): () => boolean {
  const seen = { value: container.querySelector(selector) !== null };
  const observer = new MutationObserver(() => {
    if (container.querySelector(selector) !== null) seen.value = true;
  });
  observer.observe(container, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    return seen.value;
  };
}

describe('stale-while-revalidate : la carte en cache tout de suite, la relecture en silence', () => {
  test('la relecture remplace la carte amorcée SANS jamais repasser par le squelette', async () => {
    poser(HASHTAG, [{ ...POST_IMAGE_FR, content: 'Version gardée par le hashtag.' }]);
    const stop = watchForSkeleton(document.body, FICHE_SQUELETTE);

    const el = await mountAt(`/post/${POST_IMAGE_FR.id}`, FICHE);
    for (let attempt = 0; attempt < 20 && !(el.textContent ?? '').includes(POST_IMAGE_FR.content ?? ''); attempt += 1) await tick();

    expect(stop()).toBe(false);
    expect(el.textContent).toContain(POST_IMAGE_FR.content ?? '');
    expect(el.textContent).not.toContain('Version gardée par le hashtag.');
  });

  test('une carte de liste PARTIELLE (ni auteur, ni média, ni compteurs) se peint, puis la relecture la complète', async () => {
    const mince: FeedPost = { id: POST_IMAGE_FR.id, type: 'POST', createdAt: POST_IMAGE_FR.createdAt, content: 'Carte mince du profil.' };
    poser(PROFIL, [mince]);
    const stop = watchForSkeleton(document.body, FICHE_SQUELETTE);

    const el = await mountAt(`/post/${POST_IMAGE_FR.id}`, FICHE);
    expect(el.querySelector(`[data-feed-card-id="${POST_IMAGE_FR.id}"]`)).not.toBeNull();
    for (let attempt = 0; attempt < 20 && !(el.textContent ?? '').includes(POST_IMAGE_FR.content ?? ''); attempt += 1) await tick();

    expect(stop()).toBe(false);
    expect(el.textContent).toContain(POST_IMAGE_FR.content ?? '');
    expect(el.querySelector(`[data-feed-card-id="${POST_IMAGE_FR.id}"] img`)).not.toBeNull();
  });

  /* LE CAS RÉEL D'UNE CARTE PARTIELLE : la liste d'un hashtag ne sert AUCUN
     état du lecteur (`services/gateway/src/routes/posts/hashtag.ts`, #7396).
     La carte amorcée montre ce que l'écran précédent montrait ; la relecture
     de la fiche rend ce que la liste taisait. */
  test('une carte de hashtag SANS l’état du lecteur : peinte telle quelle, puis la relecture allume le cœur', async () => {
    const { isLikedByMe, isBookmarkedByMe, isRepostedByMe, ...sansEtat } = REEL_MARKET_IMAGES;
    expect(isLikedByMe).toBe(true);
    poser(HASHTAG, [sansEtat]);
    const coeur = `[data-feed-card-id="${REEL_MARKET_IMAGES.id}"] [data-feed-gesture="like"]`;
    const stop = watchForSkeleton(document.body, FICHE_SQUELETTE);
    setOnline(false);

    const el = await mountAt(`/post/${REEL_MARKET_IMAGES.id}`, FICHE);
    expect(el.querySelector(coeur)?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => setOnline(true));
    for (let attempt = 0; attempt < 20 && el.querySelector(coeur)?.getAttribute('aria-pressed') !== 'true'; attempt += 1) await tick();

    expect(stop()).toBe(false);
    expect(el.querySelector(coeur)?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('le lecteur des Réels tient pour CONNUE une graine présente dans n’importe quelle caisse, réseau suspendu', () => {
  const entrees = [
    { caisse: HASHTAG, adresse: (id: string) => `/reels?seed=${id}` },
    { caisse: PROFIL, adresse: (id: string) => `/reel/${id}` },
    { caisse: ENREGISTREES, adresse: (id: string) => `/reels?seed=${id}` },
  ] as const;

  for (const { caisse, adresse } of entrees) {
    test(`ouvert depuis ${caisse.nom} (${adresse('…')}) : le réel touché, sans squelette`, async () => {
      const id = `reel-seul-${String(caisse.key[0])}`;
      poser(caisse, [reel(id)]);
      setOnline(false);

      const el = await mountAt(adresse(id), LECTEUR);

      expect(el.querySelector('[data-reels-skeleton]')).toBeNull();
      expect(el.querySelector('[data-reel-index="0"]')?.getAttribute('data-reel')).toBe(id);
      expect(el.textContent).toContain(`Réel ${id}, peint depuis le cache.`);
    });
  }

  test('AUCUNE caisse ne porte la graine : aucun réel n’est inventé', async () => {
    poser(HASHTAG, [reel('reel-voisin')]);
    setOnline(false);

    const el = await mountAt('/reels?seed=reel-absent', LECTEUR);

    expect(el.querySelector('[data-reel]')).toBeNull();
  });
});

/**
 * LA DATE DE LA CAISSE JUGE LA RELECTURE DE LA GRAINE — une publication est un
 * objet PUBLIÉ, cinq minutes de fraîcheur (`PUBLICATION_STALE_TIME`, #6974) ;
 * ce qui bouge — compteurs, état du lecteur — est tenu par le registre. Sans
 * cette date, TanStack daterait la graine de l'OUVERTURE : une carte restaurée
 * du disque, vieille de plusieurs heures, passerait pour fraîche.
 */
describe('la graine amorcée des Réels : sa caisse dit si elle se relit', () => {
  test('graine d’une caisse RÉCENTE : peinte, et PAS relue', async () => {
    const servie = Date.now() - 30_000;
    poser(HASHTAG, [{ ...REEL_STUDIO, content: 'Légende gardée par le hashtag.' }], servie);

    const el = await mountAt(`/reels?seed=${REEL_STUDIO.id}`, LECTEUR);
    await tick();

    expect(el.querySelector('[data-reel-index="0"]')?.getAttribute('data-reel')).toBe(REEL_STUDIO.id);
    expect(el.textContent).toContain('Légende gardée par le hashtag.');
    expect(appQueryClient.getQueryState(postQueryKey(REEL_STUDIO.id))?.dataUpdatedAt).toBe(servie);
  });

  test('graine d’une caisse ANCIENNE : peinte tout de suite, relue en fond, sans jamais de squelette', async () => {
    poser(PROFIL, [{ ...REEL_STUDIO, content: 'Légende gardée par le profil.' }], Date.now() - 10 * 60_000);
    const stop = watchForSkeleton(document.body, '[data-reels-skeleton]');

    const el = await mountAt(`/reel/${REEL_STUDIO.id}`, LECTEUR);
    for (let attempt = 0; attempt < 20 && !(el.textContent ?? '').includes(REEL_STUDIO.content ?? ''); attempt += 1) await tick();

    expect(stop()).toBe(false);
    expect(el.querySelector('[data-reel-index="0"]')?.getAttribute('data-reel')).toBe(REEL_STUDIO.id);
    expect(el.textContent).toContain(REEL_STUDIO.content ?? '');
    expect(el.textContent).not.toContain('Légende gardée par le profil.');
  });
});
