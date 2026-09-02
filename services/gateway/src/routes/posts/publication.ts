/**
 * Le CORPS de la publication — un seul, pour toutes les portes (#4151).
 *
 * ## Ce que ce fichier ferme
 *
 * Publier crée toujours la même ligne `Post`, et le module offrait trois portes
 * qui l'écrivent : `POST /posts`, `POST /posts/from-attachment` et
 * `POST /posts/:postId/repost`. Les deux premières portaient ~200 lignes
 * RECOPIÉES — déclenchement du Prisme, `resolvePostMentions`, relecture des
 * références, les trois branches de diffusion, la composition du corps servi.
 *
 * Le coût n'était pas théorique : **la copie avait déjà dérivé**, et dans le
 * sens qu'on ne voit pas depuis la route qui marche.
 * `POST /posts/from-attachment` :
 *
 *  - n'indexait **aucun hashtag** — un `#voyage` posé en légende d'une photo
 *    partagée depuis une conversation n'entrait dans aucune recherche ;
 *  - n'ouvrait **aucun éventail d'amis** — `friend_new_post` /
 *    `friend_new_story` ne partaient jamais : publier depuis un partage était
 *    silencieux pour tout le monde sauf les mentionnés ;
 *  - servait **200 + `message: 'Published'`** là où la création rend **201** et
 *    aucun message.
 *
 * Aucune de ces trois divergences ne se lit en relisant la copie : elles se
 * lisent en la COMPARANT. C'est la raison d'être du noyau — une règle ajoutée
 * ici part par toutes les portes, et un témoin posé sur l'une d'elles tombe
 * pour toutes.
 *
 * ## Ce que ce fichier NE fait pas
 *
 * Il ne décide pas **quelle ligne écrire** : c'est le propre de chaque porte
 * (`postService.createPost` pour deux d'entre elles, `postService.repostPost`
 * pour la troisième, qui prend en plus un instantané d'un original éphémère).
 * Il prend la ligne ÉCRITE et fait tout ce qui la suit. La frontière est là, et
 * pas ailleurs, parce que c'est exactement ce qui était recopié.
 *
 * Les effets PROPRES au repost (`post:reposted`, notification à l'auteur
 * original) restent chez lui : ils suivent le champ `repostOfId`, pas le corps
 * de la publication.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Post } from '@meeshy/shared/types/post';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostTranslationService } from '../../services/posts/PostTranslationService';
import { postSignalText } from '../../services/posts/storyContentComposition';
import { resolvePostMentions } from '../../services/posts/postMentions';
import type {
  DeclaredPostMention,
  PostMentionPrisma,
  PostMentionResolver,
  PostMentionType,
  ResolvedPostMentions,
} from '../../services/posts/postMentions';
import {
  withMentions,
  graftReferences,
  readPostReferences,
  projectReferencesForViewer,
  type PostReference,
  type PostReferenceReaderPrisma,
} from '../../services/posts/postReferences';
import type { ExtractedHashtag } from '../../services/HashtagService';
import { hoistLocationDeep } from '../../services/location/sharedPlace';
import { WIRE_BROADCAST, wireReaderFromRequest } from '../../services/posts/storyEffectsV3';

/**
 * La ligne écrite, telle que le noyau a besoin de la LIRE.
 *
 * Une vue NOMMÉE plutôt qu'un `any` : les champs que la publication consulte
 * sont peu nombreux et connus, et les nommer est ce qui rend visible l'oubli
 * d'un `select`. L'intersection avec `Record<string, unknown>` garde la ligne
 * transportable telle quelle vers les composeurs de charge utile, qui la
 * REMETTENT au client sans rien en retirer.
 */
export type PublishedPostRow = Record<string, unknown> & {
  readonly id: string;
  readonly type?: string | null;
  readonly visibility?: string | null;
  readonly visibilityUserIds?: readonly string[] | null;
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  readonly storyEffects?: unknown;
  readonly createdAt?: Date | string | null;
  readonly expiresAt?: Date | string | null;
};

/** Les cinq types qu'une publication peut prendre — miroir de `Post.type`. */
export type PublishedPostType = PostMentionType;

/** La surface Prisma que le corps de la publication touche, et rien de plus. */
export type PublicationPrisma = PostMentionPrisma & PostReferenceReaderPrisma;

