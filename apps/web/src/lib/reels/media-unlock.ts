import { coqueCourante } from '@/lib/native-shell';

/**
 * LE GESTE DÉVERROUILLE LES RÉELS VOISINS (iOS) — WebKit retient deux choses
 * à tout `<video>` qui n'a jamais reçu de `play()` PENDANT un geste : la
 * lecture SONORE, et le préchargement au-delà des métadonnées (`preload="auto"`
 * y vaut `metadata`). Un balayage ne compte pas comme un geste pour le réel
 * suivant : il arrivait sans une image d'avance, et son `play()` sonore était
 * refusé.
 *
 * Le doigt qui se lève (`touchend`, un geste au sens du navigateur) bénit donc
 * chaque voisin MONTÉ (N±1, N±2) et en pause, une fois : `play()` lève les
 * restrictions de l'élément dès l'appel, `pause()` le rend aussitôt à
 * l'attente, et la promesse interrompue est absorbée.
 *
 * La bénédiction est MUETTE : iOS ne laisse jouer qu'une vidéo SONORE à la
 * fois, et démarrer un voisin avec le son mettait en pause le réel regardé.
 * Le son de l'élément lui est rendu juste après. Le réel visible n'est jamais
 * touché.
 *
 * **Sur Android, N±2 n'est pas béni** (#11308) : Chromium et Gecko autorisent
 * le son sur l'activation du DOCUMENT, la bénédiction n'y lève rien — et le
 * `play()` d'un N±2 en `preload="none"` (`reelPreloadOf`) le chargerait et
 * réveillerait son décodeur, celui que le palier lui retire. WebKit garde les
 * deux voisins : il exige le geste pour précharger.
 */
export type ReelMediaUnlocker = { readonly unlock: (pager: ParentNode) => void };

/** `near` : N±1 seulement ; `mounted` : N±1 et N±2. */
export type ReelUnlockScope = 'near' | 'mounted';

const NEIGHBOR_MEDIA: Readonly<Record<ReelUnlockScope, string>> = {
  near: '[data-reel-mode="near"] [data-reel-media]',
  mounted: '[data-reel-mode="near"] [data-reel-media], [data-reel-mode="warm"] [data-reel-media]',
};

/** `platform` : `getPlatform()` de la coque (`native-shell.ts`), absent dans un navigateur. */
export function reelUnlockScopeOf(host: { readonly platform: string | undefined; readonly userAgent: string | undefined }): ReelUnlockScope {
  const android = host.platform === 'android' || /\bAndroid\b/.test(host.userAgent ?? '');
  return android ? 'near' : 'mounted';
}

export const currentReelUnlockScope = (): ReelUnlockScope =>
  reelUnlockScopeOf({ platform: coqueCourante()?.getPlatform?.(), userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent });

export function createReelMediaUnlocker({ scope = 'mounted' }: { readonly scope?: ReelUnlockScope } = {}): ReelMediaUnlocker {
  const blessed = new WeakSet<HTMLMediaElement>();
  return {
    unlock: (pager) => {
      pager.querySelectorAll<HTMLMediaElement>(NEIGHBOR_MEDIA[scope]).forEach((element) => {
        if (blessed.has(element) || !element.paused) return;
        blessed.add(element);
        const muted = element.muted;
        element.muted = true;
        const started = element.play() as Promise<void> | undefined;
        element.pause();
        element.muted = muted;
        void started?.catch(() => undefined);
      });
    },
  };
}
