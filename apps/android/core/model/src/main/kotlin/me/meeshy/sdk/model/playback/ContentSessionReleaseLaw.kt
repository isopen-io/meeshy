package me.meeshy.sdk.model.playback

/** Pourquoi Meeshy rend la session aux autres applications. */
public enum class ContentSessionReleaseReason {
    /** Le dernier lecteur a fini : la session se rend tout de suite. */
    PlaybackEnded,

    /** L'utilisateur a mis en pause : la session ne se rend qu'après [ContentPlaybackSessionLaw.USER_PAUSE_RELEASE_DELAY_MILLIS]. */
    UserPause,

    /** Une interruption s'est terminée sans que rien ne reprenne : les lecteurs ont [ContentSessionReleaseLaw.INTERRUPTION_RESUME_GRACE_MILLIS] pour reprendre. */
    UnresumedInterruption,

    /** Le dernier détenteur part au balayage : le suivant a [ContentSessionReleaseLaw.SWIPE_HANDOVER_GRACE_MILLIS] pour prendre le relais. */
    SwipeHandover,
}

/**
 * **Meeshy rend la main** — port de iOS `ContentSessionReleaseLaw` (#11039, #11040, décision
 * porteur j du 2026-10-20).
 *
 * Quand Meeshy a mis en pause la musique d'une autre application, il lui rend la session :
 * - à la FIN de sa lecture (chaque lecteur, à son arrêt) ;
 * - après une PAUSE de l'utilisateur, au bout de [ContentPlaybackSessionLaw.USER_PAUSE_RELEASE_DELAY_MILLIS] ;
 * - après une INTERRUPTION qui ne débouche pas sur une reprise — fin sans reprise possible, ou
 *   utilisateur qui a mis en pause pendant l'appel.
 *
 * La libération est CENTRALE : à la fin d'une interruption, le coordinateur laisse aux lecteurs qui
 * reprennent le temps de [INTERRUPTION_RESUME_GRACE_MILLIS], puis rend la session si aucun n'a
 * repris. Un lecteur Meeshy qui joue encore ailleurs l'empêche, comme toute prise de session
 * survenue depuis la demande.
 */
public object ContentSessionReleaseLaw {

    /**
     * Le temps laissé aux lecteurs qui reprennent après une interruption : une reprise réactive la
     * session et annule la libération.
     */
    public const val INTERRUPTION_RESUME_GRACE_MILLIS: Long = 1_000L

    /**
     * Le temps que le dernier détenteur attend avant de désactiver la session (#9879) : au
     * balayage, le canvas qui arrive prend la session dans les images qui suivent celui qui part —
     * la désactivation s'efface, la musique des autres applications ne baisse pas puis ne remonte
     * pas.
     */
    public const val SWIPE_HANDOVER_GRACE_MILLIS: Long = 400L

    /** Le délai, en millisecondes, entre la demande de libération et son exécution. */
    public fun delayMillis(reason: ContentSessionReleaseReason): Long = when (reason) {
        ContentSessionReleaseReason.PlaybackEnded -> 0L
        ContentSessionReleaseReason.UserPause -> ContentPlaybackSessionLaw.USER_PAUSE_RELEASE_DELAY_MILLIS
        ContentSessionReleaseReason.UnresumedInterruption -> INTERRUPTION_RESUME_GRACE_MILLIS
        ContentSessionReleaseReason.SwipeHandover -> SWIPE_HANDOVER_GRACE_MILLIS
    }

    /**
     * Cet événement clôt-il une interruption — après laquelle Meeshy rend la main si rien ne
     * reprend ? L'appel Meeshy raccroché en est une ([MediaSessionEvent.CallEndedShouldResume]) ;
     * un casque débranché n'en est pas une.
     */
    public fun endsAnInterruption(event: MediaSessionEvent): Boolean = when (event) {
        MediaSessionEvent.InterruptionEndedShouldResume,
        MediaSessionEvent.InterruptionEndedShouldNotResume,
        MediaSessionEvent.CallEndedShouldResume,
        -> true

        MediaSessionEvent.InterruptionBegan,
        MediaSessionEvent.RouteChangedOldDeviceUnavailable,
        MediaSessionEvent.RouteChangedOther,
        -> false
    }

    /**
     * Une libération demandée s'exécute-t-elle ? Non si une lecture a repris la session depuis la
     * demande (une relance annule), ni si un lecteur Meeshy joue encore.
     */
    public fun mayRelease(activatedSinceRequest: Boolean, meeshyStillPlays: Boolean): Boolean =
        !activatedSinceRequest && !meeshyStillPlays
}
