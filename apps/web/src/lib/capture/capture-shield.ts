import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

import { detectionOf, type CaptureDetection, type CaptureHost } from './capture-policy';

/**
 * LE BOUCLIER DE CAPTURE DE LA VUE UNIQUE (#9574, #9617 — décision porteur du
 * 2026-10-07 : « vue unique : capture et enregistrement d'écran NOIRS »).
 *
 * Dans la coque Android, `MeeshyScreenGuard.setSecure` pose `FLAG_SECURE` sur
 * la fenêtre de l'activité : capture, enregistrement, recopie et vignette des
 * applications récentes rendent du noir. Il se pose tant qu'AU MOINS une vue
 * unique est affichée — un COMPTEUR d'affichages (`hold` / `release`), jamais
 * un booléen qu'un démontage remettrait à faux pendant qu'une autre surface
 * montre encore la sienne. La page est le seul site du compte ; la coque ne
 * fait qu'appliquer l'état, et le retire elle-même quand le document est
 * rechargé (le compte repart alors de zéro).
 *
 * FERMÉ PAR DÉFAUT : dans une coque dont le pont manque (construite avant lui)
 * ou refuse, `ready` rend `false` et la vue unique ne s'affiche pas en clair.
 * Hors coque (navigateur), aucun pont n'est attendu : `ready` rend `true` —
 * un navigateur ne sait ni noircir ni détecter une capture (D-179).
 *
 * Le registre sert aussi la DÉTECTION : `shown()` liste les vues uniques à
 * l'écran, celles qu'une capture déclare comme tentatives
 * (`screen-capture-reports.ts`).
 */

export const CAPTURE_SHIELD_PLUGIN = 'MeeshyScreenGuard';

export type CaptureShieldMode = 'browser' | 'guarded' | 'unguarded';

export type CaptureShieldLease = {
  /** `true` quand l'affichage en clair est permis — `FLAG_SECURE` posé, ou navigateur. */
  readonly ready: Promise<boolean>;
  /** Idempotent : un démontage rejoué ne retire pas l'affichage d'une autre surface. */
  readonly release: () => void;
};

export type CaptureShieldOrigin = 'display' | 'row';

export type CaptureShield = {
  readonly mode: () => CaptureShieldMode;
  /**
   * `display` : la vue unique est affichée, une capture la déclare comme
   * tentative. `row` : une rangée dont la nature ne se lit pas (`captureOf`) —
   * elle noircit sans être déclarée d'ici (la rangée se déclare par le DOM).
   */
  readonly hold: (messageId: string, origin?: CaptureShieldOrigin) => CaptureShieldLease;
  readonly shown: () => readonly string[];
  /** `FLAG_SECURE` est-il demandé ? Alors la fenêtre est noire : seules les vues uniques se déclarent (tentatives). */
  readonly secured: () => boolean;
  /** L'hôte et ce que la coque détecte — `detection: null` tant qu'elle n'a pas répondu (fermé). */
  readonly host: () => CaptureHost;
  /** Demande à la coque ce qu'elle détecte (une fois) ; prévient chaque abonné à la réponse. */
  readonly watchHost: (listener: () => void) => () => void;
};

const isShell = (coque: CoqueNative | undefined): boolean => {
  const platform = coque?.getPlatform?.();
  return platform !== undefined && platform !== 'web';
};

export function createCaptureShield(coqueOf: () => CoqueNative | undefined): CaptureShield {
  let holders: readonly { readonly token: symbol; readonly messageId: string; readonly origin: CaptureShieldOrigin }[] = [];
  let securing: Promise<boolean> = Promise.resolve(true);
  /** La réponse de LA coque interrogée — une autre coque (rechargement, témoin) repart fermée. */
  let detection: { readonly coque: CoqueNative | undefined; readonly value: CaptureDetection | null } | null = null;
  let watchers: readonly (() => void)[] = [];

  const setSecure = () => appelNatifMethode(coqueOf(), CAPTURE_SHIELD_PLUGIN, 'setSecure');

  const mode = (): CaptureShieldMode => {
    const coque = coqueOf();
    if (!isShell(coque)) return 'browser';
    return setSecure() === null ? 'unguarded' : 'guarded';
  };

  const apply = (secure: boolean): Promise<boolean> => {
    const call = setSecure();
    if (call === null) return Promise.resolve(false);
    return call({ secure }).then(
      () => true,
      () => false,
    );
  };

  const hold = (messageId: string, origin: CaptureShieldOrigin = 'display'): CaptureShieldLease => {
    const token = Symbol(messageId);
    const current = mode();
    const first = holders.length === 0;
    holders = [...holders, { token, messageId, origin }];
    if (current === 'guarded' && first) securing = apply(true);
    const ready = current === 'browser' ? Promise.resolve(true) : current === 'unguarded' ? Promise.resolve(false) : securing;
    const release = () => {
      if (!holders.some((holder) => holder.token === token)) return;
      holders = holders.filter((holder) => holder.token !== token);
      if (holders.length === 0 && current === 'guarded') void apply(false);
    };
    return { ready, release };
  };

  const shown = (): readonly string[] => [
    ...new Set(holders.filter((holder) => holder.origin === 'display').map((holder) => holder.messageId)),
  ];

  const secured = (): boolean => mode() === 'guarded' && holders.length > 0;

  const host = (): CaptureHost => {
    if (mode() === 'browser') return { kind: 'browser' };
    return { kind: 'shell', detection: detection !== null && detection.coque === coqueOf() ? detection.value : null };
  };

  let askedOf: CoqueNative | undefined | null = null;
  const ask = () => {
    const coque = coqueOf();
    const getState = appelNatifMethode(coque, CAPTURE_SHIELD_PLUGIN, 'getState');
    if (askedOf === coque || getState === null) return;
    askedOf = coque;
    void getState({})
      .then((state) => {
        detection = { coque, value: detectionOf(state) };
        watchers.forEach((watcher) => watcher());
      })
      .catch(() => undefined);
  };

  const watchHost = (listener: () => void): (() => void) => {
    watchers = [...watchers, listener];
    ask();
    return () => {
      watchers = watchers.filter((watcher) => watcher !== listener);
    };
  };

  return { mode, hold, shown, secured, host, watchHost };
}

export const captureShield: CaptureShield = createCaptureShield(coqueCourante);
