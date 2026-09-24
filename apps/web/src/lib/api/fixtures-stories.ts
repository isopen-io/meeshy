import { VIEWER_ID, portraitStandIn } from './fixtures-base';
import { REEL_CLIP_RGB, REEL_CLIP_VOICE, STORY_CLIP_LONG } from './fixtures-reel-clips';
import type { StatusMoodPost, StoryFeedPost, StoryTrayPost } from './stories';

/**
 * **L'HORLOGE DES FIXTURES DE STORY, ANCRÉE SUR MAINTENANT** (#5817,
 * correctif d'un défaut mesuré § README « fixtures ancrées sur maintenant »).
 *
 * `STORY_TRAY`/`STORY_FEED` portaient des dates ABSOLUES (`'2026-09-11T…'`) —
 * justes le jour de leur écriture, PÉRIMÉES le lendemain : une story n'a pas
 * d'`expiresAt` explicite au-delà de 20 h (`STORY_EXPIRY_MS`,
 * `lib/stories/playback.ts`), donc CHAQUE story de ce corpus était déjà
 * EXPIRÉE dès qu'on l'ouvrait un jour plus tard que son écriture. Mesuré en
 * ouvrant `/story/st-amie-1` (#5817) : le lecteur sautait les DEUX stories
 * d'Inès (expirées), la story de Camille (expirée aussi), et fermait —
 * exactement le symptôme que `resolvePlayablePosition` est censé PRODUIRE
 * pour une vraie story expirée, ici déclenché par un corpus périmé, pas par
 * le comportement testé. `fixtures-base.ts` porte déjà le remède
 * (`minutesAgo`) pour les fixtures du fil ; ce fichier ne l'employait pas.
 */
const hoursAgo = (hours: number): string => new Date(Date.now() - hours * 3_600_000).toISOString();
const hoursFromNow = (hours: number): string => new Date(Date.now() + hours * 3_600_000).toISOString();

/**
 * **UNE VRAIE SOURCE D'IMAGE, PAS UNE CHAÎNE VIDE** (#5817, revue-correction).
 *
 * La convention des fixtures du fil est `fileUrl: ''` = « pas d'image »
 * (`fixtures.ts`, `resolveAttachmentSrc` la laisse passer telle quelle) ; le
 * corpus de stories l'avait reprise pour sa story IMAGE, ce qui rendait
 * `<img src="">` : le navigateur y peint son icône de lien brisé et redemande
 * le document courant. Mesuré sur `story-image-light.png` du premier jet —
 * un rectangle NOIR avec une vignette cassée en haut à gauche, capturé et
 * décrit comme « story IMAGE ». Une story dont la seule matière est un média
 * a besoin d'un média : un `data:` URI traverse `resolveAttachmentSrc`
 * inchangé (motif `blob:`/`data:` déjà prévu) et ne coûte aucune requête.
 */
const STORY_PHOTO_STAND_IN =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 160">' +
      '<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#f3b27a"/><stop offset="0.45" stop-color="#6f7fd6"/>' +
      '<stop offset="1" stop-color="#1b1f3b"/></linearGradient></defs>' +
      '<rect width="90" height="160" fill="url(#c)"/>' +
      '<circle cx="66" cy="34" r="11" fill="#fff2cc" opacity="0.9"/>' +
      '<path d="M0 108 L26 74 L46 100 L64 82 L90 116 L90 160 L0 160 Z" fill="#142033" opacity="0.85"/>' +
      '</svg>',
  );

/**
 * **LE PLATEAU EN FIXTURES** (#6080) — servi par le MÊME chemin que la
 * passerelle (`loadStoryTray`), jamais par une branche de l'écran.
 *
 * Il est écrit pour EXERCER la règle de tri, pas pour faire joli : le lecteur
 * a une story à lui (la plus ancienne), un ami a publié DEUX fois, et l'auteur
 * dont la story est la plus RÉCENTE est déjà vu. Un rail trié par date seule
 * les mettrait exactement dans l'ordre inverse.
 *
 * `isViewedByMe` (#5817) — la passerelle le sert dans les DEUX projections
 * (§ `stories.ts` doc-comment de `StoryTrayPost`) : ce jeu l'exerce enfin,
 * pour que l'anneau puisse s'ÉTEINDRE sur une capture de fixtures. L'auteur
 * « Moi » est désormais `VIEWER_ID` (#5817, correctif du défaut relevé § 2 de
 * la spécification — c'était `'u-poc'`, jamais égal à `VIEWER_ID`, donc
 * `isMine` n'était JAMAIS vrai sur ce corpus).
 */
