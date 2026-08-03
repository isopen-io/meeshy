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
}
