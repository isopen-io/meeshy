import type { AwaitingItem, DigestParticipant, FaceRampEntry, FaceRampRankingInput } from './types';

/**
 * LE CLASSEMENT DE LA RAMPE — miroir de `FaceRampRanking.swift` (#5695,
 * étape 6). Score UNIQUEMENT sur des signaux réels et vérifiables : mentions
 * de moi non répondues ×5, réponses directes à mes messages ×3, questions
 * sans réponse de cette personne ×2, récence (décroissance sur 7 j) ×1. Le
 * badge affiché EST le nombre de messages qui m'attendent (`awaitingCount`)
 * — jamais le score (`needScore`, réservé au tri, jamais affiché).
 */

export const FACE_RAMP_WEIGHTS = {
  mention: 5,
  directReply: 3,
  unansweredQuestion: 2,
  recency: 1,
} as const;

export const RECENCY_HALF_LIFE_MS = 7 * 24 * 3600 * 1000;

function orderedUnique(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Décroissance exponentielle demi-vie 7 j : `0.5 ^ (écoulé / demi-vie)`.
 * `null`/écoulé négatif (horloge injectée incohérente) ⇒ `0`, jamais un
 * score négatif ni `NaN`.
 */
function recencyScore(at: number | null, now: number): number {
  if (at === null) return 0;
  const elapsed = Math.max(0, now - at);
  return Math.pow(0.5, elapsed / RECENCY_HALF_LIFE_MS);
}

/**
 * Tri : score décroissant, puis nom affiché croissant pour départager —
 * comparaison `String` brute, jamais dépendante d'une locale non injectée :
 * deux exécutions du même processus rendent le même ordre.
 */
export function rankFaceRamp(entries: readonly FaceRampRankingInput[], now: number): readonly FaceRampEntry[] {
  return entries
    .map((entry): FaceRampEntry => {
      const evidence = orderedUnique([
        ...entry.mentionEvidence,
        ...entry.directReplyEvidence,
        ...entry.unansweredQuestionEvidence,
      ]);
      const score =
        FACE_RAMP_WEIGHTS.mention * entry.mentionEvidence.length +
        FACE_RAMP_WEIGHTS.directReply * entry.directReplyEvidence.length +
        FACE_RAMP_WEIGHTS.unansweredQuestion * entry.unansweredQuestionEvidence.length +
        FACE_RAMP_WEIGHTS.recency * recencyScore(entry.mostRecentEvidenceAt, now);

      return {
        id: entry.id,
        displayName: entry.displayName,
        avatarUrl: entry.avatarUrl,
        colorHex: entry.colorHex,
        presence: entry.presence,
        awaitingCount: evidence.length,
        needScore: score,
        evidenceMessageIds: evidence,
      };
    })
    .sort((a, b) => {
      if (a.needScore !== b.needScore) return b.needScore - a.needScore;
      return a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0;
    });
}

/**
 * Groupe `awaitingYou` par `fromUserId` et résout l'identité via
 * `participants`. Un `fromUserId` ABSENT de `participants` est
 * SILENCIEUSEMENT écarté — zéro donnée fabriquée : afficher une entrée de
 * Rampe exige un nom et un avatar réels, jamais un placeholder inventé pour
 * un identifiant inconnu.
 */
export function makeFaceRampInputs(input: {
  readonly awaitingYou: readonly AwaitingItem[];
  readonly participants: readonly DigestParticipant[];
}): readonly FaceRampRankingInput[] {
  type Bucket = {
    mention: string[];
    reply: string[];
    question: string[];
    mostRecent: number | null;
  };
  const byUser = new Map<string, Bucket>();
  for (const item of input.awaitingYou) {
    const bucket = byUser.get(item.fromUserId) ?? { mention: [], reply: [], question: [], mostRecent: null };
    if (item.kind === 'mention') bucket.mention.push(...item.evidenceMessageIds);
    else if (item.kind === 'directReply') bucket.reply.push(...item.evidenceMessageIds);
    else bucket.question.push(...item.evidenceMessageIds);
    bucket.mostRecent = bucket.mostRecent === null ? item.at : Math.max(bucket.mostRecent, item.at);
    byUser.set(item.fromUserId, bucket);
  }

  const participantsById = new Map(input.participants.map((p) => [p.id, p] as const));

  const inputs: FaceRampRankingInput[] = [];
  for (const [userId, bucket] of byUser) {
    const participant = participantsById.get(userId);
    if (participant === undefined) continue;
    inputs.push({
      id: userId,
      displayName: participant.displayName,
      avatarUrl: participant.avatarUrl,
      colorHex: participant.colorHex,
      presence: participant.presence,
      mentionEvidence: bucket.mention,
      directReplyEvidence: bucket.reply,
      unansweredQuestionEvidence: bucket.question,
      mostRecentEvidenceAt: bucket.mostRecent,
    });
  }
  // Ordre déterministe AVANT `rankFaceRamp` (qui retriera par score).
  return inputs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
