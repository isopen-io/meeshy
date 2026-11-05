/**
 * UNE INVITE DE RÉGLAGE MÈNE AU RÉGLAGE (#16339). « Activez … dans les
 * réglages » ouvrait l'écran des réglages en haut, et laissait l'utilisateur
 * chercher la bascule. L'adresse nomme désormais le réglage (`?reglage=<clé>`,
 * la clé étant le `data-setting` de sa bascule) ; l'écran attend la rangée —
 * elle peut dépendre d'une lecture serveur ou d'un catalogue chargé à la
 * demande —, y défile, lui donne le focus et l'allume, puis l'éteint.
 *
 * L'attente est BORNÉE : un réglage absent pour ce compte n'allume rien et ne
 * laisse aucune minuterie vivante.
 */
export const SETTING_FOCUS_PARAM = 'reglage';

const SETTING_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const POLL_MS = 100;
const WAIT_MS = 4000;
const HIGHLIGHT_MS = 2400;

export function settingFocusPath(key: string): string {
  return `/settings?${new URLSearchParams({ [SETTING_FOCUS_PARAM]: key }).toString()}`;
}

export function settingRequestedIn(search: string): string | null {
  const key = new URLSearchParams(search).get(SETTING_FOCUS_PARAM);
  return key !== null && SETTING_KEY.test(key) ? key : null;
}

export type SettingFocusTarget = {
  readonly reveal: () => void;
  readonly focus: () => void;
  readonly highlight: (on: boolean) => void;
};

export type SettingFocusClock = {
  readonly find: () => SettingFocusTarget | null;
  readonly schedule: (run: () => void, delayMs: number) => void;
  readonly now: () => number;
};

/** Rend la fonction qui abandonne l'attente et éteint ce qui est allumé. */
export function focusSettingWhenReady({ find, schedule, now }: SettingFocusClock): () => void {
  const deadline = now() + WAIT_MS;
  let live = true;
  let lit: SettingFocusTarget | null = null;

  const light = (target: SettingFocusTarget) => {
    target.reveal();
    target.focus();
    target.highlight(true);
    lit = target;
    schedule(() => {
      if (lit !== target) return;
      target.highlight(false);
      lit = null;
    }, HIGHLIGHT_MS);
  };

  const attempt = () => {
    if (!live) return;
    const target = find();
    if (target !== null) return light(target);
    if (now() + POLL_MS > deadline) return;
    schedule(attempt, POLL_MS);
  };

  attempt();
  return () => {
    live = false;
    lit?.highlight(false);
    lit = null;
  };
}
