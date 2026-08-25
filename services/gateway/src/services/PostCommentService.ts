import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import { decodeCursor, encodeCursor } from '../routes/posts/types';
import type { MobileTranscription } from '../routes/posts/types';
import { authorSelect, commentMediaInclude, NOT_DELETED } from './posts/postIncludes';
import { TrackingLinkService } from './TrackingLinkService';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { parseSharedPlace } from './location/sharedPlace';
import { claimableMediaWhere, describeClaimShortfall } from './posts/mediaOwnership';
import { enhancedLogger } from '../utils/logger-enhanced';
import { getSharedNotificationService } from './notifications/notification-service-registry';
import type { RetractedNotificationAnnouncer } from './notifications/retractedNotifications';
import { retractCommentNotifications } from './posts/retractCommentNotifications';
import { reproduceEditedSubjectNotifications } from './posts/reproduceEditedSubjectNotifications';
import { assertReactionAllowed } from '../utils/reaction-limit-guard.js';
import { ConflictError } from '../errors/custom-errors';

const log = enhancedLogger.child({ module: 'PostCommentService' });

export class PostCommentService {
  private readonly trackingLinkService: TrackingLinkService;

  constructor(
    private readonly prisma: PrismaClient,
    // Source UNIQUE du mapping `metadata.trackingLinks` partagée avec
    // messages/posts/stories. Injectable pour les tests ; défaut = même prisma.
    trackingLinkService?: TrackingLinkService,
  ) {
    this.trackingLinkService = trackingLinkService ?? new TrackingLinkService(prisma);
  }

