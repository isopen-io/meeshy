package me.meeshy.sdk.model.media

/**
 * **Qui a demandé ce téléchargement** (miroir de `MediaDownloadOrigin`, iOS). Seul un téléchargement [MANUAL] — provoqué
 * par un tap — produit un retour haptique ; un téléchargement [AUTOMATIC] (politique réseau, feed, galerie,
 * préchargement) reste muet, au départ comme à la fin ou à l'échec. Chaque site DÉCLARE son origine.
 */
public enum class DownloadOrigin { MANUAL, AUTOMATIC }

/** Les retours haptiques qu'un téléchargement manuel produit — injectés pour qu'un témoin prouve le silence de l'autre. */
public enum class DownloadHaptic { LIGHT, SUCCESS, ERROR }
