/**
 * LE MODE DU PLAYER (#6898, D-79) — miroir `ScenePlayerMode.swift` : le mode
 * gouverne UNIQUEMENT le son, la boucle et le chrome, JAMAIS la géométrie
 * (`fitScene`, `scene-player.tsx`, rend la MÊME boîte quel que soit le mode).
 *
 * Ce lot n'a besoin que de `card` (la tuile/page du fil, muette et
 * verrouillée) ; les quatre autres noms sont posés pour que
 * `scenes-plein-ecran` et `reels-scene` les consomment sans renommer ce
 * fichier (D-79 : « src/lib/canvas/ » est le module UNIQUE).
 */
export type ScenePlayerMode = 'card' | 'reader' | 'story' | 'preview' | 'reel';

export type ScenePlayerConfig = {
  /** Toujours vrai — `MeeshyScenePlayer` ne démarre JAMAIS seul, `isPlaying`
   * (une valeur REÇUE) décide. */
  readonly startsPaused: true;
  readonly isMuted: boolean;
  /** Le mode `card` verrouille le muet : aucun geste ne peut l'ouvrir tant
   * que la tuile n'est pas plein écran. */
  readonly locksMute: boolean;
  readonly loops: boolean;
  readonly showsChrome: boolean;
};

const CONFIG: Readonly<Record<ScenePlayerMode, ScenePlayerConfig>> = {
  card: { startsPaused: true, isMuted: true, locksMute: true, loops: true, showsChrome: false },
  reel: { startsPaused: true, isMuted: false, locksMute: false, loops: true, showsChrome: true },
  reader: { startsPaused: true, isMuted: false, locksMute: false, loops: false, showsChrome: true },
  story: { startsPaused: true, isMuted: false, locksMute: false, loops: false, showsChrome: false },
  preview: { startsPaused: true, isMuted: true, locksMute: false, loops: false, showsChrome: false },
};

export function playerConfig(mode: ScenePlayerMode): ScenePlayerConfig {
  return CONFIG[mode];
}

/**
 * `hostMute` — miroir `MeeshyScenePlayer.hostMute(config:requestedMute:)`
 * (`MeeshyScenePlayer.swift:151-158`, D5/#6901) : le mode `card` VERROUILLE le
 * muet (`locksMute`) — aucune demande d'hôte ne peut l'ouvrir tant qu'une
 * tuile n'est pas passée plein écran. Un mode qui ne verrouille pas laisse la
 * demande de l'hôte gouverner, avec le muet du mode en repli.
 */
export function hostMute(params: { readonly config: ScenePlayerConfig; readonly requestedMute: boolean | undefined }): boolean {
  const { config, requestedMute } = params;
  if (config.locksMute) return true;
  return requestedMute ?? config.isMuted;
}
