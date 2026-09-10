/**
 * Service de gestion des réponses aux stickers interactifs (O10, #3954)
 *
 * Votes/réponses posés sur un sticker `interactive` du canvas — table légère à
 * côté de `Post.storyEffects`, jamais dedans : le blob de scène est immuable
 * une fois publié, une réponse ne l'est pas. Mirrors PostReactionService's
 * shape (validation, existence + deletedAt guard, groupBy-based aggregation)
 * with one added discriminant: `objectId`, the `MeeshySceneObject.id` of the
 * sticker inside the canvas — a post carries up to 60 objects across up to 10
 * scenes, so `postId` alone cannot designate one.
 *
 * Le kind `interactive` reste RÉSERVÉ au contrat (#3953) : ce service ne
 * valide pas la forme d'une réponse contre le sous-type du sticker, qu'aucun
 * client ne peut encore poser.
 */

import { PrismaClient, PostInteractiveResponse } from '@meeshy/shared/prisma/client';
import { assertValidObjectId } from '../utils/object-id.js';
import { ValidationError } from '../errors/custom-errors.js';

export interface PostInteractiveResponseData {
  readonly id: string;
  readonly postId: string;
  readonly objectId: string;
  readonly userId: string;
  readonly choice: string | null;
  readonly numericValue: number | null;
  readonly text: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SubmitPostInteractiveResponseOptions {
  postId: string;
  objectId: string;
  userId: string;
  choice?: string;
  numericValue?: number;
  text?: string;
}

export interface RemovePostInteractiveResponseOptions {
  postId: string;
  objectId: string;
  userId: string;
}

export interface PostInteractiveChoiceCount {
  readonly choice: string;
  readonly count: number;
}

export interface PostInteractiveResponseAggregation {
  readonly postId: string;
  readonly objectId: string;
  readonly totalResponses: number;
  readonly choiceCounts: readonly PostInteractiveChoiceCount[];
}

/** L'objectId d'un sticker est une chaîne libre attribuée à la composition — pas un ObjectId Mongo. */
function assertValidObjectRef(objectId: string): void {
  if (!objectId || objectId.trim().length === 0) {
    throw new ValidationError('objectId is required', { objectId: 'objectId must be a non-empty string' });
  }
}

/** Au moins une des trois formes de réponse (choix, valeur numérique, texte) doit être fournie. */
function assertHasResponseValue(options: SubmitPostInteractiveResponseOptions): void {
  if (
    options.choice === undefined &&
    options.numericValue === undefined &&
    options.text === undefined
  ) {
    throw new ValidationError(
      'At least one of choice, numericValue or text is required',
      { value: 'response must carry at least one of choice, numericValue or text' },
    );
  }
}

export class PostInteractiveResponseService {
  constructor(private readonly prisma: PrismaClient) {}

  async submitResponse(
    options: SubmitPostInteractiveResponseOptions,
  ): Promise<PostInteractiveResponseData> {
    const { postId, objectId, userId, choice, numericValue, text } = options;

    assertValidObjectId(postId, 'post');
    assertValidObjectRef(objectId);
    assertHasResponseValue(options);

    if (!userId) {
      throw new Error('userId must be provided');
    }

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, deletedAt: true },
    });

    if (!post) {
      throw new Error('Post not found');
    }

    if (post.deletedAt) {
      throw new Error('Post has been deleted');
    }

    // Une personne a AU PLUS une réponse par sticker : un nouveau vote
    // REMPLACE le précédent (upsert sur la clé unique
    // `post_object_user_response_unique`), y compris pour un texte libre.
    const response = await this.prisma.postInteractiveResponse.upsert({
      where: {
        post_object_user_response_unique: { postId, objectId, userId },
      },
      update: {
        choice: choice ?? null,
        numericValue: numericValue ?? null,
        text: text ?? null,
      },
      create: {
        postId,
        objectId,
        userId,
        choice: choice ?? null,
        numericValue: numericValue ?? null,
        text: text ?? null,
      },
    });

    return this.mapResponseToData(response);
  }

  async removeResponse(options: RemovePostInteractiveResponseOptions): Promise<boolean> {
    const { postId, objectId, userId } = options;

    assertValidObjectId(postId, 'post');
    assertValidObjectRef(objectId);

    const result = await this.prisma.postInteractiveResponse.deleteMany({
      where: { postId, objectId, userId },
    });

    return result.count > 0;
  }

  async getAggregate(
    postId: string,
    objectId: string,
  ): Promise<PostInteractiveResponseAggregation> {
    assertValidObjectId(postId, 'post');
    assertValidObjectRef(objectId);

    // Ventilation par choix recalculée depuis la table (source de vérité),
    // jamais un compteur dénormalisé — même patron que
    // `PostReactionService.updatePostReactionSummary`, auto-réparant quel que
    // soit l'état après une course concurrente.
    const grouped = await this.prisma.postInteractiveResponse.groupBy({
      by: ['choice'],
      where: { postId, objectId, choice: { not: null } },
      _count: { choice: true },
    });

    const choiceCounts: PostInteractiveChoiceCount[] = grouped
      .filter((group): group is typeof group & { choice: string } => group.choice !== null)
      .map(group => ({ choice: group.choice, count: group._count.choice }));

    const totalResponses = await this.prisma.postInteractiveResponse.count({
      where: { postId, objectId },
    });

    return { postId, objectId, totalResponses, choiceCounts };
  }

  async getUserResponse(
    postId: string,
    objectId: string,
    userId: string,
  ): Promise<PostInteractiveResponseData | null> {
    assertValidObjectId(postId, 'post');
    assertValidObjectRef(objectId);

    const response = await this.prisma.postInteractiveResponse.findUnique({
      where: {
        post_object_user_response_unique: { postId, objectId, userId },
      },
    });

    return response ? this.mapResponseToData(response) : null;
  }

  async deletePostInteractiveResponses(postId: string): Promise<number> {
    const result = await this.prisma.postInteractiveResponse.deleteMany({
      where: { postId },
    });

    return result.count;
  }

  private mapResponseToData(response: PostInteractiveResponse): PostInteractiveResponseData {
    return {
      id: response.id,
      postId: response.postId,
      objectId: response.objectId,
      userId: response.userId,
      choice: response.choice,
      numericValue: response.numericValue,
      text: response.text,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
    };
  }
}

export const createPostInteractiveResponseService = (prisma: PrismaClient) => {
  return new PostInteractiveResponseService(prisma);
};