/**
 * Les deux méthodes de `HashtagService` que l'indexation appelle, en
 * structural pour que le double de test reste trivial. Le grain extrait
 * (`ExtractedHashtag`) est celui du service : le noyau le transporte sans
 * jamais le lire — redéclarer sa forme ici en ferait une seconde définition
 * qui dériverait au premier champ ajouté.
 */
export interface PostHashtagIndexer {
  extractHashtags(text: string): ExtractedHashtag[];
  createPostHashtags(postId: string, hashtags: ExtractedHashtag[]): Promise<unknown>;
}

/**
 * Hisse `metadata.trackingLinks` ([{ url, token }]) en top-level sur le payload
 * socket d'un post/story/status — miroir exact du hoist `trackingLinks` des
 * messages (`MessageHandler`). Le destinataire rend le lien (texte + façade
 * vidéo) vers `/l/<token>` sans réécrire l'URL. Les réponses REST exposent déjà
 * `metadata` ; ce hoist ne sert que les payloads temps réel. No-op si absent.
 */
export function hoistTrackingLinks<T extends Record<string, unknown>>(post: T): T {
  const metadata = post?.metadata as Record<string, unknown> | null | undefined;
  const tl = metadata?.trackingLinks;
  if (Array.isArray(tl) && tl.length > 0) {
    return { ...post, trackingLinks: tl } as T;
  }
  return post;
}

/**
 * Hisse `metadata.location` en top-level `location`, sur le post ET sur chaque
 * commentaire de son aperçu embarqué (`post.comments`) et le post SOURCE
 * (`repostOf`) — voir `hoistLocationDeep` (services/location/sharedPlace.ts).
 * Appliqué à la réponse REST comme au payload socket (contrairement à
 * `trackingLinks`, qui ne hisse que le payload socket). No-op si rien ne porte
 * de lieu.
 */
export const hoistLocation = hoistLocationDeep;

/**
 * Le jeu FINAL des références d'un post, à servir après une écriture.
 *
 * Trois états, et les distinguer est tout l'intérêt : la résolution n'a rien pu
 * établir (`undefined` — l'appelant garde ce que la relation portait, une
 * mention périmée valant mieux qu'une mention détruite), le post ne nomme plus
 * personne (`[]` sans ouvrir de requête — le cas de l'immense majorité des
 * publications), ou il en nomme, et la seule source de leur profil et de leur
 * mode est la base d'APRÈS l'écriture.
 */
export async function finalReferences(params: {
  readonly prisma: PostReferenceReaderPrisma;
  readonly postId: string;
  readonly resolved: ResolvedPostMentions;
  readonly onError: (error: unknown) => void;
}): Promise<PostReference[] | undefined> {
  const { prisma, postId, resolved, onError } = params;
  if (!resolved.reconciled) return undefined;
  if (resolved.mentionedUserIds.length === 0) return [];
  return readPostReferences({ prisma, postId, onError });
}

/**
 * Le corps SERVI à l'auteur — composition UNIQUE des trois portes.
 *
 * L'auteur voit tout, y compris les références silencieuses qu'il vient de
 * poser : sans elles il ne pourrait plus en retirer une. La négociation du blob
 * de scène suit son en-tête de version (`wireReaderFromRequest`), et le lieu est
 * hissé en racine — un client ne lit pas `metadata.location`.
 *
 * C'est la seule fonction qui compose une réponse de publication : trois
 * compositions parallèles, c'était trois corps SERVIS différents pour une même
 * ligne écrite, et c'est ce que le témoin de #4151 mesure sur le JSON.
 */
export function servePublishedPost(params: {
  readonly post: Record<string, unknown>;
  readonly references?: readonly PostReference[] | undefined;
  readonly request: FastifyRequest;
}): Record<string, unknown> {
  const { post, references, request } = params;
  return withMentions(
    graftReferences(hoistLocation(post), references),
    wireReaderFromRequest(request as UnifiedAuthRequest)
  );
}

/**
 * La charge utile d'AUDIENCE : neutre, sans les références silencieuses, et
 * blob de scène en forme de diffusion (`WIRE_BROADCAST` — une seule charge pour
 * une audience hétérogène, chaque client négocie sa forme au premier fetch).
 */
function broadcastPayload(params: {
  readonly post: Record<string, unknown>;
  readonly references: readonly PostReference[] | undefined;
  readonly authorId: string;
}): Post {
  const { post, references, authorId } = params;
  const audienceReferences = references && projectReferencesForViewer({
    references,
    authorId,
    viewerId: undefined,
  });
  return withMentions(
    graftReferences(hoistLocation(hoistTrackingLinks(post)), audienceReferences),
    WIRE_BROADCAST
  ) as unknown as Post;
}

