package me.meeshy.sdk.model.licenses

/**
 * The AGPL-3.0 source offer (section 6) as the licenses screen serves it, because the distributed
 * app embeds libsignal (#14628): the public repository at the EXACT commit of the build, or the
 * repository alone when the build stamped no commit (local build). No commit is ever invented — a
 * value that is not a full SHA-1 is treated as absent. Mirror of the iOS `SourceOffer`.
 *
 * Compliance engineering, not legal advice: the final wording awaits the project's lawyer (#11548).
 */
public data class MeeshySourceOffer(val commit: String?) {

    val url: String get() = commit?.let { "$REPOSITORY_URL/tree/$it" } ?: REPOSITORY_URL

    val shortCommit: String? get() = commit?.take(SHORT_LENGTH)

    public companion object {
        public const val REPOSITORY_URL: String = "https://github.com/isopen-io/meeshy"
        private const val SHA1_LENGTH = 40
        private const val SHORT_LENGTH = 7

        public fun of(rawCommit: String?): MeeshySourceOffer = MeeshySourceOffer(normalizedCommit(rawCommit))

        public fun normalizedCommit(raw: String?): String? {
            val value = raw?.trim()?.lowercase() ?: return null
            return value.takeIf { it.length == SHA1_LENGTH && it.all { c -> c in '0'..'9' || c in 'a'..'f' } }
        }
    }
}
