import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'HashtagService' });

export interface ExtractedHashtag {
  /** Normalisé minuscule — clé de correspondance sur `Hashtag.tag`. */
  tag: string;
  /** Casse telle que tapée par l'auteur — `PostHashtag.display`. */
  display: string;
}

const MAX_CONTENT_LENGTH = 10000;
const MAX_HASHTAGS_PER_POST = 30;

// `#` + 1-50 caractères Unicode lettre/chiffre/underscore. PAS de tiret
// (convention hashtag, différente des mentions qui l'autorisent). Frontière
// gauche : ni caractère de mot ni `/` — exclut aussi bien "C#paris" qu'un
// fragment d'URL "exemple.com/#section".
const HASHTAG_REGEX = /(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_]{1,50})/gu;

export class HashtagService {
  constructor(private prisma: PrismaClient) {}

  extractHashtags(content: string): ExtractedHashtag[] {
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      if (content) log.warn(`[HashtagService] Content too long: ${content.length} bytes`);
      return [];
    }

    const seen = new Set<string>();
    const result: ExtractedHashtag[] = [];

    for (const match of content.matchAll(HASHTAG_REGEX)) {
      const raw = match[1];
      if (!raw) continue;
      const tag = raw.toLowerCase();
      if (seen.has(tag)) continue;
      seen.add(tag);
      result.push({ tag, display: `#${raw}` });
      if (result.length >= MAX_HASHTAGS_PER_POST) {
        log.warn(`[HashtagService] Max hashtags limit reached (${MAX_HASHTAGS_PER_POST}), truncating`);
        break;
      }
    }

    return result;
  }

  /**
   * Upsert `Hashtag` (créer si absent, réutiliser sinon) puis `PostHashtag`
   * par `(postId, hashtagId)` — une republication met à jour `display`, elle
   * n'est jamais avalée en silence (même raison que l'upsert de `SoundUsage`
   * cette session). Recompte `Hashtag.usageCount` après coup plutôt que
   * d'incrémenter à l'aveugle : jamais de dérive rejouable.
   */
  async createPostHashtags(postId: string, hashtags: ExtractedHashtag[]): Promise<void> {
    for (const { tag, display } of hashtags) {
      try {
        const hashtag = await this.prisma.hashtag.upsert({
          where: { tag },
          create: { tag },
          update: {},
        });
        await this.prisma.postHashtag.upsert({
          where: { post_hashtag_unique: { postId, hashtagId: hashtag.id } },
          create: { postId, hashtagId: hashtag.id, display },
          update: { display },
        });
        await this.recountHashtag(hashtag.id);
      } catch (error) {
        log.error('createPostHashtags a échoué', error instanceof Error ? error : new Error(String(error)),
          { postId, tag });
      }
    }
  }

  private async recountHashtag(hashtagId: string): Promise<void> {
    const usageCount = await this.prisma.postHashtag.count({ where: { hashtagId } });
    await this.prisma.hashtag.update({ where: { id: hashtagId }, data: { usageCount, lastUsedAt: new Date() } });
  }

  /**
   * À l'édition, retire les `PostHashtag` dont le tag n'est plus dans le
   * contenu édité (`keptTags`, déjà normalisés minuscule par l'appelant) et
   * recompte les `Hashtag` touchés. Contrairement à `MentionService` (qui
   * laisse les mentions retirées orphelines — sans conséquence, aucun
   * compteur n'en dépend), `Hashtag.usageCount` alimente les tendances : une
   * ligne orpheline gonflerait un compteur qui ne redescend jamais.
   */
  async reconcileRemovedHashtags(postId: string, keptTags: string[]): Promise<void> {
    try {
      const existing = await this.prisma.postHashtag.findMany({
        where: { postId },
        select: { id: true, hashtagId: true, hashtag: { select: { tag: true } } },
      });
      const kept = new Set(keptTags);
      const removed = existing.filter((ph) => !kept.has(ph.hashtag.tag));
      if (removed.length === 0) return;

      await this.prisma.postHashtag.deleteMany({ where: { id: { in: removed.map((ph) => ph.id) } } });
      const touchedHashtagIds = [...new Set(removed.map((ph) => ph.hashtagId))];
      for (const hashtagId of touchedHashtagIds) {
        await this.recountHashtag(hashtagId);
      }
    } catch (error) {
      log.error('reconcileRemovedHashtags a échoué', error instanceof Error ? error : new Error(String(error)),
        { postId });
    }
  }
}
