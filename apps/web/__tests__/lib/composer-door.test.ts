/**
 * W1 — le contrat partagé arrive au web.
 *
 * Ce que cette suite verrouille : le web n'a **pas** de table des portes. Il en
 * lit une, celle de `@meeshy/shared/utils/composer-contract`. Les attentes
 * ci-dessous sont donc écrites deux fois de deux manières indépendantes :
 *
 *  1. **en clair**, cas par cas — la loi produit reste lisible ici ;
 *  2. **par ÉQUIVALENCE** avec `composerOpening` du contrat partagé, pour les
 *     neuf portes et trois compositions — c'est le verrou anti-fork : le jour
 *     où le web recopierait la table au lieu de l'appeler, la divergence
 *     rougirait ici avant d'atteindre un écran.
 *
 * Le miroir Swift du contrat est nommé dans `composer-contract.ts` lui-même
 * (« toute évolution touche les deux sites »). Cette suite ne l'exécute pas et
 * n'affirme rien sur son état.
 */
import {
  webComposerOpening,
  webUpdatePayload,
  postTypeOf,
  composerFormatOf,
  WEB_UNWRITABLE_POST_FIELDS,
} from '@/lib/composer-door';
import {
  COMPOSER_DOORS,
  COMPOSER_FORMATS,
  composerOpening,
  type ComposerDoor,
} from '@meeshy/shared/utils/composer-contract';
import { qualifiesAsReel, type ReelMediaLike } from '@meeshy/shared/utils/reel-composition';
import type { PostMedia, PostType } from '@meeshy/shared/types/post';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

const NOTHING: ReadonlyArray<ReelMediaLike> = [];
const ONE_IMAGE: ReadonlyArray<ReelMediaLike> = [{ mimeType: 'image/jpeg' }];
const TWO_IMAGES: ReadonlyArray<ReelMediaLike> = [{ mimeType: 'image/jpeg' }, { mimeType: 'image/png' }];
const SHORT_VIDEO: ReadonlyArray<ReelMediaLike> = [{ mimeType: 'video/mp4', duration: 2000 }];
const LONG_VIDEO: ReadonlyArray<ReelMediaLike> = [{ mimeType: 'video/mp4', duration: 4000 }];

const EVERY_DOOR: ReadonlyArray<ComposerDoor> = [
  { kind: 'storyTray' },
  { kind: 'feedComposer' },
  { kind: 'reelTab' },
  { kind: 'moodChip' },
  { kind: 'repost', sourceFormat: 'story' },
  { kind: 'edit', documentFormat: 'post' },
  { kind: 'draft' },
  { kind: 'share' },
  { kind: 'conversationMedia' },
];

/**
 * Les formats sont LUS du contrat partagé, jamais réécrits ici : une liste
 * locale reste verte le jour où un cinquième format entre dans l'union, en
 * n'ayant simplement jamais parcouru le nouveau membre.
 */
const EVERY_FORMAT = COMPOSER_FORMATS;
const EVERY_POST_TYPE: ReadonlyArray<PostType> = ['POST', 'REEL', 'STORY', 'STATUS'];