  async addComment(
    postId: string,
    authorId: string,
    content: string,
    parentId?: string,
    effectFlags?: number,
    originalLanguage?: string,
    /// PostMedia déjà uploadé (pending) à rattacher au commentaire via `commentId`.
    /// Un commentaire ne porte QU'UN SEUL média.
    mediaId?: string,
    /// Transcription Whisper mobile pour un média audio — persistée sur le PostMedia
    /// (évite la re-transcription serveur, même mécanisme que les posts).
    mobileTranscription?: MobileTranscription,
    /// Lieu partagé — champ dédié, jamais un `metadata` brut. Validé par
    /// `parseSharedPlace` ci-dessous avant écriture.
    location?: unknown,
  ) {
    // Verify post exists
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });
    if (!post) return null;

    // If parentId, verify parent exists
    if (parentId) {
      const parent = await this.prisma.postComment.findFirst({
        where: { id: parentId, postId, deletedAt: NOT_DELETED },
      });
      if (!parent) throw new Error('PARENT_NOT_FOUND');
    }

    // Verify the pending media belongs to no post/comment yet (anti-hijack) before linking.
    if (mediaId) {
      const media = await this.prisma.postMedia.findUnique({
        where: { id: mediaId },
        select: { id: true, postId: true, commentId: true },
      });
      if (!media || media.postId || media.commentId) {
        throw new Error('MEDIA_NOT_AVAILABLE');
      }
    }

    // Lieu partagé : validation stricte côté serveur (bornes, rejet
    // NaN/Infinity, bornage des chaînes). Chiffrement : stockage EN CLAIR
    // dans `metadata.location`, même décision assumée que pour message/post
    // (cf. services/location/sharedPlace.ts).
    const sharedPlace = parseSharedPlace(location);

    const comment = await this.prisma.postComment.create({
      data: {
        postId,
        authorId,
        content,
        parentId: parentId ?? null,
        effectFlags: effectFlags ?? 0,
        // Canonicalize the client claim at the write boundary (raw platform locale
        // `fr_FR`/`fr-FR` → `fr`); irreducible codes (`bas`) fall back verbatim.
        // Mirrors the message + post funnel so the stored source lines up with NLLB
        // + the Prisme resolver.
        originalLanguage:
          originalLanguage != null
            ? (normalizeLanguageCode(originalLanguage) ?? originalLanguage)
            : null,
        ...(sharedPlace ? { metadata: { location: sharedPlace } as unknown as Prisma.InputJsonValue } : {}),
      },
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        translations: true,
        likeCount: true,
        replyCount: true,
        effectFlags: true,
        parentId: true,
        createdAt: true,
        metadata: true,
        author: { select: authorSelect },
      },
    });

    // Lier le média pending au commentaire + persister la transcription mobile éventuelle.
    //
    // La pré-vérification anti-hijack plus haut couvre « le média est déjà
    // pris ». Elle ne couvre PAS deux choses : à qui il appartient, et le fait
    // qu'elle vérifie puis agit en deux temps — entre le `findUnique` et cet
    // écrit, un autre commentaire peut avoir réclamé le même média.
    //
    // Porter la condition dans le `where` de l'écriture règle les deux : la
    // base tranche en une opération. `updateMany` est obligatoire pour ça —
    // `update` n'accepte qu'un critère unique, pas une clause composée.
    if (mediaId) {
      const linked = await this.prisma.postMedia.updateMany({
        where: { id: mediaId, ...claimableMediaWhere(authorId) },
        data: {
          commentId: comment.id,
          ...(mobileTranscription
            ? {
                transcription: {
                  ...mobileTranscription,
                  segments: mobileTranscription.segments ?? [],
                  source: 'mobile',
                } as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
      const shortfall = describeClaimShortfall([mediaId], linked.count);
      if (shortfall) {
        // Le commentaire existe déjà et reste publié : refuser le média sans
        // trace donnerait un commentaire vide inexplicable.
        enhancedLogger.warn(`[PostCommentService] createComment: ${shortfall}`, {
          commentId: comment.id, authorId, mediaId,
        });
      }
    }

    // Increment counters
    await this.prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });

    if (parentId) {
      await this.prisma.postComment.update({
        where: { id: parentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    // Le média lié est renvoyé top-level (`media: [PostMedia]`) — même forme que les
    // posts, décodé identiquement par les clients (viewers inline + plein écran).
    const media = mediaId
      ? await this.prisma.postMedia.findMany({
          where: { commentId: comment.id },
          ...commentMediaInclude,
        })
      : [];

    // Tracking des URLs brutes du commentaire : même mécanisme que les messages
    // et les posts — mapping `url → token` rangé dans `metadata.trackingLinks`
    // SANS réécrire le contenu (aperçu vidéo + URL lisible préservés). Le client
    // rend le lien vers `/l/<token>`. JAMAIS bloquant : le helper avale ses
    // erreurs (→ []) et l'écriture metadata est gardée.
    if (content) {
      try {
        const trackingLinks = await this.trackingLinkService.collectContentTrackingLinks({
          content,
          createdBy: authorId,
        });
        if (trackingLinks.length > 0) {
          const existingMetadata = (comment.metadata as Record<string, unknown> | null) ?? {};
          const metadata = { ...existingMetadata, trackingLinks } as Prisma.InputJsonValue;
          await this.prisma.postComment.update({
            where: { id: comment.id },
            data: { metadata },
          });
          return { ...comment, metadata, media };
        }
      } catch {
        // non-bloquant : un échec de tracking ne doit pas casser le commentaire
      }
    }

    return { ...comment, media };
  }

  /**
   * Édition d'un commentaire par son AUTEUR : contenu et/ou effets visuels
   * (`effectFlags` — lueur/pulse/etc., même bitfield que les messages).
   * `isEdited` passe à true ; un contenu modifié PURGE `translations` (les
   * traductions décrivent l'ANCIEN texte — les garder les servirait
   * indéfiniment, et les gardes de cache empêcheraient toute régénération).
   * La re-traduction est déclenchée par la route (fire-and-forget, comme au
   * POST). Retourne le commentaire au même select que la création (+ media),
   * `null` si introuvable, jette `FORBIDDEN` pour un non-auteur.
   */
  async updateComment(
    commentId: string,
    userId: string,
    data: { content?: string; effectFlags?: number },
  ) {
    const existing = await this.prisma.postComment.findFirst({
      where: { id: commentId, deletedAt: NOT_DELETED },
      select: { id: true, postId: true, authorId: true, content: true },
    });
    if (!existing) return null;
    if (existing.authorId !== userId) throw new Error('FORBIDDEN');

    // Contenu blanc : accepté SEULEMENT pour un commentaire à média (retrait
    // de légende) — un commentaire texte ne s'édite pas vers du vide (le
    // retrait passe par DELETE).
    if (data.content !== undefined && data.content.trim() === '') {
      const mediaCount = await this.prisma.postMedia.count({ where: { commentId } });
      if (mediaCount === 0) throw new Error('EMPTY_CONTENT');
    }

    const contentChanged = data.content !== undefined && data.content !== existing.content;
    // isEdited ne se pose QUE sur un vrai changement de texte : un ajustement
    // d'effets visuels seul ne doit pas marquer le commentaire « modifié ».
    const updateData: Prisma.PostCommentUpdateInput = {};
    if (contentChanged) updateData.isEdited = true;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.effectFlags !== undefined) updateData.effectFlags = data.effectFlags;
    // Texte changé → les traductions ET la langue d'origine décrivaient
    // l'ANCIEN contenu. On purge les deux ; le pipeline de retraduction
    // redétecte la langue du nouveau texte (originalLanguage absent =
    // auto-détection, même contrat qu'une création sans claim client).
    if (contentChanged) {
      updateData.translations = {};
      updateData.originalLanguage = null;
    }

    const comment = await this.prisma.postComment.update({
      where: { id: commentId },
      data: updateData,
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        isEdited: true,
        translations: true,
        likeCount: true,
        replyCount: true,
        effectFlags: true,
        parentId: true,
        createdAt: true,
        metadata: true,
        author: { select: authorSelect },
      },
    });

    const media = await this.prisma.postMedia.findMany({
      where: { commentId },
      ...commentMediaInclude,
    });

    // Les notifications que le commentaire a produites portent une copie
    // DÉNORMALISÉE de son texte (corps de « X a commenté votre publication »,
    // extrait serti dans le sous-titre d'une réaction) qu'aucune lecture ne
    // rafraîchit. Sans cette réécriture, le destinataire garde le texte
    // d'AVANT, définitivement.
    //
    // Conditionné à `contentChanged`, et c'est la même borne que celle qui
    // décide `isEdited` : un ajustement d'effets visuels seul n'a rien changé
    // au texte, donc rien à reproduire — et l'annonce ferait retirer puis
    // ré-insérer la notification chez tous les destinataires pour rien.
    //
    // BEST-EFFORT : l'édition est déjà committée.
    if (contentChanged) {
      await reproduceEditedSubjectNotifications(
        this.prisma,
        { subject: { kind: 'comment', id: commentId }, content: comment.content },
        getSharedNotificationService()
      ).catch((err: unknown) => {
        log.warn('updateComment: notification reproduction failed', { commentId, err });
      });
    }

    return { ...comment, postId: existing.postId, contentChanged, media };
  }

  /// Relecture d'un commentaire au FORMAT de `updateComment` — pour le rejeu
  /// idempotent du PATCH (MutationLog) : une ligne Prisma brute n'a ni
  /// `author` ni `media`, et casserait le décodage côté client.
  async getCommentAsUpdateResult(commentId: string) {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, deletedAt: NOT_DELETED },
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        isEdited: true,
        translations: true,
        likeCount: true,
        replyCount: true,
        effectFlags: true,
        parentId: true,
        createdAt: true,
        metadata: true,
        postId: true,
        author: { select: authorSelect },
      },
    });
    if (!comment) return null;
    const media = await this.prisma.postMedia.findMany({
      where: { commentId },
      ...commentMediaInclude,
    });
    return { ...comment, contentChanged: false, media };
  }

  async getComments(postId: string, cursor?: string, limit: number = 20, currentUserId?: string) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Top-level comments only — replies (parentId set) are loaded lazily via
    // getReplies. The parentId filter lives in AND so the cursor's own OR can
    // be appended without clobbering it (a bare `where.OR = …` on pagination
    // dropped the parentId guard and leaked replies into page 2+).
    const where: any = {
      postId,
      deletedAt: NOT_DELETED,
      AND: [
        { OR: [{ parentId: null }, { parentId: { isSet: false } }] },
      ],
    };

    if (cursorData) {
      where.AND.push({
        OR: [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ],
      });
    }

    const comments = await this.prisma.postComment.findMany({
      where,
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        translations: true,
        likeCount: true,
        replyCount: true,
        reactionCount: true,
        effectFlags: true,
        parentId: true,
        createdAt: true,
        metadata: true,
        author: { select: authorSelect },
        media: commentMediaInclude,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    const commentIds = items.map((c) => c.id);
    const userReactions = currentUserId && commentIds.length > 0
      ? await this.prisma.commentReaction.findMany({
          where: { userId: currentUserId, commentId: { in: commentIds } },
          select: { commentId: true, emoji: true },
        })
      : [];
    const userReactionsMap = new Map<string, string[]>();
    userReactions.forEach((r) => {
      const list = userReactionsMap.get(r.commentId) ?? [];
      list.push(r.emoji);
      userReactionsMap.set(r.commentId, list);
    });
    const enriched = items.map((c) => ({ ...c, currentUserReactions: userReactionsMap.get(c.id) ?? [] }));

    return { items: enriched, nextCursor, hasMore };
  }

  async getReplies(commentId: string, cursor?: string, limit: number = 20, currentUserId?: string) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      parentId: commentId,
      deletedAt: NOT_DELETED,
    };

    // Replies are ordered ASCENDING (oldest → newest, threaded reading order),
    // so the cursor must select rows strictly AFTER the last item of the
    // previous page (`gt`). `nextCursor` is the last item's (createdAt, id) —
    // the largest so far under asc ordering — so `lt` would walk BACKWARD,
    // re-yielding already-shown replies and permanently dropping the rest.
    // (Sibling `getComments` orders DESC and correctly pairs that with `lt`.)
    if (cursorData) {
      where.OR = [
        { createdAt: { gt: new Date(cursorData.createdAt) } },
        { createdAt: new Date(cursorData.createdAt), id: { gt: cursorData.id } },
      ];
    }

    const replies = await this.prisma.postComment.findMany({
      where,
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        translations: true,
        likeCount: true,
        replyCount: true,
        reactionCount: true,
        effectFlags: true,
        parentId: true,
        createdAt: true,
        metadata: true,
        author: { select: authorSelect },
        media: commentMediaInclude,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = replies.length > limit;
    const items = hasMore ? replies.slice(0, limit) : replies;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    const replyIds = items.map((r) => r.id);
    const userReactions = currentUserId && replyIds.length > 0
      ? await this.prisma.commentReaction.findMany({
          where: { userId: currentUserId, commentId: { in: replyIds } },
          select: { commentId: true, emoji: true },
        })
      : [];
    const userReactionsMap = new Map<string, string[]>();
    userReactions.forEach((r) => {
      const list = userReactionsMap.get(r.commentId) ?? [];
      list.push(r.emoji);
      userReactionsMap.set(r.commentId, list);
    });
    const enriched = items.map((r) => ({ ...r, currentUserReactions: userReactionsMap.get(r.id) ?? [] }));

    return { items: enriched, nextCursor, hasMore };
  }

  async deleteComment(
    commentId: string,
    userId: string,
    // Défaut = le service partagé du processus, le seul câblé avec `io`. Même
    // résolution que `applyPostRemovalEffects` et `applyMessageRemovalEffects` :
    // la route n'a rien à câbler, et un appelant hors serveur (worker, script,
    // test) retire quand même les lignes, sans annonce. Le défaut est évalué à
    // CHAQUE appel — le service n'est enregistré qu'au démarrage du socket,
    // après la construction des routes.
    announcer: RetractedNotificationAnnouncer | undefined = getSharedNotificationService(),
  ) {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, deletedAt: NOT_DELETED },
    });
    if (!comment) return null;
    if (comment.authorId !== userId) throw new Error('FORBIDDEN');

    // Soft-delete the WHOLE reply subtree, not just the target comment.
    // `addComment` increments `post.commentCount` for EVERY comment — top-level
    // AND reply (l.102) — so `commentCount` counts the full non-deleted thread.
    // The relation is `onDelete: NoAction` (schema l.3102) and `PostComment`
    // allows arbitrary-depth chains (any live comment can be a `parentId`), so a
    // decrement of 1 would (a) leave surviving replies orphaned — `getComments`
    // filters `parentId: null` and their now-deleted parent is never rendered, so
    // `getReplies` is never called for them — and (b) permanently over-count
    // `commentCount` by the number of surviving descendants. Collect the subtree
    // breadth-first and remove it atomically-in-count.
    const descendantIds: string[] = [];
    let frontier = [commentId];
    while (frontier.length > 0) {
      const children = await this.prisma.postComment.findMany({
        where: { parentId: { in: frontier }, deletedAt: NOT_DELETED },
        select: { id: true },
      });
      if (children.length === 0) break;
      const childIds = children.map((c) => c.id);
      descendantIds.push(...childIds);
      frontier = childIds;
    }

    // La liste est calculée UNE fois et sert partout : soft-delete, décompte,
    // retrait des notifications, et — rendue à l'appelant — annonce Socket.IO.
    // Une seconde dérivation dériverait : après le soft-delete, la reconstruire
    // demanderait de relire des lignes que `NOT_DELETED` masque désormais.
    const deletedCommentIds = [commentId, ...descendantIds];

    const deletedAt = new Date();
    await this.prisma.postComment.updateMany({
      where: { id: { in: deletedCommentIds } },
      data: { deletedAt },
    });

    await this.prisma.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 + descendantIds.length } },
    });

    // Only the direct parent's `replyCount` moves: it counts direct children, and
    // exactly one direct child (this comment) disappears. Descendant reply counts
    // are irrelevant once their rows are soft-deleted.
    if (comment.parentId) {
      await this.prisma.postComment.update({
        where: { id: comment.parentId },
        data: { replyCount: { decrement: 1 } },
      });
    }

    // Les notifications que le fil retiré a produites. Le soft-delete ne
    // déclenche aucune cascade et le lien vit dans un blob JSON : sans ceci,
    // l'extrait du commentaire supprimé reste affiché — et non lu — dans
    // l'inbox de toute son audience, avec un `view_post` qui n'ouvre plus rien.
    // Sur la MÊME liste d'ids que le soft-delete, pas sur la seule cible.
    //
    // Best-effort DÉLIBÉRÉ, comme les quatre effets du retrait de post : quand
    // ceci s'exécute, `deletedAt` est déjà committé. Une inbox récalcitrante ne
    // doit pas transformer une suppression réussie en 500.
    try {
      await retractCommentNotifications(this.prisma, deletedCommentIds, announcer);
    } catch (err) {
      log.warn('comment removal: notification retraction failed', { commentId, err });
    }

    // `deletedCommentIds` remonte pour que la route ANNONCE le fil entier. Sans
    // elle, les descendants restaient affichés chez tout client qui les avait
    // dépliés, et aucun refetch ne les enlevait : `getComments` filtre
    // `parentId: null`, leur parent supprimé n'est plus rendu, donc `getReplies`
    // n'est plus jamais appelé pour eux.
    // `parentId` remonte pour la MÊME raison que `deletedCommentIds` : il est
    // la seule chose que le client ne peut pas redériver. Le décrément
    // ci-dessus ne touche que le parent DIRECT, et l'affordance « N réponses »
    // qui l'affiche ne se voit que fil REPLIÉ — donc précisément quand la
    // cible n'est PAS en cache et ne peut pas livrer son propre parent.
    // `postId` remonte pour ADRESSER l'annonce. C'est le post que le décrément
    // ci-dessus vient de toucher, et la route n'a aucun autre moyen de le
    // connaître : le `:postId` de son chemin est choisi par l'appelant, et sur
    // un repost simple il nomme la carte affichée là où le commentaire vit sur
    // la RACINE (`resolveInteractionTarget`). Une seule vérité, déjà en main.
    return {
      success: true as const,
      postId: comment.postId,
      deletedCommentIds,
      parentId: comment.parentId ?? null,
    };
  }

  async likeComment(commentId: string, userId: string, emoji: string = '❤️') {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, deletedAt: NOT_DELETED },
      select: { id: true },
    });
    if (!comment) return null;

    // Plafond des cinq réactions (2026-08-20) : règle déclarée UNE SEULE FOIS
    // dans `packages/shared/utils/reaction-limit.ts`. SECOND chemin de
    // création des réactions de commentaire (le premier est
    // `CommentReactionService.addReaction`, emprunté par le socket) — sans ce
    // garde ici aussi, ce fallback REST contournerait silencieusement le
    // plafond que le socket applique. Skip le comptage quand CET emoji précis
    // est déjà posé : la purge+upsert qui suit ne fait alors que le
    // CONFIRMER, sans consommer de place neuve — exactement comme sur les
    // trois autres chemins de création (message, pièce jointe, post,
    // commentaire/socket). Reconfirmer un emoji DÉJÀ posé ne consomme aucune
    // place : la garde ne s'applique qu'à une création réelle.
    const alreadyHasThisEmoji = await this.prisma.commentReaction.findFirst({
      where: { commentId, userId, emoji },
      select: { id: true },
    });
    if (!alreadyHasThisEmoji) {
      const existingReactionCount = await this.prisma.commentReaction.count({
        where: { commentId, userId },
      });
      // `assertReactionAllowed` jette `ConflictError` : la route REST
      // (POST /posts/:postId/comments/:commentId/like) trie sur `instanceof
      // ConflictError` pour répondre 409, comme `CommentReactionService`
      // (premier chemin, socket).
      assertReactionAllowed(existingReactionCount);
    }

    // Source de vérité = table `CommentReaction`, EMPILÉE — comme le chemin
    // socket, et comme le schéma le dit depuis toujours :
    // `@@unique([commentId, userId, emoji])` porte l'emoji, donc la base n'a
    // jamais plafonné à une réaction. Le seul plafond est
    // `MAX_REACTIONS_PER_OBJECT`, et il vaut cinq.
    //
    // Ce site exécutait ici `deleteMany({ emoji: { not: emoji } })` au nom d'un
    // « invariant max 1 réaction par user » qui n'existait sur AUCUN des deux
    // autres chemins : `CommentReactionService.addReaction` (socket) empile.
    // Les deux partageaient pourtant la GARDE de plafond et divergeaient sur la
    // MUTATION — la divergence ne se voyait donc pas en comparant les gardes.
    // Effet vécu : quelqu'un ayant empilé sur iOS puis touchant le cœur depuis
    // Android perdait tout le reste, sans erreur ni notification. Au plafond
    // c'était pire — reconfirmer un emoji déjà posé fait sauter la garde
    // (confirmer ne consomme pas de place, c'est juste), et la purge partait
    // quand même : cinq réactions, quatre détruites.
    //
    // L'upsert reste idempotent (❤️ sur ❤️ ne change rien), donc le REST demeure
    // un FALLBACK sûr du socket, sans double-comptage si les deux se
    // déclenchent sur le même geste.
    await this.prisma.commentReaction.upsert({
      where: { comment_user_reaction_unique: { commentId, userId, emoji } },
      create: { commentId, userId, emoji },
      update: {},
    });
    return this.syncCommentLikeCounters(commentId);
  }

  /**
   * Retire UNE réaction du lecteur sur un commentaire.
   *
   * `emoji` FOURNI ⇒ c'est celui-là qui part, exactement. ABSENT ⇒ la PLUS
   * RÉCENTE part — la règle produit dit « re-toucher retire la dernière posée,
   * une par une, jusqu'à n'en plus avoir », et cette règle vaut pour les
   * commentaires comme pour les publications (`PostService.unlikePost`).
   *
   * Le défaut `= '❤️'` qui vivait sur ce paramètre rendait le repli
   * INATTEIGNABLE : « rien demandé » devenait « retire le cœur », donc une pile
   * sans cœur ne se pelait jamais, et quelqu'un qui n'en avait jamais posé en
   * perdait un. Le schéma de route porte la même correction (`UnlikeSchema`,
   * emoji optionnel et SANS défaut, distinct de `LikeSchema`).
   */
  async unlikeComment(commentId: string, userId: string, emoji?: string) {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, deletedAt: NOT_DELETED },
      select: { id: true },
    });
    if (!comment) return null;

    // L'emoji demandé restreint la pile ; son absence la laisse entière. Dans
    // les deux cas le tri décroissant fait de la tête la réaction à retirer :
    // la désignée, ou la plus récente. Même forme que `unlikePost`.
    const requested = emoji?.trim();
    const pile = await this.prisma.commentReaction.findMany({
      where: { commentId, userId, ...(requested ? { emoji: requested } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { emoji: true },
      take: 1,
    });
    const cible = pile[0]?.emoji ?? null;
    if (!cible) {
      const inchange = await this.syncCommentLikeCounters(commentId);
      return { ...inchange, removedEmoji: null };
    }

    await this.prisma.commentReaction.deleteMany({ where: { commentId, userId, emoji: cible } });
    // `removedEmoji` voyage AVEC le commentaire, exactement comme sur le chemin
    // des publications (`PostService.unlikePost`). La route diffuse ce que le
    // serveur a FAIT, jamais ce que le client a DEMANDÉ : sans lui, un retrait
    // non désigné annonçait `undefined`, et un client optimiste ne savait quel
    // compteur décrémenter — il se désynchronisait sur un geste RÉUSSI.
    const apres = await this.syncCommentLikeCounters(commentId);
    return { ...apres, removedEmoji: cible };
  }

  /// Recalcule les compteurs dénormalisés du commentaire DEPUIS la table (source de
  /// vérité) : `likeCount` = `reactionCount` = nombre total de réactions, et
  /// `reactionSummary` = comptes par emoji. Identique au chemin socket (CS1) → REST
  /// et socket restent parfaitement cohérents, ce qui autorise le REST comme fallback.
  private async syncCommentLikeCounters(commentId: string) {
    const grouped = await this.prisma.commentReaction.groupBy({
      by: ['emoji'],
      where: { commentId },
      _count: { emoji: true },
    });
    const summary: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      summary[g.emoji] = g._count.emoji;
      total += g._count.emoji;
    }
    return this.prisma.postComment.update({
      where: { id: commentId },
      data: {
        likeCount: total,
        reactionCount: total,
        reactionSummary: summary as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        postId: true,
        authorId: true,
        content: true,
        likeCount: true,
        reactionSummary: true,
      },
    });
  }
}
