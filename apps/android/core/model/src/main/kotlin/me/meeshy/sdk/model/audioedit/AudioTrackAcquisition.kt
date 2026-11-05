package me.meeshy.sdk.model.audioedit

/**
 * L'ACQUISITION d'une piste — ce que « Rogner » a le droit de montrer (miroir d'`AudioTrackAcquisition`, iOS).
 * Trois cas exclusifs plutôt que deux drapeaux : « en cours » et « échoué » ne peuvent pas coexister.
 */
public enum class AudioTrackAcquisition {
    /** Rien à rapatrier : la piste est déjà locale, ou il n'y en a pas. */
    DIRECT,

    /** On rapatrie : sans fichier il n'y a rien à écouter, donc rien à viser. */
    LOADING,

    /** Le rapatriement a échoué : l'échec se DIT et se réessaie, il ne se tait pas. */
    FAILED,
}

/** Ce que la zone « Rogner » rend : une décision, pas un empilement de conditions dans l'écran. */
public enum class AudioTrimSection {
    HIDDEN, LOADING, FAILED, TRIMMER;

    public companion object {
        /**
         * L'attente et l'échec priment sur le fichier : une piste locale PÉRIMÉE peut coexister avec un
         * rapatriement en cours, et lui rendre ses poignées ferait viser un son qui ne partira pas.
         * Une durée nulle ne se découpe pas (deux poignées superposées ne se manipulent pas).
         */
        public fun resolve(acquisition: AudioTrackAcquisition, hasLocalTrack: Boolean, duration: Double): AudioTrimSection =
            when (acquisition) {
                AudioTrackAcquisition.LOADING -> LOADING
                AudioTrackAcquisition.FAILED -> FAILED
                AudioTrackAcquisition.DIRECT -> if (hasLocalTrack && duration > 0.0) TRIMMER else HIDDEN
            }
    }
}