describe('webComposerOpening — la table des portes, lue et non réécrite', () => {
  it('couvre les NEUF portes du contrat, sans en inventer une dixième', () => {
    expect(new Set(EVERY_DOOR.map((door) => door.kind))).toEqual(new Set(COMPOSER_DOORS));
  });

  it('le composer du fil ouvre sur un POST et offre [post, story]', () => {
    expect(webComposerOpening({ kind: 'feedComposer' }, NOTHING)).toEqual({
      initialFormat: 'post',
      offeredFormats: ['post', 'story'],
    });
  });

  it('le composer du fil gagne le RÉEL dès que la composition qualifie', () => {
    expect(webComposerOpening({ kind: 'feedComposer' }, TWO_IMAGES).offeredFormats).toEqual([
      'post',
      'story',
      'reel',
    ]);
  });

  it('le tray ouvre sur une STORY et offre [story, post], + réel si la composition qualifie', () => {
    expect(webComposerOpening({ kind: 'storyTray' }, NOTHING).initialFormat).toBe('story');
    expect(webComposerOpening({ kind: 'storyTray' }, NOTHING).offeredFormats).toEqual(['story', 'post']);
    expect(webComposerOpening({ kind: 'storyTray' }, LONG_VIDEO).offeredFormats).toEqual([
      'story',
      'post',
      'reel',
    ]);
  });

  it('l\'onglet réels garde TOUJOURS son format — le gate ajoute, il ne retire jamais', () => {
    expect(webComposerOpening({ kind: 'reelTab' }, NOTHING)).toEqual({
      initialFormat: 'reel',
      offeredFormats: ['reel', 'post'],
    });
  });

  it('le mood n\'offre aucun choix — un status ne devient rien d\'autre', () => {
    expect(webComposerOpening({ kind: 'moodChip' }, TWO_IMAGES)).toEqual({
      initialFormat: 'status',
      offeredFormats: ['status'],
    });
  });

  it('un repost MIROITE sa source et offre le POST comme ancrage', () => {
    expect(webComposerOpening({ kind: 'repost', sourceFormat: 'reel' }, NOTHING).offeredFormats).toEqual([
      'reel',
      'post',
    ]);
    expect(webComposerOpening({ kind: 'repost', sourceFormat: 'story' }, NOTHING).offeredFormats).toEqual([
      'story',
      'post',
    ]);
    expect(webComposerOpening({ kind: 'repost', sourceFormat: 'status' }, NOTHING).offeredFormats).toEqual([
      'status',
      'post',
    ]);
  });

  it('reposter un POST ne l\'offre pas deux fois — il est déjà son propre ancrage', () => {
    expect(webComposerOpening({ kind: 'repost', sourceFormat: 'post' }, NOTHING).offeredFormats).toEqual([
      'post',
    ]);
  });

  it('éditer un RÉEL offre le repli vers POST même quand la composition ne qualifie plus', () => {
    expect(webComposerOpening({ kind: 'edit', documentFormat: 'reel' }, NOTHING).offeredFormats).toEqual([
      'reel',
      'post',
    ]);
  });

  it('éditer un POST n\'offre le RÉEL que si la composition restante qualifie', () => {
    expect(webComposerOpening({ kind: 'edit', documentFormat: 'post' }, ONE_IMAGE).offeredFormats).toEqual([
      'post',
    ]);
    expect(webComposerOpening({ kind: 'edit', documentFormat: 'post' }, TWO_IMAGES).offeredFormats).toEqual([
      'post',
      'reel',
    ]);
  });

  it('éditer une STORY ou un STATUS n\'offre AUCUN choix — le serveur n\'accepte que POST↔REEL', () => {
    expect(webComposerOpening({ kind: 'edit', documentFormat: 'story' }, TWO_IMAGES).offeredFormats).toEqual([
      'story',
    ]);
    expect(webComposerOpening({ kind: 'edit', documentFormat: 'status' }, TWO_IMAGES).offeredFormats).toEqual([
      'status',
    ]);
  });

  it('INVARIANT — l\'éventail contient toujours le format initial, pour les neuf portes', () => {
    for (const door of EVERY_DOOR) {
      for (const composition of [NOTHING, ONE_IMAGE, TWO_IMAGES]) {
        const opening = webComposerOpening(door, composition);
        expect(opening.offeredFormats).toContain(opening.initialFormat);
      }
    }
  });

  it('ÉQUIVALENCE — le web rend EXACTEMENT ce que rend le contrat partagé, porte par porte', () => {
    for (const door of EVERY_DOOR) {
      for (const composition of [NOTHING, ONE_IMAGE, TWO_IMAGES, SHORT_VIDEO, LONG_VIDEO]) {
        expect(webComposerOpening(door, composition)).toEqual(
          composerOpening(door, { compositionQualifiesAsReel: qualifiesAsReel(composition) }),
        );
      }
    }
  });
});