/** Ce que la porte a écrit, et ce que l'appelant avait demandé. */
export interface PublicationEffectsParams {
  readonly fastify: FastifyInstance;
  readonly prisma: PublicationPrisma;
  readonly request: FastifyRequest;
  readonly mentionService: PostMentionResolver;
  readonly hashtagService: PostHashtagIndexer;
  /** La ligne ÉCRITE — source de vérité de tout ce qui la suit. */
  readonly post: PublishedPostRow;
  readonly authorId: string;
  /**
   * Le type DEMANDÉ, discriminant de la branche de diffusion et de la surface
   * ouverte au tap côté client. Distinct du type ÉCRIT (`post.type`), que le
   * service peut avoir dégradé (un REEL non qualifiant retombe en POST) : la
   * diffusion suit l'intention, l'éventail d'amis suit ce qui est en base.
   */
  readonly postType: PublishedPostType;
  /**
   * La légende SOUMISE — la source que le pipeline de traduction reçoit. Elle
   * n'est pas relue de la ligne : `post.content` peut porter autre chose
   * (instantané d'un repost, dérivation), et traduire autre chose que ce que
   * l'auteur a tapé servirait une traduction d'un texte qu'il n'a pas écrit.
   */
  readonly submittedContent: string | undefined;
  /**
   * Les effets de scène soumis. Le texte d'une story ne vit pas dans sa
   * légende : il vit dans les objets du canevas, et c'est là que la résolution
   * des mentions va chercher un `@handle` posé sur une slide.
   */
  readonly storyEffects?: unknown;
  /**
   * Les nommés que le TEXTE ne porte pas (badge sur le canevas, note sous le
   * contenu, métadonnée silencieuse). `undefined` quand la porte n'a pas de
   * canal `mentions` déclaré — seul le texte nomme alors.
   */
  readonly declaredMentions?: readonly DeclaredPostMention[];
  /** Préfixe de journal, pour que l'erreur nomme la porte qui l'a produite. */
  readonly porte: string;
}

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asVisibilityUserIds = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : undefined;

/**
 * Tout ce qu'une publication doit accomplir APRÈS que sa ligne est écrite —
 * et rien d'autre. Rend le corps à SERVIR à l'auteur.
 *
 * L'ordre n'est pas décoratif :
 *  1. la traduction part la première, en fire-and-forget (elle ne conditionne
 *     rien) ;
 *  2. les mentions sont RÉSOLUES avant la diffusion, seul instant où les
 *     références du post existent — diffuser avant enverrait la relation vide
 *     que `createPost` venait de charger ;
 *  3. le jeu final est RELU après l'écriture des lignes : servir la relation
 *     telle quelle rendrait `mentions: []` par construction, et `[]` se lit
 *     comme un verdict (« personne ne matche ») chez les trois clients ;
 *  4. la diffusion, puis l'indexation, puis l'éventail d'amis — qui EXCLUT les
 *     mentionnés : `user_mentioned` prime sur `friend_new_post`, sinon un ami
 *     nommé reçoit les deux.
 */
