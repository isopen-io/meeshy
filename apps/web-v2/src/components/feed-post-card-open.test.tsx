import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import type { PostToggleKind } from '@/lib/feed/interactions';

import { FeedPostCard } from './feed-post-card';

/**
 * **TOUCHER LA PUBLICATION OUVRE SA FICHE** (#7284) — et le vrai risque de ce
 * lot n'est pas d'oublier le lien : c'est d'AVALER les gestes qui vivaient
 * déjà sur la carte.
 *
 * La fiche `/post/$post` existait, complète et routée, et le seul lien du
 * dépôt qui y menait vivait dans `notification-row.tsx` : on n'atteignait une
 * publication qu'en passant par une notification. Toucher la publication
 * elle-même ne faisait rien.
 *
 * LA ZONE D'OUVERTURE EST CELLE D'iOS, pas la carte entière
 * (`FeedPostCard.swift:419-533`) : le `VStack` qui porte
 * `.contentShape(Rectangle()).onTapGesture { onTapPost?(post) }` contient
 * l'EN-TÊTE et le TEXTE — rien d'autre. Le code d'iOS le dit ligne à ligne
 * pour tout ce qu'il en SORT : « Avec … » (`ReferenceNoteRow`) « HORS de la
 * zone tappable ci-dessus », l'embed vidéo « hors du geste d'ouverture du
 * post », le média « outside nav tap target — has its own fullscreen
 * gesture », le repost « outside parent tap target so its own Button works »,
 * la rangée d'actions « not inside the tap target », et la SCÈNE qui ouvre le
 * PLEIN ÉCRAN (directive porteur 2026-09-05) plutôt que le détail.
 *
 * Chaque cible interne a donc son témoin ici, et chacun mesure l'EFFET, pas
 * la présence : « cliquer change-t-il ce que le lecteur voit / reçoit ? »
 * (loi 4). Un témoin qui ne vérifierait que le nouveau geste laisserait
 * passer la régression la plus probable du lot.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  /* Le moteur de scène est chargé À LA DEMANDE (`lazy`) : le PREMIER
     `import()` coûte une compilation qu'aucune attente ne couvre de façon
     fiable — un témoin de câblage vert SEUL et rouge EN SUITE vient de cette
     course. On le PRÉ-RÉSOUT, on n'allonge pas l'attente. */
  await import('./scene-player');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const NOW = new Date('2026-09-13T12:00:00.000Z');

const basePost = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-09-13T11:55:00.000Z',
  author: { id: 'u1', displayName: 'Léa', username: 'lea' },
  ...partial,
});

type Hosts = {
  readonly onGesture?: (postId: string, kind: PostToggleKind) => void;
  readonly onComment?: (postId: string) => void;
  readonly onOpenScene?: (postId: string, sceneIndex: number) => void;
  readonly isDetail?: boolean;
};

const monte = (post: FeedPost, hosts: Hosts = {}) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <FeedPostCard model={resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: NOW })} {...hosts} />,
    );
  });
};

const lienOuverture = () => container.querySelector<HTMLAnchorElement>('a[data-feed-post-open]');
const zoneOuverture = () => container.querySelector<HTMLElement>('[data-feed-post-open-zone]');

/**
 * LA PREUVE QU'UNE CIBLE N'EST PAS AVALÉE est STRUCTURELLE : le lien
 * d'ouverture ne la CONTIENT pas. C'est exactement le défaut que #7251 a
 * corrigé sur la rangée de conversation — un `<a>` englobant ses propres
 * cibles —, et il survivrait à un témoin qui se contenterait de retrouver la
 * cible dans le document : un `<a>` imbriqué se rend, il ne s'active pas.
 *
 * `contains` rend `undefined` si le lien manque : une carte sans lien
 * d'ouverture ne peut donc pas rendre ce témoin vert par omission.
 */
const horsDuLien = (cible: Element | null): boolean | undefined => {
  expect(cible).not.toBeNull();
  return lienOuverture()?.contains(cible);
};

/** Et hors de la ZONE, pour ce qu'iOS sort explicitement du geste : ni sous le
 * lien, ni sous le voile qui laisse le doigt le traverser. */
const horsDeLaZone = (cible: Element | null): boolean | undefined => {
  expect(cible).not.toBeNull();
  expect(zoneOuverture()).not.toBeNull();
  return zoneOuverture()?.contains(cible);
};

