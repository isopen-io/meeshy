package me.meeshy.sdk.model.pack

/** Pourquoi un pack attend : le réseau ou son tour, un réseau non restreint, ou un geste « Télécharger ». */
enum class PackQueueReason(val wire: String) {
    NETWORK("network"),
    WIFI("wifi"),
    USER("user"),
}

enum class PackFailureCause(val wire: String) {
    INTEGRITY("integrity"),
    NETWORK("network"),
    SPACE("space"),
}

/** Quand une panne se rejoue : la session suivante, au retour du réseau, ou quand la place est libérée. */
enum class PackRetryAt(val wire: String) {
    NEXT_SESSION("next-session"),
    BACKOFF("backoff"),
    SPACE_FREED("space-freed"),
}

/** La présence d'un pack sur l'appareil — miroir de `PackPresence` (`packages/shared/types/pack-presence.ts`, iOS `PackPresence.swift`). */
sealed interface PackPresence {
    /** Un cadre de ce pack peut-il se peindre ? Sinon, la carte simple. */
    val isPaintable: Boolean get() = this is Ready || this is Stale

    data object Absent : PackPresence
    data class Queued(val reason: PackQueueReason) : PackPresence
    data class Downloading(val doneBytes: Int, val totalBytes: Int) : PackPresence
    data class Ready(val version: Int) : PackPresence
    data class Stale(val version: Int, val next: Int) : PackPresence
    data class Failed(val cause: PackFailureCause, val retryAt: PackRetryAt) : PackPresence
}

enum class PackNetwork(val wire: String) {
    UNRESTRICTED("unrestricted"),

    /** Données réduites, mode économie, cellulaire. */
    CONSTRAINED("constrained"),
    OFFLINE("offline"),
}

enum class PackRemovalOrigin(val wire: String) {
    LOCAL("local"),

    /** Reçu d'un autre appareil (`pack:installation-updated`). */
    REMOTE("remote"),
}

sealed interface PackPresenceEvent {
    data object Install : PackPresenceEvent
    data class Start(val totalBytes: Int) : PackPresenceEvent
    data class Download(val totalBytes: Int) : PackPresenceEvent
    data class Progress(val doneBytes: Int) : PackPresenceEvent
    data class Complete(val version: Int) : PackPresenceEvent
    data object IntegrityError : PackPresenceEvent
    data object NetworkError : PackPresenceEvent
    data object NoSpace : PackPresenceEvent
    data object Cancel : PackPresenceEvent
    data object SpaceFreed : PackPresenceEvent
    data object SessionStart : PackPresenceEvent
    data object Retry : PackPresenceEvent
    data class Remove(val origin: PackRemovalOrigin) : PackPresenceEvent
    data object LeaseReleased : PackPresenceEvent
    data class VersionServed(val version: Int) : PackPresenceEvent
}

/** Ce que la file exécute, dans l'ordre rendu. */
enum class PackPresenceEffect(val wire: String) {
    ABORT("abort"),
    DELETE_FILE("delete-file"),
    DISCARD_PARTIAL("discard-partial"),
    PRUNE("prune"),
    PRUNE_DEFERRED("prune-deferred"),
    PRUNE_PREVIOUS("prune-previous"),
    PRUNE_PREVIOUS_DEFERRED("prune-previous-deferred"),
}

/** [lease] : un déroulé photo ou une reprise ouverts tiennent le pack ; [embedded] : pack embarqué non retirable. */
data class PackPresenceContext(
    val network: PackNetwork,
    val lease: Boolean = false,
    val embedded: Boolean = false,
)

data class PackPresenceTransition(
    val presence: PackPresence,
    val effects: List<PackPresenceEffect> = emptyList(),
)

/**
 * **La machine de présence d'un pack, pure** : sans horloge, sans réseau, sans disque. Elle rend l'état suivant et les
 * effets ORDONNÉS que la file exécute. Miroir de `PackPresenceMachine` (iOS) ; les vecteurs
 * `packages/shared/design/packs/presence-vectors.json` sont rejoués par `PackPresenceTest` — le TypeScript a raison.
 */
object PackPresenceMachine {

    fun transition(presence: PackPresence, event: PackPresenceEvent, context: PackPresenceContext): PackPresenceTransition =
        when (event) {
            PackPresenceEvent.Install ->
                if (presence == PackPresence.Absent) PackPresenceTransition(PackPresence.Queued(waiting(context.network)))
                else PackPresenceTransition(presence)
            is PackPresenceEvent.Start -> start(presence, event.totalBytes, context)
            is PackPresenceEvent.Download -> download(presence, event.totalBytes, context)
            is PackPresenceEvent.Progress -> progress(presence, event.doneBytes)
            is PackPresenceEvent.Complete -> complete(presence, event.version, context)
            PackPresenceEvent.IntegrityError ->
                failure(presence, PackFailureCause.INTEGRITY, PackRetryAt.NEXT_SESSION, listOf(PackPresenceEffect.DELETE_FILE))
            PackPresenceEvent.NetworkError -> failure(presence, PackFailureCause.NETWORK, PackRetryAt.BACKOFF, emptyList())
            PackPresenceEvent.NoSpace ->
                failure(presence, PackFailureCause.SPACE, PackRetryAt.SPACE_FREED, listOf(PackPresenceEffect.DISCARD_PARTIAL))
            PackPresenceEvent.Cancel ->
                if (presence is PackPresence.Downloading) {
                    PackPresenceTransition(
                        PackPresence.Queued(PackQueueReason.USER),
                        listOf(PackPresenceEffect.ABORT, PackPresenceEffect.DISCARD_PARTIAL),
                    )
                } else PackPresenceTransition(presence)
            PackPresenceEvent.SpaceFreed -> requeue(presence, PackFailureCause.SPACE, context)
            PackPresenceEvent.SessionStart -> requeue(presence, PackFailureCause.INTEGRITY, context)
            PackPresenceEvent.Retry ->
                if (context.network == PackNetwork.OFFLINE) PackPresenceTransition(presence)
                else requeue(presence, PackFailureCause.NETWORK, context)
            is PackPresenceEvent.Remove -> remove(presence, context)
            PackPresenceEvent.LeaseReleased ->
                if (presence == PackPresence.Absent) PackPresenceTransition(presence, listOf(PackPresenceEffect.PRUNE))
                else PackPresenceTransition(presence)
            is PackPresenceEvent.VersionServed -> versionServed(presence, event.version)
        }

