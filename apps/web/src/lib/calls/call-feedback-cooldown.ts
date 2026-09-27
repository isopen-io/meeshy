import type { SafeStorage } from '@/lib/storage';

/**
 * La note d'après-appel (#8072, D-138) n'est demandée qu'UNE fois par jour
 * glissant, quel que soit le tirage : un réseau mauvais ne transforme pas
 * chaque raccrochage en questionnaire. Chargé avec la carte, jamais par le
 * moteur. Redemander pour le même appel reste accordé ; une valeur illisible
 * ou datée du futur ne bloque rien.
 */

export const FEEDBACK_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const LAST_PROMPT_KEY = 'meeshy.call-feedback.last-prompt-at';

export type FeedbackCooldown = {
  readonly claim: (request: { readonly callId: string; readonly now: number }) => boolean;
};

const parse = (raw: string | null): { readonly at: number; readonly callId: string } | null => {
  const [at, callId] = (raw ?? '').split('|');
  const time = Number(at);
  return Number.isFinite(time) && time > 0 && callId ? { at: time, callId } : null;
};

export function feedbackCooldown(storage: SafeStorage): FeedbackCooldown {
  return {
    claim: ({ callId, now }) => {
      const last = parse(storage.getItem(LAST_PROMPT_KEY));
      if (last?.callId === callId) return true;
      const cooling = last !== null && last.at <= now && now - last.at < FEEDBACK_COOLDOWN_MS;
      if (cooling) return false;
      storage.setItem(LAST_PROMPT_KEY, `${now}|${callId}`);
      return true;
    },
  };
}
