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

const lienOuverture = () => container.querySelector<HTMLAnchorElement>('a[data-feed-post-open="heure"]');
const calqueCorps = () => container.querySelector<HTMLAnchorElement>('a[data-feed-post-open="corps"]');
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

/** Et hors du CALQUE : la seconde porte, celle qui couvre le texte. */
const horsDuCalque = (cible: Element | null): boolean | undefined => {
  expect(cible).not.toBeNull();
  return calqueCorps()?.contains(cible);
};

/** Et hors de la ZONE, pour ce qu'iOS sort explicitement du geste : ni sous le
 * lien, ni sous le voile qui laisse le doigt le traverser. */
const horsDeLaZone = (cible: Element | null): boolean | undefined => {
  expect(cible).not.toBeNull();
  expect(zoneOuverture()).not.toBeNull();
  return zoneOuverture()?.contains(cible);
};

describe('FeedPostCard — toucher la publication ouvre sa fiche', () => {
  test('l’heure relative mène à `/post/$post`, nommée par sa DESTINATION et non par l’heure', () => {
    monte(basePost({ content: 'Bonjour à tous', originalLanguage: 'fr' }));

    const lien = lienOuverture();
    expect(lien).not.toBeNull();
    expect(lien?.getAttribute('href')).toBe('/post/p1');
    /* « il y a 2 h » ne dit pas OÙ l'on va — et c'est le seul contrôle du fil
       qui y mène pour qui n'y voit pas. */
    expect(lien?.getAttribute('aria-label')).toBe('Ouvrir la publication de Léa');
    expect(lien?.textContent).not.toBe('');
  });

  test('le texte est COUVERT par un second lien vers la même fiche', () => {
    monte(basePost({ content: 'Bonjour à tous', originalLanguage: 'fr' }));
    expect(calqueCorps()?.getAttribute('href')).toBe('/post/p1');
  });

  /**
   * DEUX LIENS DE MÊME DESTINATION SE LIRAIENT DEUX FOIS. Le calque est le
   * DOUBLON généreux au doigt ; l'heure est le contrôle annoncé et focusable —
   * même partage que le lien d'avatar dupliqué de `lens-row.tsx` (#7251).
   */
  test('le calque sort de l’arbre d’accessibilité et du parcours clavier ; l’heure y reste', () => {
    monte(basePost({ content: 'Bonjour à tous', originalLanguage: 'fr' }));

    expect(calqueCorps()?.getAttribute('aria-hidden')).toBe('true');
    expect(calqueCorps()?.getAttribute('tabindex')).toBe('-1');
    expect(lienOuverture()?.getAttribute('aria-hidden')).toBeNull();
    expect(lienOuverture()?.getAttribute('tabindex')).toBeNull();
  });

  /**
   * **L'EN-TÊTE N'EST PAS COUVERT, ET C'EST UN ÉCART ASSUMÉ AVEC iOS** (#7284).
   * Là-bas le `VStack` tapable contient `authorHeader` ; ici non, parce qu'un
   * calque CSS est un CONTRÔLE parmi les autres et que `check-profile.mjs`
   * exige qu'un contrôle POSSÈDE SON CENTRE — mesuré, le centre d'un calque
   * couvrant l'en-tête tombait sur le nom de l'auteur. Ce témoin EMPÊCHE de
   * « corriger » l'écart en réétendant le calque, ce qui rouvrirait le défaut.
   */
  test('l’en-tête n’est JAMAIS couvert par le calque — l’identité vit hors de la région', () => {
    monte(basePost({ content: 'Bonjour à tous', originalLanguage: 'fr' }));

    const zone = zoneOuverture();
    expect(zone).not.toBeNull();
    const avatar = container.querySelector('a[href="/u/lea"]');
    expect(avatar).not.toBeNull();
    expect(zone?.contains(avatar)).toBe(false);
  });

  /** CIBLE 44 (charte du chantier) — posée sur le lien, jamais déduite du
   * contenu : une carte à en-tête seul doit rester atteignable au doigt. */
  /** LA PORTE DE 44 — et c'est elle qui rend le calque possible :
   * `check-profile.mjs` exempte un petit contrôle dont l'adresse a DÉJÀ une
   * grande porte, si bien que le calque peut ne faire qu'une ligne de haut. */
  test('l’heure fait au moins 44', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }));
    expect(lienOuverture()?.style.minHeight).toBe('44px');
  });

  /** Le glisser natif d'une ancre volerait le défilement du fil — même
   * précaution que le lien du RÉEL (`FeedReelCard`, #6457). */
  test('le calque ne se glisse pas — le glisser natif d’une ancre volerait le défilement', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }));
    expect(calqueCorps()?.getAttribute('draggable')).toBe('false');
  });

  /** Une publication SANS texte (média seul) reste ouvrable : l'en-tête
   * suffit, exactement comme le `VStack` d'iOS qui contient `authorHeader`. */
  /** SANS TEXTE, IL N'Y A PAS DE CALQUE — et la publication reste ouvrable
   * par l'heure. C'est la raison d'être de la porte de l'en-tête : le calque
   * seul aurait laissé une publication média inatteignable. */
  test('une publication sans texte n’a pas de calque, et s’ouvre quand même par l’heure', () => {
    monte(basePost({ media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 }] }));
    expect(calqueCorps()).toBeNull();
    expect(lienOuverture()?.getAttribute('href')).toBe('/post/p1');
  });

  /** LA FICHE NE MÈNE PAS À ELLE-MÊME : `routes/post.tsx` monte la MÊME carte
   * sur le détail, et un lien vers la page courante est un tour de clavier de
   * plus qui ne va nulle part. */
  test('sur la fiche elle-même (`isDetail`), NI heure-lien NI calque', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }), { isDetail: true });
    expect(lienOuverture()).toBeNull();
    expect(calqueCorps()).toBeNull();
  });

  /** Un RÉEL a DÉJÀ son geste — il ouvre le lecteur des Réels sur lui-même
   * (#6457) ; lui ajouter une seconde destination ferait deux liens pour un
   * seul doigt. */
  test('un RÉEL ne porte aucun des deux — il mène toujours aux Réels', () => {
    monte(basePost({ id: 'reel-42', type: 'REEL' }));
    expect(lienOuverture()).toBeNull();
    expect(calqueCorps()).toBeNull();
    expect(container.querySelector('a[data-feed-reel-open]')?.getAttribute('href')).toBe('/reels?seed=reel-42');
  });
});

