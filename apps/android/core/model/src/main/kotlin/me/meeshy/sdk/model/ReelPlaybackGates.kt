package me.meeshy.sdk.model

/** La porte d'autostart partagée par les chemins audio et vidéo d'un réel (WS3.1). */
public object ReelMediaAutostart {
    public fun shouldStart(isActive: Boolean, revealCompleted: Boolean, isCallActive: Boolean): Boolean =
        isActive && revealCompleted && !isCallActive

    /** Ne (re)démarre le moteur audio que s'il ne porte pas déjà cette url (formes normalisées). */
    public fun shouldLoadAudio(currentUrl: String?, url: String): Boolean = currentUrl != url
}

/** Le temps du moteur vidéo partagé ne s'attache qu'à un réel dont le média joué est une vidéo. */
public object ReelWatchAttachmentPolicy {
    public fun shouldAttachVideoWatch(mediaType: FeedMediaType?): Boolean = mediaType == FeedMediaType.VIDEO
}

/**
 * Un réel composé se rejoue comme sa scène : la scène joue déjà son son, et le
 * moteur partagé n'est lu que s'il porte SA vidéo porteuse.
 */
public object ReelSceneRouting {
    /** Le son emprunté que la PAGE joue elle-même : jamais pour un réel à scène ou à média. */
    public fun pageOwnsBorrowedSound(hasSceneDocument: Boolean, hasPrimaryMedia: Boolean, hasTrack: Boolean): Boolean =
        !hasSceneDocument && !hasPrimaryMedia && hasTrack

    public fun attachesSharedVideoWatch(
        hasSceneDocument: Boolean,
        carrierMediaId: String?,
        loadedAttachmentId: String?,
        primaryMediaType: FeedMediaType?,
    ): Boolean {
        if (!hasSceneDocument) return ReelWatchAttachmentPolicy.shouldAttachVideoWatch(primaryMediaType)
        if (carrierMediaId == null) return false
        return loadedAttachmentId == carrierMediaId
    }
}

/** Quel profil réseau pour le fichier d'un réel, à quel palier (#11283). */
public object ReelTransferPolicy {
    public enum class Priority { IMMEDIATE, DEFERRABLE }

    public data class Profile(val priority: Priority, val allowsExpensiveNetworkAccess: Boolean)

    public fun priority(tier: ReelPreloadWindow.Tier): Priority = when (tier) {
        ReelPreloadWindow.Tier.PLAY, ReelPreloadWindow.Tier.DECODE, ReelPreloadWindow.Tier.MOUNT -> Priority.IMMEDIATE
        ReelPreloadWindow.Tier.PRIME, ReelPreloadWindow.Tier.IDLE -> Priority.DEFERRABLE
    }

    /** Play/decode/mount partent sur tout réseau ; prime/idle seulement si le réglage vidéo autorise le cellulaire. */
    public fun profile(tier: ReelPreloadWindow.Tier, videoPolicy: AutoDownloadPolicy): Profile {
        val priority = priority(tier)
        return Profile(priority, priority == Priority.IMMEDIATE || allowsCellular(videoPolicy))
    }

    private fun allowsCellular(policy: AutoDownloadPolicy): Boolean = when (policy) {
        AutoDownloadPolicy.ALWAYS, AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR -> true
        AutoDownloadPolicy.WIFI_ONLY, AutoDownloadPolicy.NEVER -> false
    }
}
