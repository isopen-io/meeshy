import type { ApiResult } from '@/lib/api/http';
import type { VerificationStatusData } from '@/lib/api/verify-email';

/**
 * L'ÉCRAN DU CODE APPREND QUE L'ADRESSE A ÉTÉ PROUVÉE AILLEURS (#8083).
 *
 * Décision porteur « SI ET SEULEMENT SI » : un appareil ne se connecte que par
 * le code saisi SUR LUI ou le lien ouvert SUR LUI. Le jeton d'attente que la
 * passerelle remet à l'appareil demandeur (`pendingSessionToken`) ne sert qu'à
 * lire un ÉTAT — `pending` / `proven` — par `POST /auth/verification/status`,
 * jamais à obtenir une session. L'écran l'interroge toutes les ~3 s tant que
 * l'onglet est visible, tout de suite quand il le redevient, et s'arrête à la
 * preuve, au démontage, ou quand le jeton n'a plus cours (401 inconnu, 410
 * expiré). Hors-ligne, débit dépassé ou panne : on réessaie au tour suivant.
 */

export const VERIFICATION_WATCH_INTERVAL_MS = 3_000;

export type VerificationWatchView = {
  readonly document: EventTarget & { readonly visibilityState: DocumentVisibilityState };
  readonly setTimeout: (run: () => void, ms: number) => number;
  readonly clearTimeout: (id: number) => void;
};

export type VerificationStatusReader = (pendingSessionToken: string) => Promise<ApiResult<VerificationStatusData>>;

const TOKEN_CLOSED = new Set([401, 410]);

export function watchVerificationStatus({
  token,
  read,
  view,
  onProven,
}: {
  readonly token: string;
  readonly read: VerificationStatusReader;
  readonly view: VerificationWatchView;
  readonly onProven: () => void;
}): () => void {
  let stopped = false;
  let inFlight = false;
  let timer: number | null = null;

  const visible = () => view.document.visibilityState === 'visible';

  const cancelTimer = () => {
    if (timer !== null) view.clearTimeout(timer);
    timer = null;
  };

  const stop = () => {
    stopped = true;
    cancelTimer();
    view.document.removeEventListener('visibilitychange', onVisibility);
  };

  const schedule = () => {
    cancelTimer();
    if (!stopped && visible()) timer = view.setTimeout(() => void tick(), VERIFICATION_WATCH_INTERVAL_MS);
  };

  async function tick(): Promise<void> {
    timer = null;
    if (stopped || inFlight || !visible()) return;
    inFlight = true;
    const result = await read(token);
    inFlight = false;
    if (stopped) return;
    if (result.ok && result.data.status === 'proven') {
      stop();
      onProven();
      return;
    }
    if (!result.ok && TOKEN_CLOSED.has(result.status)) {
      stop();
      return;
    }
    schedule();
  }

  function onVisibility(): void {
    if (!visible()) {
      cancelTimer();
      return;
    }
    cancelTimer();
    void tick();
  }

  view.document.addEventListener('visibilitychange', onVisibility);
  void tick();
  return stop;
}
