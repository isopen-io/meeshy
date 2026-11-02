package me.meeshy.sdk.model.media

/**
 * Une borne de proportion ne se pose que sur un ratio MESURÉ : sur une vidéo, la vraie valeur
 * arrive après que l'objet est posé, et un 9:16 calculé contre le repli rendrait un cadre faux
 * qui a l'air d'un choix délibéré. On refuse (en le disant) plutôt que d'attendre.
 */
public object MediaCropReadiness {

    public fun ratioPadsMayAct(measuredAspectRatio: Double?): Boolean =
        measuredAspectRatio != null && measuredAspectRatio.isFinite() && measuredAspectRatio > 0.0

    /** `LIBRE` reste offert sans mesure : il ne calcule rien et seul il défait un recadrage. */
    public fun mayAct(ratio: MediaCropRatio, measuredAspectRatio: Double?): Boolean =
        ratio.value == null || ratioPadsMayAct(measuredAspectRatio)
}
