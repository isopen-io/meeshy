package me.meeshy.sdk.model

/**
 * The media-pipeline decision layer over [MediaDownloadPolicyEngine] (feature-parity §L).
 *
 * [MediaDownloadPolicyEngine] answers the *policy* question ("does the user's per-kind
 * preference permit this media type on the current network?"). A real media view has more
 * gates than that: the attachment might already be on disk, a download might already be
 * running, or the type might be one we never auto-fetch. [MediaAutoDownloadDecider] folds
 * those availability gates over the policy truth table so a Compose media view only has to
 * ask one question — "should I start this download?" — and paint the reason.
 *
 * Everything here is a stateless building block with opaque parameters. The live network
 * condition comes from `NetworkConditionMonitor` (`:sdk-core`), the persisted preferences
 * from `MediaDownloadPreferencesStore` (`:sdk-core`); "when to read them / when to actually
 * kick the download" is product orchestration and stays app-side.
 */

/** Whether an attachment's bytes are already local — port of the iOS `AudioAvailability` states. */
public enum class MediaAvailability {
    /** Cached on disk or a local `file://` that exists — nothing to fetch. */
    AVAILABLE,

    /** A download for this attachment is already running — must not be started twice. */
    DOWNLOADING,

    /** Not local and no download running — a candidate for the auto-download policy. */
    NEEDS_DOWNLOAD,
}

/** The outcome of the auto-download decision, carrying *why* so the UI can explain itself. */
public enum class AutoDownloadDecision {
    /** Start the download now. */
    DOWNLOAD,

    /** The media type is not one we auto-fetch (or is unclassifiable). */
    SKIP_UNSUPPORTED,

    /** Already on disk — nothing to do. */
    SKIP_ALREADY_AVAILABLE,

    /** A download is already in flight — do not start another. */
    SKIP_IN_FLIGHT,

    /** The per-kind preference forbids it on the current network (incl. offline). */
    SKIP_POLICY;

    /** The single actionable outcome: only [DOWNLOAD] triggers a fetch. */
    public val shouldDownload: Boolean get() = this == DOWNLOAD
}

/**
 * Classifies a wire MIME type into the [MediaKind] the auto-download policy applies to.
 * The bridge between an attachment's `mimeType` and the [MediaDownloadPolicyEngine] table.
 *
 * The MIME is parsed defensively: any structured parameter after `;` is dropped, the type is
 * trimmed and case-folded (MIME types are case-insensitive), and anything that is not an
 * `image/…`, `video/…` or `audio/…` — a document, a blank/absent type, or a bare top-level
 * token with no subtype — is unclassifiable (`null`) so it is never auto-downloaded on the
 * user's data.
 */
public object MediaKindClassifier {
    public fun fromMimeType(mimeType: String?, isAudioTranslation: Boolean = false): MediaKind? {
        val normalized = mimeType?.substringBefore(';')?.trim()?.lowercase()
        if (normalized.isNullOrEmpty()) return null
        return when {
            normalized.startsWith("image/") -> MediaKind.IMAGE
            normalized.startsWith("video/") -> MediaKind.VIDEO
            normalized.startsWith("audio/") ->
                if (isAudioTranslation) MediaKind.AUDIO_TRANSLATION else MediaKind.AUDIO
            else -> null
        }
    }
}

/**
 * The first media-pipeline consumer of [MediaDownloadPolicyEngine] — a pure state machine
 * that layers the availability gates over the policy truth table. Port of the guard chain
 * iOS inlines in `ConversationMediaViews`'s auto-download `.task`.
 */
public object MediaAutoDownloadDecider {

    /**
     * Decide whether to auto-download an attachment of [kind] whose bytes are in the
     * [availability] state, given the live [condition] and the user's [prefs].
     *
     * A `null` [kind] (unclassifiable/unsupported media) short-circuits to
     * [AutoDownloadDecision.SKIP_UNSUPPORTED] before any network is considered.
     */
    public fun decide(
        kind: MediaKind?,
        availability: MediaAvailability,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences,
    ): AutoDownloadDecision {
        if (kind == null) return AutoDownloadDecision.SKIP_UNSUPPORTED
        return when (availability) {
            MediaAvailability.AVAILABLE -> AutoDownloadDecision.SKIP_ALREADY_AVAILABLE
            MediaAvailability.DOWNLOADING -> AutoDownloadDecision.SKIP_IN_FLIGHT
            MediaAvailability.NEEDS_DOWNLOAD ->
                if (MediaDownloadPolicyEngine.shouldAutoDownload(kind, condition, prefs)) {
                    AutoDownloadDecision.DOWNLOAD
                } else {
                    AutoDownloadDecision.SKIP_POLICY
                }
        }
    }

    /** [decide] with the [kind] resolved from a wire [mimeType] via [MediaKindClassifier]. */
    public fun decideFor(
        mimeType: String?,
        isAudioTranslation: Boolean,
        availability: MediaAvailability,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences,
    ): AutoDownloadDecision = decide(
        kind = MediaKindClassifier.fromMimeType(mimeType, isAudioTranslation),
        availability = availability,
        condition = condition,
        prefs = prefs,
    )
}