export const STORY_TRAY: readonly StoryTrayPost[] = [
  {
    id: 'st-vue-recente',
    type: 'STORY',
    createdAt: hoursAgo(2),
    expiresAt: hoursFromNow(18),
    viewCount: 12,
    isViewedByMe: true,
    author: { id: 'u-camille', username: 'camille', displayName: 'Camille Roy', avatar: portraitStandIn('#34d399', '#065f46') },
    media: [{ id: 'm1', thumbnailUrl: '', mimeType: 'image/jpeg' }],
  },
  {
    id: 'st-amie-1',
    type: 'STORY',
    createdAt: hoursAgo(5),
    expiresAt: hoursFromNow(15),
    viewCount: 3,
    isViewedByMe: false,
    author: { id: 'u-ines', username: 'ines', firstName: 'Inès', lastName: 'Baraka' },
    media: [{ id: 'm2', thumbnailUrl: '', mimeType: 'image/jpeg' }],
  },
  {
    id: 'st-amie-2',
    type: 'STORY',
    createdAt: hoursAgo(3),
    expiresAt: hoursFromNow(17),
    viewCount: 5,
    isViewedByMe: false,
    author: { id: 'u-ines', username: 'ines', firstName: 'Inès', lastName: 'Baraka' },
    media: [{ id: 'm3', thumbnailUrl: '', mimeType: 'image/svg+xml' }],
  },
  {
    id: 'st-mienne',
    type: 'STORY',
    createdAt: hoursAgo(8),
    expiresAt: hoursFromNow(12),
    viewCount: 8,
    isViewedByMe: true,
    author: { id: VIEWER_ID, username: 'vous', displayName: 'Moi' },
    media: [{ id: 'm4', thumbnailUrl: '', mimeType: 'image/jpeg' }],
  },
  /**
   * **LA STORY VIDÉO** (#6807) — la seule du corpus, et le seul chemin par
   * lequel `StoryMediaLayer` peut élire un `<video>` en recette (#6801).
   *
   * DÉJÀ VUE et la PLUS ANCIENNE, délibérément : le rail range les non-vues
   * d'abord, puis par date. Une story neuve et non vue prendrait la TÊTE du
   * rail et déplacerait chaque tuile existante — un gate qui atteint « la
   * première pastille » basculerait sans que rien de sa règle ait changé.
   * Son auteur est NOUVEAU pour la même raison : ajouter cette story à
   * Camille ou à Inès ferait passer leur compteur de « 1 story » à
   * « 2 stories », un libellé que la recette d'internationalisation lit.
   */
  {
    id: 'st-video',
    type: 'STORY',
    createdAt: hoursAgo(9),
    expiresAt: hoursFromNow(11),
    viewCount: 21,
    isViewedByMe: true,
    author: { id: 'u-tarek', username: 'tarek', firstName: 'Tarek', lastName: 'Amrani' },
    media: [{ id: 'm5', thumbnailUrl: '', mimeType: 'video/webm' }],
  },
  /**
   * **LA STORY VIDÉO LONGUE** (#6836) — 9 s, au-dessus du plancher de 6 s.
   *
   * Elle existe pour UNE raison : `st-video` ne peut pas faire tomber un
   * lecteur qui aurait gardé la constante au dénominateur. Son clip dure 3 s,
   * donc `slideDurationMs` et `DEFAULT_SLIDE_DURATION_MS` rendent la MÊME
   * valeur (6 s) — la loi juste et la loi absente sont indiscernables sur ce
   * vecteur. À 9 s elles divergent : 9 s contre 6 s, et la diapositive coupe
   * le média au tiers restant.
   *
   * Même précaution de RANG que sa jumelle courte : déjà vue et plus ancienne
   * qu'elle, chez le MÊME auteur. Un nouvel auteur ajouterait une tuile au
   * rail ; chez Tarek, son compteur passe de « 1 story » à « 2 stories » —
   * libellé que la recette d'internationalisation lit — mais sa tuile reste
   * à sa place et aucune autre ne bouge. C'est le moindre des deux
   * déplacements, et le seul qui ne touche pas un gate de géographie.
   */
  {
    id: 'st-video-long',
    type: 'STORY',
    createdAt: hoursAgo(10),
    expiresAt: hoursFromNow(10),
    viewCount: 14,
    isViewedByMe: true,
    author: { id: 'u-tarek', username: 'tarek', firstName: 'Tarek', lastName: 'Amrani' },
    media: [{ id: 'm6', thumbnailUrl: '', mimeType: 'video/webm' }],
  },
];