describe('FeedPostCard — aucune cible interne n’est avalée par le nouveau geste', () => {
  /**
   * CE QUI REND LA GÉOMÉTRIE POSSIBLE, et qui n'a aucun autre témoin ICI : le
   * lien passe SOUS le contenu, le contenu laisse le doigt le traverser, et
   * ses cibles internes le ré-arment. Sans le ré-armement, une mention serait
   * rendue, atteignable au clavier, et MORTE au doigt.
   *
   * **`relative z-[1]` EST LA MOITIÉ QUI MANQUAIT, et elle a coûté un rouge.**
   * `pointer-events-auto` ne suffit pas : un élément ré-armé qu'un calque
   * RECOUVRE reste inatteignable. Le lien est `position: absolute` — étape 8
   * de l'ordre de peinture CSS — et le contenu en flux normal aux étapes 4 à
   * 7 : le lien était donc AU-DESSUS et volait toute cible qui n'était pas
   * elle-même positionnée. L'avatar y échappait PAR ACCIDENT (son enveloppe
   * porte déjà `relative`, `avatar.tsx:183`) ; le NOM, un `<Link>` nu, était
   * volé — et c'est pour ça que ma vérification au navigateur, qui sondait
   * l'avatar, ne l'a pas vu. `check-profile.mjs` l'a vu : « aucun contrôle
   * volé à son centre au repos », « Voir le profil de … », 25,5 px, `par: "A"`.
   *
   * Ce témoin-ci ne peut pas mesurer un clic RÉEL — happy-dom ne fait aucun
   * test de recouvrement. Il garde donc la CAUSE, pour qu'un lot qui allège
   * ces classes sache ce qu'il retire ; la PREUVE, elle, est au navigateur
   * (`check-profile.mjs`, rouge sans cette ligne, vert avec).
   */
  test('la zone laisse traverser le doigt, ré-arme ses cibles, et les peint AU-DESSUS du calque', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }));

    const traversee = container.querySelector<HTMLElement>('[data-feed-post-open-through]');
    expect(traversee?.className).toContain('pointer-events-none');
    expect(traversee?.className).toContain('[&_a]:pointer-events-auto');
    expect(traversee?.className).toContain('[&_button]:pointer-events-auto');
    /* L'ORDRE DE PEINTURE, sans quoi les trois classes ci-dessus sont inertes. */
    expect(traversee?.className).toContain('relative');
    expect(traversee?.className).toContain('z-[1]');
  });

  test('l’avatar mène toujours au profil de l’auteur', () => {
    monte(basePost({ content: 'x', originalLanguage: 'fr' }));

    /* L'avatar ET le nom mènent au profil (#7241) — les deux moitiés de
       l'identité, et depuis #7284 toutes deux HORS de la région couverte. */
    const profil = [...container.querySelectorAll<HTMLAnchorElement>('a[href="/u/lea"]')];
    expect(profil.length).toBe(2);
    expect(profil.map((lien) => horsDuCalque(lien))).toEqual([false, false]);
    expect(profil.map((lien) => horsDuLien(lien))).toEqual([false, false]);
  });

  test('une mention du texte mène toujours au profil du mentionné', () => {
    monte(basePost({ content: 'Salut @marc', originalLanguage: 'fr', mentions: [{ username: 'marc' }] }));

    expect(horsDuCalque(container.querySelector('a[href="/u/marc"]'))).toBe(false);
  });

  test('un hashtag du texte mène toujours à son écran', () => {
    monte(basePost({ content: 'Vive #meeshy', originalLanguage: 'fr' }));

    expect(horsDuCalque(container.querySelector('a[href="/hashtag/meeshy"]'))).toBe(false);
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
        /* AVEC du texte : sans lui il n'y a PAS de calque, et le témoin serait
           vert par ABSENCE de sujet plutôt que par séparation. */
        content: 'Une scène',
        originalLanguage: 'fr',
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
        content: 'Deux images',
        originalLanguage: 'fr',
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
