/**
 * **COMPOSER ET BORNER UNE ANNULATION SUR TOUT MOTEUR** (#8481).
 *
 * `AbortSignal.any` n'existe qu'à partir de Chromium 116, `AbortSignal.timeout`
 * à partir de 103. La coque Android s'exécute dans la WebView SYSTÈME, que
 * rien ne garantit récente (`minSdk 24`, appareils sans Play Store, WebView
 * jamais mise à jour) : sur la WebView 113 d'un Android 14, chaque lecture
 * levait `AbortSignal.any is not a function` avant d'atteindre le réseau, et
 * aucune liste ne se chargeait.
 *
 * Ces deux fonctions sont les SEULS sites du dépôt qui touchent ces statiques :
 * la version native quand elle existe, un repli équivalent sinon — même
 * annulation, même cause (`reason`), même `TimeoutError`. Les statiques sont
 * injectables pour que les témoins jouent le moteur qui ne les a pas.
 */
type AbortStatics = {
  readonly any?: (signals: AbortSignal[]) => AbortSignal;
  readonly timeout?: (milliseconds: number) => AbortSignal;
};

export function anySignal(signals: readonly AbortSignal[], native: AbortStatics = AbortSignal): AbortSignal {
  if (typeof native.any === 'function') return native.any([...signals]);
  const controller = new AbortController();
  const settled = signals.find((signal) => signal.aborted);
  if (settled !== undefined) {
    controller.abort(settled.reason);
    return controller.signal;
  }
  signals.forEach((signal) =>
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true, signal: controller.signal }),
  );
  return controller.signal;
}

export function timeoutSignal(milliseconds: number, native: AbortStatics = AbortSignal): AbortSignal {
  if (typeof native.timeout === 'function') return native.timeout(milliseconds);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), milliseconds);
  return controller.signal;
}
