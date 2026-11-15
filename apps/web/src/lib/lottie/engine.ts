/**
 * **LE MOTEUR LOTTIE, UN SEUL** (#10638) — `lottie-web` en construction
 * « light » (rendu SVG, sans évaluateur d'expressions), chargé À LA DEMANDE par
 * un `import()` : il n'est jamais sur le chemin du premier rendu, et le socle
 * du démarrage n'en porte pas un octet. Le type ci-dessous est la seule surface
 * dont les hôtes dépendent — un témoin la remplace sans toucher au réseau.
 */
export type LottieHandle = {
  readonly play: () => void;
  readonly pause: () => void;
  readonly destroy: () => void;
};

export type LottiePlayer = {
  readonly loadAnimation: (args: {
    readonly container: HTMLElement;
    readonly renderer: 'svg';
    readonly loop: boolean;
    readonly autoplay: boolean;
    readonly animationData: unknown;
    readonly rendererSettings: { readonly preserveAspectRatio: string; readonly progressiveLoad: boolean };
  }) => LottieHandle;
};

export type LottiePlayerLoader = () => Promise<LottiePlayer>;

let loaded: Promise<LottiePlayer> | null = null;

/** Le moteur de la session : importé une fois, retenu ; un échec n'est pas retenu. */
export const loadLottiePlayer: LottiePlayerLoader = () => {
  loaded ??= import('lottie-web/build/player/lottie_light').then(
    (module) => module.default as unknown as LottiePlayer,
    (error: unknown) => {
      loaded = null;
      throw error;
    },
  );
  return loaded;
};