/**
 * **UNE VRAIE IMAGE PAYSAGE** (#6899) — 16:9, pour que le fond AJUSTÉ
 * (`videoFitMode: "fit"`) d'une scène v3 laisse des BANDES dans la scène 9:16
 * (`StoryLetterboxFill`) : `STORY_PHOTO_STAND_IN` ci-dessus est PORTRAIT
 * (90×160, ~9:16) et ne laisserait aucune bande à habiller.
 */
const STORY_SCENE_LANDSCAPE_STAND_IN =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">' +
      '<defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs>' +
      '<rect width="160" height="90" fill="url(#p)"/>' +
      '<circle cx="128" cy="24" r="10" fill="#fff7ed" opacity="0.9"/>' +
      '</svg>',
  );

/** Deux ThumbHash de démonstration. DEUX, et c'est voulu : le composite de la
 * SLIDE (`LHkC`, rose ambré `#dda09a`, la valeur de `THUMB_HASH_AMBER` dans
 * `fixtures-feed.ts`) peint le fond flou du lecteur et le placeholder de la
 * carte ; le MÉDIA de fond (`EHoC`, brun `#763913`, la teinte du paysage qu'il
 * résume) peint la bande (`letterboxHashes`, fond d'abord). Deux teintes
 * distinctes sont ce qui permet à `check-story-scene.mjs` de dire, au pixel,
 * LEQUEL des deux est peint — et une bande SOMBRE est ce qui garde lisible le
 * texte blanc que l'auteur y pose (la première valeur, `PAo8` = `#8affc5`,
 * le rendait à peine visible sur la capture). */
const STORY_SCENE_THUMB_HASH = 'LHkC';
const STORY_SCENE_MEDIA_THUMB_HASH = 'EHoC';

const sceneStoryAuthor = { id: 'u-nova', username: 'nova', firstName: 'Nova', lastName: 'Haddad' } as const;

/** La pièce PAYSAGE, à la FORME que la passerelle sert (`mediaSelect`,
 * `postIncludes.ts:98-120`) : `fileUrl`, dimensions, ThumbHash. */
const scenePano = (id: string) =>
  ({ id, fileUrl: STORY_SCENE_LANDSCAPE_STAND_IN, mimeType: 'image/svg+xml', width: 1600, height: 900, thumbHash: STORY_SCENE_MEDIA_THUMB_HASH }) as const;

const identity = { scale: 1, rotation: 0, opacity: 1 } as const;

const fitBackground = (postMediaId: string) => ({
  id: 'bg',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'bg',
  z: 0,
  transform: identity,
  payload: { postMediaId, mediaType: 'image/svg+xml', aspectRatio: 16 / 9, thumbHash: STORY_SCENE_MEDIA_THUMB_HASH, transform: { videoFitMode: 'fit' } },
});

