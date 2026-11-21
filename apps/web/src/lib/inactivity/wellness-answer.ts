import { apiDeps } from '@/lib/api/deps';
import { sendWellnessOk } from '@/lib/api/inactivity';
import type { NotificationRecord } from '@/lib/notifications/record';

/**
 * **« TOUT VA BIEN ? », ONGLET OUVERT** (#18738, TEL-02) — toucher la question (`wellness_check`), dans la cloche ou
 * sa bannière in-app, répond « Je vais bien » (`POST /me/wellness/ok`) : c'est la personne qui répond, de n'importe
 * lequel de ses appareils. JUMEAU de `repondreBienEtre` (`public/sw-push.js`), la même réponse onglet fermé.
 * Best-effort : un échec ne lève jamais, la notification reste dans la cloche pour un nouvel essai.
 */

/** `WELLNESS_CHECK_NOTIFICATION_TYPE`, écrit en littéral : le contrat importe `zod` classique. */
export const WELLNESS_CHECK_TYPE = 'wellness_check';

type Send = () => Promise<unknown>;

const okOf = (result: unknown): boolean => !(typeof result === 'object' && result !== null && 'ok' in result && result.ok === false);

export async function answerWellnessCheck(notification: Pick<NotificationRecord, 'type'>, { send = () => sendWellnessOk(apiDeps) }: { readonly send?: Send } = {}): Promise<boolean> {
  if (notification.type !== WELLNESS_CHECK_TYPE) return false;
  try {
    return okOf(await send());
  } catch {
    return false;
  }
}
