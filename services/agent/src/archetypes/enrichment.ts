import type { Archetype } from './catalog';

type UserProfileMetadata = {
  bio?: string;
  communities?: string[];
  interests?: string[];
  displayName?: string;
};

export function enrichArchetypeWithProfile(
  archetype: Archetype,
  profile: UserProfileMetadata,
): Archetype {
  const enrichedTopics = [...archetype.topicsOfExpertise];

  if (profile.bio) {
    const bioKeywords = extractKeywords(profile.bio);
    enrichedTopics.push(...bioKeywords);
  }

  if (profile.communities) {
    enrichedTopics.push(...profile.communities);
  }

  if (profile.interests) {
    enrichedTopics.push(...profile.interests);
  }

  return {
    ...archetype,
    topicsOfExpertise: [...new Set(enrichedTopics)],
    confidence: Math.min(archetype.confidence + 0.1, 0.6),
  };
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'par',
    'pour', 'avec', 'sur', 'est', 'sont', 'the', 'a', 'an', 'and', 'or',
    'by', 'for', 'with', 'on', 'is', 'are', 'in', 'to', 'of',
  ]);

  return text
    .toLowerCase()
    .split(/[\s,;.!?()]+/)
    .filter((word) => word.length > 3 && !stopWords.has(word))
    .slice(0, 10);
}
