package me.meeshy.sdk.model.playback

/**
 * L'état de sortie d'un lecteur : coupé ou non, et son volume propre (jamais celui du système).
 * Port des deux lectures iOS `AVPlayer.isMuted` / `AVPlayer.volume`.
 */
public data class PlayerOutputState(
    val isMuted: Boolean,
    val volume: Float,
)

/**
 * Ce que produit, au moment où il démarre, un lecteur de CONTENU Meeshy : story et sa musique,
 * vidéo de conversation, post, réel, commentaire, humeur, message vocal, tout autre audio.
 */
public enum class ContentPlaybackAudibility {
    /** Le contenu s'entend. */
    Audible,

    /** Lecture automatique sans son (fil, bulle inline coupée, story muette). */
    Muted,
    ;

    public companion object {
        /**
         * Ce que produit un lecteur à cet instant : absent, coupé ou à volume nul (ou indéfini), il
         * ne s'entend pas.
         */
        public fun of(output: PlayerOutputState?): ContentPlaybackAudibility {
            if (output == null || output.isMuted) return Muted
            return if (output.volume > 0f) Audible else Muted
        }
    }
}

/** Ce que la session partagée doit devenir pour ce contenu. */
public enum class ContentPlaybackSessionDirective(
    /** La catégorie que la directive pose, ou `null` quand elle laisse la session telle qu'elle est. */
    public val category: SessionCategory?,
) {
    /**
     * Lecture NON mélangeable, activée : Meeshy joue seul, la musique des autres applications se
     * met en pause, et Meeshy devient interruptible par elles (focus audio exclusif).
     */
    ActivatePlayback(SessionCategory.Playback),

    /**
     * Catégorie ambiante posée SANS activer le focus : un lecteur démarré en muet ne doit pas
     * mettre Spotify en pause pour une image muette.
     */
    ConfigureAmbientWithoutActivating(SessionCategory.Ambient),

    /** Rien à changer : un contenu audible de Meeshy tient déjà la session. */
    LeaveSessionAlone(null),
}

/**
 * **La loi UNIQUE « rôle de lecture → session »** — port de iOS `ContentPlaybackSessionLaw`
 * (#11039).
 *
 * Décision porteur du 2026-10-19 : dès que Meeshy lance un son, quelle que soit la surface, la
 * musique des autres applications se met en PAUSE — plus de baisse de volume, plus de mélange. Une
 * session mélangeable n'est jamais interrompue par l'audio d'une autre application : les deux
 * joueraient l'un sur l'autre.
 *
 * Une vidéo muette ne touche pas la musique des autres applications : elle ne demande aucun focus,
 * et sa catégorie reste mélangeable tant qu'aucun son de Meeshy ne tient la session. Lever le son
 * d'une vidéo muette est « lancer un son » : c'est une nouvelle demande en [ContentPlaybackAudibility.Audible].
 *
 * Hors de cette loi, par construction : l'appel (session de communication), la sonnerie de retour
 * et la timeline du composer, qui porte sa propre piste.
 */
public object ContentPlaybackSessionLaw {

    /** Le mélange d'une lecture audible : aucun. Non mélangeable. */
    public val AUDIBLE_MIXING: SessionMixing = SessionMixing.NonMixable

    /**
     * Après une pause de l'utilisateur, la session n'est rendue qu'au bout de ce délai : une courte
     * pause ne fait pas repartir la musique des autres applications, et une relance dans
     * l'intervalle annule la libération.
     */
    public const val USER_PAUSE_RELEASE_DELAY_MILLIS: Long = 3_000L

    public fun directive(
        audibility: ContentPlaybackAudibility,
        audibleContentHoldsSession: Boolean,
    ): ContentPlaybackSessionDirective = when (audibility) {
        ContentPlaybackAudibility.Audible -> ContentPlaybackSessionDirective.ActivatePlayback
        ContentPlaybackAudibility.Muted ->
            if (audibleContentHoldsSession) {
                ContentPlaybackSessionDirective.LeaveSessionAlone
            } else {
                ContentPlaybackSessionDirective.ConfigureAmbientWithoutActivating
            }
    }
}
