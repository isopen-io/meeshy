package me.meeshy.sdk.model.playback

/** Ce qu'on demande à un lecteur de contenu. */
public enum class PlaybackCommand(
    /** Cette commande FAIT SONNER quelque chose : démarrer, reprendre, ou passer à un autre contenu. */
    public val startsPlayback: Boolean,
) {
    Start(startsPlayback = true),
    Resume(startsPlayback = true),
    Pause(startsPlayback = false),
    Stop(startsPlayback = false),

    /** Passer à la piste suivante démarre un autre contenu. */
    SkipToNext(startsPlayback = true),

    /** Revenir à la piste précédente démarre un autre contenu. */
    SkipToPrevious(startsPlayback = true),
}

/** D'où vient la commande. Aucune origine n'est exemptée de la garde. */
public enum class PlaybackCommandOrigin {
    /** Un appui dans l'application (bulle, mini-lecteur, plein écran). */
    InApp,

    /** Une commande système : écran verrouillé, notification média, casque, voiture. */
    LockScreen,

    /** Une lecture automatique (apparition à l'écran, enchaînement, reprise de position). */
    Automatic,
}

/**
 * **La garde d'appel des lecteurs** — port de iOS `playbackPermissionGuard` (BUG A, round 4) et
 * de `shouldManageSession(callActive:)`.
 *
 * Un appel Meeshy actif possède la session audio (mode communication) : démarrer ou reprendre un
 * contenu volerait le micro et le haut-parleur de l'appel. La garde vit DANS le moteur, pas dans
 * l'interface : un appui sur une bulle, une commande d'écran verrouillé et une lecture automatique
 * l'empruntent tous. Elle bloque UNIQUEMENT ce qui fait sonner — la pause et l'arrêt ne sont jamais
 * gardés : couper un son est toujours permis.
 */
public object PlaybackPermissionGuard {

    /**
     * La commande est-elle permise ? Aucune [origin] n'est exemptée : une commande d'écran verrouillé
     * pendant un appel est refusée comme un appui dans l'application.
     */
    @Suppress("UNUSED_PARAMETER")
    public fun allows(command: PlaybackCommand, origin: PlaybackCommandOrigin, callActive: Boolean): Boolean =
        !(callActive && command.startsPlayback)

    /**
     * Le contenu peut-il configurer ou rendre la session ? Pas pendant un appel : elle est à lui, et
     * toucher à sa configuration couperait le micro.
     */
    public fun mayManageSession(callActive: Boolean): Boolean = !callActive
}