describe('FeedPostCard — toucher la publication ouvre sa fiche', () => {
  test('le corps de la carte porte un lien vers `/post/$post`, nommé par sa destination', () => {
    monte(basePost({ content: 'Bonjour à tous', originalLanguage: 'fr' }));

    const lien = lienOuverture();
    expect(lien).not.toBeNull();
    expect(lien?.getAttribute('href')).toBe('/post/p1');
    expect(lien?.getAttribute('aria-label')).toBe('Ouvrir la publication de Léa');
  });

  /** CIBLE 44 (charte du chantier) — posée sur le lien, jamais déduite du
   * contenu : une carte à en-tête seul doit rester atteignable au doigt. */
  test('la cible fait au moins 44', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }));
    expect(lienOuverture()?.style.minHeight).toBe('44px');
  });

  /** Le glisser natif d'une ancre volerait le défilement du fil — même
   * précaution que le lien du RÉEL (`FeedReelCard`, #6457). */
  test('le lien ne se glisse pas', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }));
    expect(lienOuverture()?.getAttribute('draggable')).toBe('false');
  });

  /** Une publication SANS texte (média seul) reste ouvrable : l'en-tête
   * suffit, exactement comme le `VStack` d'iOS qui contient `authorHeader`. */
  test('une publication sans texte s’ouvre quand même — l’en-tête est dans la zone', () => {
    monte(basePost({ media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 }] }));
    expect(lienOuverture()?.getAttribute('href')).toBe('/post/p1');
  });

  /** LA FICHE NE MÈNE PAS À ELLE-MÊME : `routes/post.tsx` monte la MÊME carte
   * sur le détail, et un lien vers la page courante est un tour de clavier de
   * plus qui ne va nulle part. */
  test('sur la fiche elle-même (`isDetail`), aucun lien d’ouverture', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }), { isDetail: true });
    expect(lienOuverture()).toBeNull();
  });

  /** Un RÉEL a DÉJÀ son geste — il ouvre le lecteur des Réels sur lui-même
   * (#6457) ; lui ajouter une seconde destination ferait deux liens pour un
   * seul doigt. */
  test('un RÉEL ne porte pas ce lien — il mène toujours aux Réels', () => {
    monte(basePost({ id: 'reel-42', type: 'REEL' }));
    expect(lienOuverture()).toBeNull();
    expect(container.querySelector('a[data-feed-reel-open]')?.getAttribute('href')).toBe('/reels?seed=reel-42');
  });
});