/**
 * **LES STORIES DE SCÈNE v3** (#6899) — trois documents canvas `v:3`
 * (`storyEffects`) rendus par le MÊME moteur que le fil (`ScenePlayer`, D-79),
 * un par présentation du lecteur :
 *
 * - `st-scene` — fond paysage ajusté ET un texte posé sur la BANDE basse
 *   (`y: 0.92`) ⇒ verdict `canvas` : la carte 9:16 entière, bandes habillées
 *   au ThumbHash, son de fond (`REEL_CLIP_VOICE`, décodable), épingle de
 *   timeline à 8 s ;
 * - `st-scene-image-text` — le même fond, un texte DANS l'image ⇒ `imageOnly`,
 *   moteur rogné au rectangle de l'image, le texte reste lisible ; épinglée à
 *   3 s, SOUS le plancher de 6 s : c'est le seul vecteur où l'épingle
 *   autoritaire (`computedTotalDuration`) et la loi du contenu divergent
 *   (3 s contre 6 s) ;
 * - `st-scene-image` — le fond seul ⇒ `imageOnly` sans moteur.
 *
 * Les textes sont en espagnol, traduits en anglais seulement : le lecteur de
 * recette (`fr` puis la langue du navigateur) les lit donc au RANG 2 — un
 * témoin de rang s'écrit sur un rang autre que le premier (leçon 261).
 *
 * ABSENTES de `STORY_TRAY` (délibérément) : un auteur NOUVEAU ajouterait une
 * tuile au rail, et la géographie du rail est gardée ailleurs (voir
 * `st-video`) ; ce corpus n'a besoin que d'être atteignable en DIRECT
 * (`/story/st-scene`), la 3ᵉ marche de la cascade du lecteur. Déjà VUES et
 * les plus ANCIENNES pour la même raison.
 */
export const SCENE_STORIES: readonly StoryFeedPost[] = [
  {
    id: 'st-scene',
    type: 'STORY',
    createdAt: hoursAgo(13),
    expiresAt: hoursFromNow(7),
    viewCount: 2,
    isViewedByMe: true,
    author: sceneStoryAuthor,
    originalLanguage: 'es',
    media: [scenePano('m-scene-pano'), { id: 'm-scene-track', fileUrl: REEL_CLIP_VOICE, mimeType: 'audio/webm' }],
    storyEffects: {
      v: 3,
      scenes: [
        {
          id: 's1',
          thumbHash: STORY_SCENE_THUMB_HASH,
          timelineDuration: 8,
          objects: [
            fitBackground('m-scene-pano'),
            {
              id: 't1',
              kind: 'text',
              anchor: { t: 'free', x: 0.5, y: 0.92 },
              plane: 'fg',
              z: 1,
              transform: identity,
              locale: 'es',
              payload: { text: 'La hora dorada, sobre las bandas', translations: { en: 'Golden hour, on the bands' }, textColor: '#FFFFFF', fontSize: 64 },
            },
            {
              id: 'a1',
              kind: 'audio',
              anchor: { t: 'free', x: 0.5, y: 0.5 },
              plane: 'bg',
              z: 0,
              transform: identity,
              payload: { isBackground: true, postMediaId: 'm-scene-track', volume: 0.8, loop: true },
            },
          ],
        },
      ],
    },
  },
  {
    id: 'st-scene-image-text',
    type: 'STORY',
    createdAt: hoursAgo(12),
    expiresAt: hoursFromNow(8),
    viewCount: 2,
    isViewedByMe: true,
    author: sceneStoryAuthor,
    originalLanguage: 'es',
    media: [scenePano('m-scene-pano-2')],
    storyEffects: {
      v: 3,
      scenes: [
        {
          id: 's1',
          thumbHash: STORY_SCENE_THUMB_HASH,
          timelineDuration: 3,
          objects: [
            fitBackground('m-scene-pano-2'),
            {
              id: 't1',
              kind: 'text',
              anchor: { t: 'free', x: 0.5, y: 0.5 },
              plane: 'fg',
              z: 1,
              transform: identity,
              locale: 'es',
              payload: { text: 'Dentro de la imagen', translations: { en: 'Inside the picture' }, textColor: '#FFFFFF', fontSize: 48 },
            },
          ],
        },
      ],
    },
  },
  {
    id: 'st-scene-image',
    type: 'STORY',
    createdAt: hoursAgo(11),
    expiresAt: hoursFromNow(9),
    viewCount: 2,
    isViewedByMe: true,
    author: sceneStoryAuthor,
    media: [scenePano('m-scene-pano-3')],
    storyEffects: { v: 3, scenes: [{ id: 's1', thumbHash: STORY_SCENE_THUMB_HASH, objects: [fitBackground('m-scene-pano-3')] }] },
  },
  /**
   * LE SON EMPRUNTÉ À LA BIBLIOTHÈQUE (#7015) — la forme EXACTE de la
   * production, relevée en base le 2026-09-18 : l'objet audio de fond ne
   * porte AUCUN `postMediaId` (le son n'appartient pas à l'auteur) mais un
   * `mediaURL` vers `GET /api/v1/static/:filename`, la route AUTHENTIFIÉE qui
   * sert `/app/sounds` — 20 publications de production citent cette forme, 9
   * fichiers distincts.
   *
   * C'est la seule story du corpus dont le son ne peut PAS être obtenu par
   * une balise `<audio src>` : la route exige un en-tête que le navigateur
   * n'envoie jamais sur un chargement de média. `check-story-sound.mjs` la
   * conduit dans un vrai navigateur.
   *
   * Hors de `STORY_TRAY` comme ses trois voisines — elle n'ajoute aucune
   * tuile au rail, dont la géographie est gardée ailleurs.
   */
  {
    id: 'st-scene-sound',
    type: 'STORY',
    createdAt: hoursAgo(14),
    expiresAt: hoursFromNow(6),
    viewCount: 1,
    isViewedByMe: true,
    author: sceneStoryAuthor,
    originalLanguage: 'es',
    media: [scenePano('m-scene-pano-4')],
    storyEffects: {
      v: 3,
      scenes: [
        {
          id: 's1',
          thumbHash: STORY_SCENE_THUMB_HASH,
          timelineDuration: 8,
          objects: [
            fitBackground('m-scene-pano-4'),
            {
              id: 'a1',
              kind: 'audio',
              anchor: { t: 'free', x: 0.5, y: 0.5 },
              plane: 'bg',
              z: 0,
              transform: identity,
              payload: {
                isBackground: true,
                mediaURL: '/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a',
                volume: 0.8,
                loop: true,
              },
            },
          ],
        },
      ],
    },
  },
];