describe('webComposerOpening — c\'est la COMPOSITION qui décide, jamais un drapeau passé à la main', () => {
  it('une image seule ne qualifie pas, deux images qualifient', () => {
    expect(webComposerOpening({ kind: 'feedComposer' }, ONE_IMAGE).offeredFormats).not.toContain('reel');
    expect(webComposerOpening({ kind: 'feedComposer' }, TWO_IMAGES).offeredFormats).toContain('reel');
  });

  it('une vidéo de moins de 3 s ne qualifie pas, une vidéo plus longue qualifie', () => {
    expect(webComposerOpening({ kind: 'feedComposer' }, SHORT_VIDEO).offeredFormats).not.toContain('reel');
    expect(webComposerOpening({ kind: 'feedComposer' }, LONG_VIDEO).offeredFormats).toContain('reel');
  });

  it('une durée INCONNUE ne qualifie pas — la forme `PostMedia` porte `duration: number | null`', () => {
    const attachedToAPost: ReadonlyArray<PostMedia> = [
      { id: 'm1', mimeType: 'video/mp4', fileUrl: 'https://x/1.mp4', duration: null, order: 0 },
    ];
    expect(webComposerOpening({ kind: 'edit', documentFormat: 'post' }, attachedToAPost).offeredFormats).toEqual([
      'post',
    ]);
  });

  it('accepte la composition d\'un post DÉJÀ publié (`PostMedia`) sans normalisation', () => {
    const attachedToAPost: ReadonlyArray<PostMedia> = [
      { id: 'm1', mimeType: 'video/mp4', fileUrl: 'https://x/1.mp4', duration: 5000, order: 0 },
    ];
    expect(webComposerOpening({ kind: 'edit', documentFormat: 'post' }, attachedToAPost).offeredFormats).toEqual([
      'post',
      'reel',
    ]);
  });

  it('accepte la composition d\'un brouillon en cours (`UploadedAttachmentResponse`) sans normalisation', () => {
    const justUploaded: ReadonlyArray<UploadedAttachmentResponse> = [
      {
        id: 'a1',
        messageId: '',
        fileName: 'clip.mp4',
        originalName: 'clip.mp4',
        mimeType: 'video/mp4',
        fileSize: 10,
        fileUrl: 'https://x/clip.mp4',
        duration: 5000,
        uploadedBy: 'u1',
        isAnonymous: false,
        createdAt: '2026-08-24T00:00:00.000Z',
      },
    ];
    expect(webComposerOpening({ kind: 'feedComposer' }, justUploaded).offeredFormats).toContain('reel');
  });
});

describe('la frontière ComposerFormat ↔ PostType — une seule traduction pour tout le web', () => {
  it('les quatre formats deviennent les quatre types du fil', () => {
    expect(postTypeOf('post')).toBe('POST');
    expect(postTypeOf('reel')).toBe('REEL');
    expect(postTypeOf('story')).toBe('STORY');
    expect(postTypeOf('status')).toBe('STATUS');
  });

  it('les quatre types du fil redeviennent les quatre formats', () => {
    expect(composerFormatOf('POST')).toBe('post');
    expect(composerFormatOf('REEL')).toBe('reel');
    expect(composerFormatOf('STORY')).toBe('story');
    expect(composerFormatOf('STATUS')).toBe('status');
  });

  it('l\'aller-retour est l\'identité dans les DEUX sens, sur les quatre membres', () => {
    for (const format of EVERY_FORMAT) {
      expect(composerFormatOf(postTypeOf(format))).toBe(format);
    }
    for (const type of EVERY_POST_TYPE) {
      expect(postTypeOf(composerFormatOf(type))).toBe(type);
    }
  });

  it('la traduction est TOTALE — aucun format du contrat ne rend `undefined`', () => {
    expect(EVERY_FORMAT.length).toBeGreaterThan(0);
    for (const format of EVERY_FORMAT) {
      expect(postTypeOf(format)).toBeDefined();
      expect(EVERY_POST_TYPE).toContain(postTypeOf(format));
    }
  });

  it('la traduction est INJECTIVE — deux formats ne partagent jamais un type du fil', () => {
    expect(new Set(EVERY_FORMAT.map(postTypeOf)).size).toBe(EVERY_FORMAT.length);
  });
});

describe('webUpdatePayload — le web n\'écrit que ce que son formulaire sait rendre', () => {
  it('la liste des champs que le web ne réécrit JAMAIS est exactement ces deux-là (sanity du garde)', () => {
    expect([...WEB_UNWRITABLE_POST_FIELDS]).toEqual(['mentions', 'storyEffects']);
  });

  it('un champ INCHANGÉ (undefined) est absent du PUT — le schéma lit l\'absence comme « inchangé »', () => {
    const payload = webUpdatePayload(['content', 'visibility'], {
      content: undefined,
      visibility: 'FRIENDS',
    });
    expect(payload).toEqual({ visibility: 'FRIENDS' });
    expect('content' in payload).toBe(false);
  });

  it('un champ non déclaré connu est absent, même s\'il porte une valeur', () => {
    const payload = webUpdatePayload(['visibility'], { content: 'réécrit', visibility: 'FRIENDS' });
    expect('content' in payload).toBe(false);
  });

  it('`mentions` n\'est JAMAIS écrit — même déclaré connu, même VIDE : `[]` détruirait les références déclarées', () => {
    const payload = webUpdatePayload(['content', 'mentions'], { content: 'salut', mentions: [] });
    expect(payload).toEqual({ content: 'salut' });
    expect('mentions' in payload).toBe(false);
  });

  it('`mentions` n\'est JAMAIS écrit — même PEUPLÉ : ce n\'est pas le vide qu\'on filtre, c\'est le champ', () => {
    const payload = webUpdatePayload(['mentions'], { mentions: [{ handle: 'ada' }] });
    expect('mentions' in payload).toBe(false);
  });

  it('`storyEffects` n\'est JAMAIS écrit — le formulaire web n\'a jamais peint ce canevas', () => {
    const payload = webUpdatePayload(['storyEffects'], { storyEffects: { scenes: [] } });
    expect('storyEffects' in payload).toBe(false);
  });

  it('les AUTRES listes passent — le filtre vise deux champs nommés, pas « les tableaux »', () => {
    const payload = webUpdatePayload(['removeMediaIds', 'mediaIds'], {
      removeMediaIds: ['m1'],
      mediaIds: ['m2', 'm3'],
    });
    expect(payload).toEqual({ removeMediaIds: ['m1'], mediaIds: ['m2', 'm3'] });
  });
});

