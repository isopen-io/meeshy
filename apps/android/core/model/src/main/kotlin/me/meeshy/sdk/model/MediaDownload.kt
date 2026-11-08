package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Media auto-download SSOTs (feature-parity §L) — a verbatim port of the iOS
 * `MediaDownloadPreferences` / `MediaDownloadPolicyEngine` / `NetworkConditionMonitor`
 * pure logic. Everything here is a stateless building block with opaque parameters:
 * the durable store lives in `:sdk-core`, the live network monitor is a thin glue
 * layer over [NetworkConditionResolver], and the settings orchestration is in
 * `:feature:settings`.
 */

/** Auto-download policy for a media type given the network state — port of iOS `AutoDownloadPolicy`. */
@Serializable
public enum class AutoDownloadPolicy {
    @SerialName("always") ALWAYS,
    @SerialName("wifiAndGoodCellular") WIFI_AND_GOOD_CELLULAR,
    @SerialName("wifiOnly") WIFI_ONLY,
    @SerialName("never") NEVER,
}

/** The media type a policy applies to — port of iOS `MediaKind`. */
@Serializable
public enum class MediaKind {
    @SerialName("image") IMAGE,
    @SerialName("audio") AUDIO,
    @SerialName("audioTranslation") AUDIO_TRANSLATION,
    @SerialName("video") VIDEO,
}

/** Resolved network state — port of iOS `NetworkCondition`. */
@Serializable
public enum class NetworkCondition {
    @SerialName("offline") OFFLINE,
    @SerialName("badCellular") BAD_CELLULAR,
    @SerialName("goodCellular") GOOD_CELLULAR,
    @SerialName("wifi") WIFI,
}

/**
 * One [AutoDownloadPolicy] per media type — port of iOS `MediaDownloadPreferences`.
 * Defaults mirror iOS: images/audio ride good cellular, heavier audio-translations and
 * video stay on Wi-Fi.
 */
@Serializable
public data class MediaDownloadPreferences(
    val image: AutoDownloadPolicy = AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR,
    val audio: AutoDownloadPolicy = AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR,
    val audioTranslation: AutoDownloadPolicy = AutoDownloadPolicy.WIFI_ONLY,
    val video: AutoDownloadPolicy = AutoDownloadPolicy.WIFI_ONLY,
) {
    /** The policy configured for [kind]. */
    public fun policy(kind: MediaKind): AutoDownloadPolicy = when (kind) {
        MediaKind.IMAGE -> image
        MediaKind.AUDIO -> audio
        MediaKind.AUDIO_TRANSLATION -> audioTranslation
        MediaKind.VIDEO -> video
    }

    /** A copy with exactly [kind]'s policy set to [policy], every other kind untouched. */
    public fun withPolicy(kind: MediaKind, policy: AutoDownloadPolicy): MediaDownloadPreferences =
        when (kind) {
            MediaKind.IMAGE -> copy(image = policy)
            MediaKind.AUDIO -> copy(audio = policy)
            MediaKind.AUDIO_TRANSLATION -> copy(audioTranslation = policy)
            MediaKind.VIDEO -> copy(video = policy)
        }
}

/**
 * Pure auto-download decision — port of iOS `MediaDownloadPolicyEngine`. The output is a
 * function of the inputs only (a 4×4 truth table, the offline gate and the small-media
 * threshold); no I/O, no state.
 *
 * **Under [SMALL_MEDIA_AUTO_DOWNLOAD_BYTES], an image or a video downloads by itself, whatever
 * the network and the per-kind preference** (#14639, directive porteur 2026-11-02): only offline
 * stops it. Mirror of `SMALL_MEDIA_AUTO_DOWNLOAD_BYTES` (`packages/shared`) and of the Swift
 * constant. An unknown, zero or negative size proves nothing and falls back to the policy.
 */
public object MediaDownloadPolicyEngine {

    /** 100 Ko : sous ce poids, une image ou une vidéo se télécharge seule dès que l'appareil est en ligne. */
    public const val SMALL_MEDIA_AUTO_DOWNLOAD_BYTES: Long = 102_400L

    public fun shouldAutoDownload(
        kind: MediaKind,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences,
        sizeBytes: Long? = null,
    ): Boolean {
        if (condition == NetworkCondition.OFFLINE) return false
        if (isSmallVisualMedia(kind, sizeBytes)) return true
        return when (prefs.policy(kind)) {
            AutoDownloadPolicy.NEVER -> false
            AutoDownloadPolicy.ALWAYS -> true
            AutoDownloadPolicy.WIFI_ONLY -> condition == NetworkCondition.WIFI
            AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR ->
                condition == NetworkCondition.WIFI || condition == NetworkCondition.GOOD_CELLULAR
        }
    }

    /** Une image ou une vidéo de taille CONNUE, strictement sous le seuil. */
    public fun isSmallVisualMedia(kind: MediaKind, sizeBytes: Long?): Boolean =
        (kind == MediaKind.IMAGE || kind == MediaKind.VIDEO) &&
            sizeBytes != null && sizeBytes in 1 until SMALL_MEDIA_AUTO_DOWNLOAD_BYTES
}

/**
 * Pure resolution of a [NetworkCondition] from connectivity flags — port of iOS
 * `NetworkConditionMonitor.resolveFromFlags`. Flag-driven so the live monitor (which maps
 * Android `NetworkCapabilities` onto these booleans) stays a thin, untestable-glue shim over
 * a fully-tested SSOT. iOS's unused `isExpensive` argument is intentionally dropped.
 */
public object NetworkConditionResolver {
    public fun resolveFromFlags(
        isSatisfied: Boolean,
        isConstrained: Boolean,
        usesWifi: Boolean,
        usesCellular: Boolean,
    ): NetworkCondition {
        if (!isSatisfied) return NetworkCondition.OFFLINE
        if (usesWifi && !isConstrained) return NetworkCondition.WIFI
        if (usesCellular) {
            return if (isConstrained) NetworkCondition.BAD_CELLULAR else NetworkCondition.GOOD_CELLULAR
        }
        return if (isConstrained) NetworkCondition.BAD_CELLULAR else NetworkCondition.WIFI
    }
}