/**
 * **LE CORPUS COMPLET EN FIXTURES** (#5817) — MÊMES identifiants ET MÊMES
 * horodatages que `STORY_TRAY` (une tuile du rail pose l'id d'entrée que son
 * groupe porte, `group.entryStoryId`, dans le lien vers `/story/$post` : le lecteur
 * doit trouver CE post dans CE corpus, ACTIF, pas déjà expiré), servi par le
 * MÊME chemin que la passerelle (`loadStoryFeed`), jamais par une branche de
 * l'écran.
 *
 * Écrit pour EXERCER, pas pour faire joli : une story TEXTE avec une
 * traduction (Prisme, rang ≠ 1 — `st-amie-1`, anglais → français), une story
 * IMAGE avec sa LÉGENDE (`st-amie-2` — la légende descend sous la scène,
 * elle ne se redit pas dessus), et la story du lecteur lui-même
 * (`st-mienne`, jamais sautée même vue).
 */
export const STORY_FEED: readonly StoryFeedPost[] = [
  {
    id: 'st-vue-recente',
    type: 'STORY',
    createdAt: hoursAgo(2),
    expiresAt: hoursFromNow(18),
    viewCount: 12,
    isViewedByMe: true,
    author: { id: 'u-camille', username: 'camille', displayName: 'Camille Roy', avatar: portraitStandIn('#34d399', '#065f46') },
    content: 'Bonjour à tous, belle journée !',
    originalLanguage: 'fr',
  },
  {
    id: 'st-amie-1',
    type: 'STORY',
    createdAt: hoursAgo(5),
    expiresAt: hoursFromNow(15),
    viewCount: 3,
    isViewedByMe: false,
    author: { id: 'u-ines', username: 'ines', firstName: 'Inès', lastName: 'Baraka' },
    content: 'Hello from the park!',
    originalLanguage: 'en',
    translations: { fr: { text: 'Bonjour depuis le parc !' } },
  },
  {
    id: 'st-amie-2',
    type: 'STORY',
    createdAt: hoursAgo(3),
    expiresAt: hoursFromNow(17),
    viewCount: 5,
    isViewedByMe: false,
    author: { id: 'u-ines', username: 'ines', firstName: 'Inès', lastName: 'Baraka' },
    content: 'Le lac, ce matin.',
    originalLanguage: 'fr',
    media: [{ id: 'm3', url: STORY_PHOTO_STAND_IN, thumbnailUrl: STORY_PHOTO_STAND_IN, mimeType: 'image/svg+xml' }],
    /* LE RAIL D'ACTIONS lit ces trois-là depuis le corpus, sans aucune
       requête (`lib/stories/action-rail.ts`) : sans eux, le bouton
       « Commentaires » n'existerait sur AUCUNE story de fixtures et sa porte
       (`commentCount > 0`) serait VERTE PAR OMISSION. */
    commentCount: 3,
    reactionCount: 12,
    currentUserReactions: [],
  },
  {
    id: 'st-mienne',
    type: 'STORY',
    createdAt: hoursAgo(8),
    expiresAt: hoursFromNow(12),
    viewCount: 8,
    isViewedByMe: true,
    author: { id: VIEWER_ID, username: 'vous', displayName: 'Moi' },
    content: 'Ma story à moi.',
    originalLanguage: 'fr',
    /* MA story porte le plan RÉDUIT : ni réagir, ni répondre, ni republier —
       mais bien ses commentaires, pour que la capture montre une RÉDUCTION et
       non un rail vide (`resolveStoryActionRailPlan`). */
    commentCount: 2,
    reactionCount: 4,
  },
  /** LA STORY VIDÉO (#6807) — `url` porte un clip VP8 réellement décodable
   * (`REEL_CLIP_RGB`), jamais une image servie sous un `mimeType` vidéo : le
   * lecteur peindrait « Média indisponible » sur la seule story censée
   * prouver qu'une vidéo se joue. Voir la tuile jumelle dans `STORY_TRAY`
   * pour le choix de la date et de l'auteur. */
  {
    id: 'st-video',
    type: 'STORY',
    createdAt: hoursAgo(9),
    expiresAt: hoursFromNow(11),
    viewCount: 21,
    isViewedByMe: true,
    author: { id: 'u-tarek', username: 'tarek', firstName: 'Tarek', lastName: 'Amrani' },
    content: 'Le marché, en mouvement.',
    originalLanguage: 'fr',
    media: [{ id: 'm5', url: REEL_CLIP_RGB, thumbnailUrl: STORY_PHOTO_STAND_IN, mimeType: 'video/webm' }],
  },
  /** LA STORY VIDÉO LONGUE (#6836) — 9 s, le SEUL vecteur du corpus sur lequel
   * `slideDurationMs` et `DEFAULT_SLIDE_DURATION_MS` donnent des réponses
   * DIFFÉRENTES (9 s contre 6 s). Voir la tuile jumelle dans `STORY_TRAY` pour
   * le choix de la date et de l'auteur. */
  {
    id: 'st-video-long',
    type: 'STORY',
    createdAt: hoursAgo(10),
    expiresAt: hoursFromNow(10),
    viewCount: 14,
    isViewedByMe: true,
    author: { id: 'u-tarek', username: 'tarek', firstName: 'Tarek', lastName: 'Amrani' },
    content: 'La répétition, en entier.',
    originalLanguage: 'fr',
    media: [{ id: 'm6', url: STORY_CLIP_LONG, thumbnailUrl: STORY_PHOTO_STAND_IN, mimeType: 'video/webm' }],
  },
  ...SCENE_STORIES,
];

/**
 * **LE CORPUS DES HUMEURS EN FIXTURES** (#5652) — même règle que `STORY_TRAY` :
 * servi par le MÊME chemin que la passerelle (`loadStatusMoods`), jamais par
 * une branche de l'écran. Inès porte une humeur active ET une story : sa
 * pastille du rail exerce donc les DEUX signaux à la fois (anneau + badge),
 * exactement le cas qu'iOS nomme dans `StoriesVivantsRail.swift`.
 */
export const STATUS_MOODS: readonly StatusMoodPost[] = [
  {
    id: 'st-humeur-ines',
    authorId: 'u-ines',
    moodEmoji: '🎉',
    author: { id: 'u-ines', username: 'ines', firstName: 'Inès', lastName: 'Baraka' },
  },
];
