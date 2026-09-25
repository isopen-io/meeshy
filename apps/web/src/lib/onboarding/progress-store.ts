import { ONBOARDING_STEPS } from '@/lib/api/onboarding';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

import { EMPTY_PROGRESS, type JourneyProgress, type ScoreMark } from './journey';

/**
 * **CE QUI S'EST CONFIRMÉ PENDANT LE PARCOURS, PAR COMPTE** (#7729) — le salut
 * accusé, la story publiée, les demandes d'ami parties. Le serveur ne retient
 * que les étapes VUES (`onboardingSteps`) ; ce magasin retient ce qu'elles ont
 * PRODUIT, pour que la reprise (au lancement suivant) sache encore proposer
 * l'étape 5 et chiffrer le récapitulatif.
 *
 * Une valeur altérée ou d'une forme inconnue se lit VIDE : un stockage local
 * ne fabrique jamais un point.
 */

const PREFIX = 'meeshy.onboarding.';

const isStep = (value: unknown): value is JourneyProgress['done'][number] =>
  typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value);

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Un repère de score altéré se lit ABSENT : la session repartira de la prochaine lecture. */
function decodeScore(raw: unknown): ScoreMark | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const baseline: unknown = Reflect.get(raw, 'baseline');
  const last: unknown = Reflect.get(raw, 'last');
  return isCount(baseline) && isCount(last) ? { baseline, last } : undefined;
}

function decode(raw: string | null): JourneyProgress {
  if (raw === null) return EMPTY_PROGRESS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_PROGRESS;
    const done: unknown = Reflect.get(parsed, 'done');
    const friendRequests: unknown = Reflect.get(parsed, 'friendRequests');
    if (!Array.isArray(done) || !done.every(isStep)) return EMPTY_PROGRESS;
    if (!Array.isArray(friendRequests) || !friendRequests.every((id) => typeof id === 'string')) return EMPTY_PROGRESS;
    const score = decodeScore(Reflect.get(parsed, 'score'));
    return score === undefined ? { done, friendRequests } : { done, friendRequests, score };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export type JourneyProgressStore = {
  read(viewerId: string): JourneyProgress;
  write(viewerId: string, progress: JourneyProgress): void;
};

export function createJourneyProgressStore(options: { readonly storage?: SafeStorage } = {}): JourneyProgressStore {
  const storage = options.storage ?? safeLocalStorage();
  return {
    read: (viewerId) => {
      try {
        return decode(storage.getItem(PREFIX + viewerId));
      } catch {
        return EMPTY_PROGRESS;
      }
    },
    write: (viewerId, progress) => {
      try {
        storage.setItem(PREFIX + viewerId, JSON.stringify(progress));
      } catch {
        /* Stockage refusé : la progression tient pour l'écran, sans se souvenir. */
      }
    },
  };
}

export const journeyProgressStore = createJourneyProgressStore();