/**
 * `visibilityUserIds` sans sa `visibility` — le couple incomplet, refusé ICI.
 *
 * Le gateway ne rattrape pas ce cas : le `.refine` d'`UpdatePostSchema`
 * (`services/gateway/src/routes/posts/types.ts`) ne se déclenche QUE si
 * `visibility` est présent dans la charge — il ne consulte jamais la visibilité
 * STOCKÉE — et `PostService.updatePost` écrit `visibilityUserIds` dès que la clé
 * n'est pas `undefined`, `[]` compris. Un PUT `{ visibilityUserIds: [] }` sur un
 * post stocké `ONLY` remplace donc sa liste blanche par le vide, en 200 OK : le
 * post devient invisible pour tout le monde, sans erreur ni journal.
 *
 * D'où la règle, structurelle et non conditionnelle à une valeur : la liste
 * n'est écrite QUE si l'audience qu'elle qualifie voyage avec elle. Un
 * formulaire qui veut modifier la seule liste déclare donc AUSSI la visibilité
 * — il ré-affirme le couple qu'il a rendu, et le `.refine` du serveur retrouve
 * de quoi rejeter un `ONLY` sans destinataire (400) au lieu de l'écrire.
 */
describe('webUpdatePayload — la liste d\'audience ne voyage jamais sans son audience', () => {
  it('`visibilityUserIds` VIDE sans `visibility` est OMIS — sinon le serveur écrase la liste blanche stockée', () => {
    const payload = webUpdatePayload(['content', 'visibilityUserIds'], {
      content: 'coquille corrigée',
      visibilityUserIds: [],
    });
    expect(payload).toEqual({ content: 'coquille corrigée' });
    expect('visibilityUserIds' in payload).toBe(false);
  });

  it('`visibilityUserIds` PEUPLÉ sans `visibility` est OMIS AUSSI — c\'est le couple qu\'on refuse, pas le vide', () => {
    const payload = webUpdatePayload(['visibilityUserIds'], { visibilityUserIds: ['u1'] });
    expect('visibilityUserIds' in payload).toBe(false);
  });

  it('`visibility` déclarée connue mais INCHANGÉE (undefined) n\'ouvre pas la porte à la liste', () => {
    const payload = webUpdatePayload(['visibility', 'visibilityUserIds'], {
      visibility: undefined,
      visibilityUserIds: ['u1'],
    });
    expect(payload).toEqual({});
  });

  it('le couple COMPLET passe intact — la règle n\'interdit pas d\'écrire une audience, elle interdit de la déclarer à moitié', () => {
    const payload = webUpdatePayload(['visibility', 'visibilityUserIds'], {
      visibility: 'ONLY',
      visibilityUserIds: ['u1', 'u2'],
    });
    expect(payload).toEqual({ visibility: 'ONLY', visibilityUserIds: ['u1', 'u2'] });
  });

  it('une visibilité SANS liste reste écrivable — le serveur tranche alors lui-même (400 sur ONLY/EXCEPT sans destinataire)', () => {
    const payload = webUpdatePayload(['visibility'], { visibility: 'PUBLIC' });
    expect(payload).toEqual({ visibility: 'PUBLIC' });
  });

  it('hors de ces deux champs, le web délègue mot pour mot au contrat partagé', () => {
    const draft = { content: 'salut', visibility: 'FRIENDS', moodEmoji: undefined };
    expect(webUpdatePayload(['content', 'visibility', 'moodEmoji'], draft)).toEqual({
      content: 'salut',
      visibility: 'FRIENDS',
    });
  });

  it('un composer qui ne déclare RIEN connu n\'écrit rien', () => {
    expect(webUpdatePayload([], { content: 'salut' })).toEqual({});
  });
});