export async function runPublicationEffects(
  params: PublicationEffectsParams
): Promise<Record<string, unknown>> {
  const {
    fastify, prisma, request, mentionService, hashtagService,
    post, authorId, postType, submittedContent, storyEffects, declaredMentions, porte,
  } = params;

  const postId = post.id;

  // Le Prisme couvre TOUT le contenu, y compris la légende d'un média publié.
  //
  // G2 — seules les STORY sont EXCLUES : leur `content` est déjà traduit par le
  // pipeline audience-driven du service (`PostService.triggerStoryTextTranslation`) ;
  // déclencher AUSSI `translatePost` (5 langues fixes) doublerait les jobs ZMQ et
  // créerait des écritures concurrentes dans `Post.translations`.
  //
  // La condition testait `=== 'POST'`, ce qui laissait REEL et STATUS sans aucun
  // pipeline — ni ici, ni dans le service — alors que le feed de production est
  // fait presque uniquement de REEL portant du texte. On exclut désormais STORY
  // explicitement, pour qu'un futur type soit couvert par défaut plutôt
  // qu'oublié en silence.
  if (submittedContent && postType !== 'STORY') {
    try {
      PostTranslationService.shared.translatePost(
        postId,
        submittedContent,
        // La langue CANONIQUE persistée par l'écriture (SSOT) plutôt que la
        // revendication brute du client : elle incorpore déjà la normalisation
        // (ou le repli détecté) et correspond aux clés source de NLLB.
        asOptionalString(post.originalLanguage),
        authorId,
      ).catch((err) => fastify.log.warn({ err }, `[${porte}]: translate post failed`));
    } catch {
      // PostTranslationService not initialized — skip silently
    }
  }

  const postContent = asOptionalString(post.content);

  // **Le texte qui alimente les SIGNAUX, dérivé À LA DEMANDE** (#4502).
  //
  // `content` ne porte plus le texte de scène : la passerelle a cessé de l'y
  // recopier (directive porteur 2026-08-30). `postSignalText` rend la légende de
  // l'auteur si elle existe, sinon la concaténation des textes de scène. Jamais
  // les deux : concaténer referait le doublon qu'on vient de retirer.
  const postSignals = postSignalText({ content: postContent, storyEffects: post.storyEffects });

  const visibility = asOptionalString(post.visibility);
  const visibilityUserIds = asVisibilityUserIds(post.visibilityUserIds);

  // Point d'entrée UNIQUE partagé avec le chemin d'édition
  // (services/posts/postMentions.ts) — ne lève jamais.
  const createdMentions = await resolvePostMentions({
    prisma,
    mentionService,
    notificationService: fastify.notificationService,
    post: {
      id: postId,
      authorId,
      // Discriminant d'entité → surface ouverte au tap côté client.
      type: postType,
      // Audience du post — décide qui, parmi les nommés, a le droit d'être
      // prévenu. Un mentionné hors audience recevait l'extrait du contenu.
      visibility,
      visibilityUserIds,
    },
    content: postContent,
    storyEffects,
    declared: declaredMentions,
    onError: (err: unknown) => {
      fastify.log.error(`[${porte}] post mention reconcile failed: ${err}`);
    },
  });

  const references = await finalReferences({
    prisma,
    postId,
    resolved: createdMentions,
    onError: (err: unknown) => {
      fastify.log.error(`[${porte}] post reference reload failed: ${err}`);
    },
  });

  // Diffusion — APRÈS la résolution, seul instant où les références existent.
  // U1 : l'écho du cmid sur les TROIS branches, sans quoi une publication faite
  // hors-ligne ne peut jamais réconcilier son item optimiste avec la ligne
  // serveur.
  const socialEvents = fastify.socialEvents;
  if (socialEvents) {
    const audiencePost = broadcastPayload({ post, references, authorId });
    const cmid = request.clientMutationId;
    const broadcast = postType === 'STORY'
      ? socialEvents.broadcastStoryCreated(audiencePost, authorId, cmid)
      : postType === 'STATUS'
        ? socialEvents.broadcastStatusCreated(audiencePost, authorId, cmid)
        : socialEvents.broadcastPostCreated(audiencePost, authorId, cmid);
    broadcast.catch((err: unknown) => fastify.log.warn({ err }, `[${porte}]: broadcast created failed`));
  }

  // Un `#voyage` posé sur la SCÈNE reste indexé : sans la dérivation il
  // cesserait de l'être le jour où la recopie a été retirée, en silence.
  if (postSignals) {
    const hashtags = hashtagService.extractHashtags(postSignals);
    if (hashtags.length > 0) {
      hashtagService.createPostHashtags(postId, hashtags).catch((err: unknown) => {
        fastify.log.error(`[${porte}] hashtag persist failed: ${err}`);
      });
    }
  }

  // Éventail vers les amis : `user_mentioned` prime (dedup via excludeUserIds).
  // Le type vient de la ligne ÉCRITE — un REEL dégradé en POST par le service
  // doit s'annoncer pour ce qu'il est devenu.
  const notifService = fastify.notificationService;
  if (notifService) {
    notifService.createFriendContentNotificationsBatch({
      postId,
      authorId,
      contentType: (asOptionalString(post.type) ?? postType) as PublishedPostType,
      excerpt: postSignals?.slice(0, 100),
      postCreatedAt: (post.createdAt ?? undefined) as Date | undefined,
      postExpiresAt: (post.expiresAt ?? undefined) as Date | undefined,
      excludeUserIds: [...createdMentions.mentionedUserIds],
      visibility,
      visibilityUserIds,
    }).catch((err: unknown) => {
      fastify.log.error(`[${porte}] friend content notification fan-out failed: ${err}`);
    });
  }

  return servePublishedPost({ post, references, request });
}