describe('FeedPostCard — aucune cible interne n’est avalée par le nouveau geste', () => {
  /**
   * CE QUI REND LA GÉOMÉTRIE POSSIBLE, et qui n'a aucun autre témoin : le lien
   * passe SOUS le contenu, le contenu laisse le doigt le traverser, et ses
   * cibles internes le ré-arment. C'est le motif du RÉEL, déjà en place dans
   * ce fichier — sans le ré-armement, une mention serait rendue, atteignable
   * au clavier, et MORTE au doigt.
   */
  test('la zone laisse traverser le doigt, et ses cibles internes le ré-arment', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }));

    const traversee = container.querySelector<HTMLElement>('[data-feed-post-open-through]');
    expect(traversee?.className).toContain('pointer-events-none');
    expect(traversee?.className).toContain('[&_a]:pointer-events-auto');
    expect(traversee?.className).toContain('[&_button]:pointer-events-auto');
  });

  test('l’avatar mène toujours au profil de l’auteur', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }));

    /* L'avatar ET le nom mènent au profil (#7241) — les deux moitiés de
       l'identité, les deux hors du lien d'ouverture. */
    const profil = [...container.querySelectorAll<HTMLAnchorElement>('a[href="/u/lea"]')];
    expect(profil.length).toBe(2);
    expect(profil.map((lien) => horsDuLien(lien))).toEqual([false, false]);
  });

  test('une mention du texte mène toujours au profil du mentionné', () => {
    monte(basePost({ content: 'Salut @marc', originalLanguage: 'fr', mentions: [{ username: 'marc' }] }));

    expect(horsDuLien(container.querySelector('a[href="/u/marc"]'))).toBe(false);
  });

  test('un hashtag du texte mène toujours à son écran', () => {
    monte(basePost({ content: 'Vive #meeshy', originalLanguage: 'fr' }));

    expect(horsDuLien(container.querySelector('a[href="/hashtag/meeshy"]'))).toBe(false);
  });

  test('« voir plus » développe toujours le texte entier', () => {
    const long = Array.from({ length: 24 }, (_, i) => `mot${i}`).join(' ');
    monte(basePost({ content: long, originalLanguage: 'fr' }));

    expect(container.textContent).not.toContain('mot23');
    const voirPlus = [...container.querySelectorAll('button')].find((b) => b.textContent === 'voir plus');
    expect(voirPlus).toBeDefined();
    act(() => voirPlus?.click());
    expect(container.textContent).toContain('mot23');
  });

  test('la pastille de Prisme bascule toujours vers l’original', () => {
    monte(
      basePost({
        content: 'Buenos días',
        originalLanguage: 'es',
        translations: { fr: { text: 'Bonjour' } },
      }),
    );

    expect(container.textContent).toContain('Bonjour');
    const pastille = container.querySelector<HTMLButtonElement>('[data-prism-toggle]');
    expect(pastille).not.toBeNull();
    act(() => pastille?.click());
    expect(container.textContent).toContain('Buenos días');
  });

  test('le compteur de commentaires ancre toujours sur les commentaires', () => {
    const appels: string[] = [];
    monte(basePost({ content: 'x', originalLanguage: 'fr', commentCount: 3 }), { onComment: (id) => appels.push(id) });

    act(() => container.querySelector<HTMLButtonElement>('button[data-feed-gesture="comment"]')?.click());
    expect(appels).toEqual(['p1']);
  });

  test('les réactions réagissent toujours', () => {
    const appels: [string, PostToggleKind][] = [];
    monte(basePost({ content: 'x', originalLanguage: 'fr', likeCount: 2 }), {
      onGesture: (id, kind) => appels.push([id, kind]),
    });

    act(() => container.querySelector<HTMLButtonElement>('button[data-feed-gesture="like"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('button[data-feed-gesture="bookmark"]')?.click());
    expect(appels).toEqual([
      ['p1', 'like'],
      ['p1', 'bookmark'],
    ]);
  });

  /** LA RANGÉE D'ACTIONS EST HORS DE LA ZONE — iOS l'écrit (« Actions bar (not
   * inside the tap target) ») : un lien qui la couvrirait rendrait « Aimer »
   * ambigu au premier doigt posé légèrement à côté du glyphe. */
  test('la rangée d’actions vit HORS de la zone d’ouverture', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }), { onGesture: () => undefined });

    expect(horsDeLaZone(container.querySelector('[data-feed-actions]'))).toBe(false);
  });

  test('la scène s’ouvre toujours en plein écran, et vit HORS de la zone d’ouverture', async () => {
    const ouvertures: [string, number][] = [];
    monte(
      basePost({
        media: [{ id: 'media-a', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 }],
        storyEffects: {
          v: 3,
          scenes: [
            {
              id: 's1',
              objects: [
                {
                  id: 'o1',
                  kind: 'media',
                  anchor: { t: 'free', x: 0.5, y: 0.5 },
                  plane: 'bg',
                  z: 0,
                  transform: { scale: 1, rotation: 0, opacity: 1 },
                  payload: { postMediaId: 'media-a', mediaType: 'image/jpeg' },
                },
              ],
            },
          ],
        },
      }),
      { onOpenScene: (id, index) => ouvertures.push([id, index]) },
    );
    await act(async () => {});

    const scene = container.querySelector('[data-feed-scene]');
    expect(horsDeLaZone(scene)).toBe(false);

    const ouvrir = scene?.querySelector('button');
    expect(ouvrir).not.toBeNull();
    act(() => ouvrir?.click());
    expect(ouvertures).toEqual([['p1', 0]]);
  });

  test('les flèches du carrousel média pagineent toujours, hors de la zone d’ouverture', () => {
    monte(
      basePost({
        media: [
          { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 },
          { id: 'm2', mimeType: 'image/jpeg', fileUrl: 'b.jpg', order: 1 },
        ],
      }),
    );

    expect(horsDeLaZone(container.querySelector('[data-feed-media]'))).toBe(false);

    expect(container.querySelector('[data-feed-media-counter]')?.textContent).toBe('1 / 2');
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Média suivant"]')?.click());
    expect(container.querySelector('[data-feed-media-counter]')?.textContent).toBe('2 / 2');
  });
});
