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
  /** LA PASTILLE « son coupé » du moteur (`data-scene-sound="muted"`,
   * #6901) — une affordance WEB, sans miroir Swift : elle dit « cette scène
   * SONNE et elle est muette » là où rien d'autre ne le dit. `false` en mode
   * `reel` (revue-correction #6903) parce que le lecteur des Réels porte
   * DÉJÀ ce même état sur le bouton son de son rail
   * (`reel-page.tsx#ReelRail`, glyphe `speakerSlash` + libellé « Activer le
   * son ») : deux indicateurs pour un seul état, et le second se posait
   * MESURÉ sur le compteur de partages (26×26 à 354,733 contre un bouton
   * 44×63 à 334,705). Un seul site dit le son d'un écran. */
  readonly showsMuteBadge: boolean;
};

/**
 * Les cinq lignes suivent `ScenePlayerConfig.init(mode:)` — `isMuted =
 * locksMute = mode == .card`, `loops = card || reel`, `showsChrome = reader ||
 * reel` — avec DEUX écarts DÉLIBÉRÉS, nommés ici pour qu'on ne les
 * « corrige » pas :
 * 1. `preview` est MUET. iOS l'a retiré (« aucun site — retiré le
 *    2026-08-24 », `meeshy-reader-modele.md:114-147`) ; le web l'emploie pour
 *    l'aperçu du studio (`story-compose.tsx`), où l'hôte joue DÉJÀ le son de
 *    fond qu'il élit (`electBackgroundTrack`) — un aperçu sonore le
 *    doublerait.
 * 2. `showsMuteBadge` n'existe QUE sur le web (voir son doc-comment) : il
 *    est vrai partout où le moteur est le seul à pouvoir dire le muet, faux
 *    en `reel` où le rail le dit déjà.
 */
const CONFIG: Readonly<Record<ScenePlayerMode, ScenePlayerConfig>> = {
  card: { startsPaused: true, isMuted: true, locksMute: true, loops: true, showsChrome: false, showsMuteBadge: true },
  reel: { startsPaused: true, isMuted: false, locksMute: false, loops: true, showsChrome: true, showsMuteBadge: false },
  reader: { startsPaused: true, isMuted: false, locksMute: false, loops: false, showsChrome: true, showsMuteBadge: true },
  story: { startsPaused: true, isMuted: false, locksMute: false, loops: false, showsChrome: false, showsMuteBadge: true },
  preview: { startsPaused: true, isMuted: true, locksMute: false, loops: false, showsChrome: false, showsMuteBadge: true },
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