    private fun waiting(network: PackNetwork): PackQueueReason =
        if (network == PackNetwork.CONSTRAINED) PackQueueReason.WIFI else PackQueueReason.NETWORK

    /** La file ne démarre rien hors ligne, ni sur réseau restreint sans geste, ni après une annulation. */
    private fun start(presence: PackPresence, totalBytes: Int, context: PackPresenceContext): PackPresenceTransition {
        if (presence !is PackPresence.Queued || presence.reason == PackQueueReason.USER) return PackPresenceTransition(presence)
        return when (context.network) {
            PackNetwork.OFFLINE -> PackPresenceTransition(presence)
            PackNetwork.CONSTRAINED -> PackPresenceTransition(PackPresence.Queued(PackQueueReason.WIFI))
            PackNetwork.UNRESTRICTED -> PackPresenceTransition(PackPresence.Downloading(0, totalBytes))
        }
    }

    /** Le geste manuel passe outre les données réduites et une annulation ; hors ligne, il attend le réseau. */
    private fun download(presence: PackPresence, totalBytes: Int, context: PackPresenceContext): PackPresenceTransition =
        when (presence) {
            PackPresence.Absent, is PackPresence.Queued, is PackPresence.Failed ->
                if (context.network == PackNetwork.OFFLINE) PackPresenceTransition(PackPresence.Queued(PackQueueReason.NETWORK))
                else PackPresenceTransition(PackPresence.Downloading(0, totalBytes))
            is PackPresence.Downloading, is PackPresence.Ready, is PackPresence.Stale -> PackPresenceTransition(presence)
        }

    private fun progress(presence: PackPresence, doneBytes: Int): PackPresenceTransition {
        if (presence !is PackPresence.Downloading) return PackPresenceTransition(presence)
        return PackPresenceTransition(PackPresence.Downloading(doneBytes.coerceIn(0, presence.totalBytes), presence.totalBytes))
    }

    private fun complete(presence: PackPresence, version: Int, context: PackPresenceContext): PackPresenceTransition =
        when (presence) {
            is PackPresence.Downloading -> PackPresenceTransition(PackPresence.Ready(version))
            is PackPresence.Stale ->
                if (context.embedded) PackPresenceTransition(PackPresence.Ready(version))
                else PackPresenceTransition(
                    PackPresence.Ready(version),
                    listOf(if (context.lease) PackPresenceEffect.PRUNE_PREVIOUS_DEFERRED else PackPresenceEffect.PRUNE_PREVIOUS),
                )
            else -> PackPresenceTransition(presence)
        }

    /** Un échec pendant une mise à jour garde la version prête, toujours peinte. */
    private fun failure(
        presence: PackPresence,
        cause: PackFailureCause,
        retryAt: PackRetryAt,
        effects: List<PackPresenceEffect>,
    ): PackPresenceTransition =
        when (presence) {
            is PackPresence.Downloading -> PackPresenceTransition(PackPresence.Failed(cause, retryAt), effects)
            is PackPresence.Stale -> PackPresenceTransition(presence, effects)
            else -> PackPresenceTransition(presence)
        }

    private fun requeue(presence: PackPresence, cause: PackFailureCause, context: PackPresenceContext): PackPresenceTransition =
        if (presence is PackPresence.Failed && presence.cause == cause) {
            PackPresenceTransition(PackPresence.Queued(waiting(context.network)))
        } else PackPresenceTransition(presence)

    /** Un pack embarqué ne se retire pas ; sous bail, l'élagage attend la fin du déroulé. */
    private fun remove(presence: PackPresence, context: PackPresenceContext): PackPresenceTransition {
        if (context.embedded || presence == PackPresence.Absent) return PackPresenceTransition(presence)
        val prune = if (context.lease) PackPresenceEffect.PRUNE_DEFERRED else PackPresenceEffect.PRUNE
        val effects = if (presence is PackPresence.Downloading) {
            listOf(PackPresenceEffect.ABORT, PackPresenceEffect.DISCARD_PARTIAL, prune)
        } else listOf(prune)
        return PackPresenceTransition(PackPresence.Absent, effects)
    }

    private fun versionServed(presence: PackPresence, served: Int): PackPresenceTransition =
        when {
            presence is PackPresence.Ready && served > presence.version ->
                PackPresenceTransition(PackPresence.Stale(presence.version, served))
            presence is PackPresence.Stale && served > presence.next ->
                PackPresenceTransition(PackPresence.Stale(presence.version, served))
            else -> PackPresenceTransition(presence)
        }
}
