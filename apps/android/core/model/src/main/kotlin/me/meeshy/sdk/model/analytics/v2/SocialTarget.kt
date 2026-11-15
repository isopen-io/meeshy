package me.meeshy.sdk.model.analytics.v2

/** Ce sur quoi porte un événement. Miroir de `TARGET_KINDS`. */
enum class SocialTargetKind(val wire: String) {
    POST("post"),
    REEL("reel"),
    STORY("story"),
    STATUS("status"),
    COMMENT("comment"),
    PROFILE("profile"),
    HASHTAG("hashtag"),
    SOUND("sound"),
    COMMUNITY("community"),
    LINK("link"),
    NOTIFICATION("notification"),
}

/** Une référence nue : le PARENT d'une cible (le post d'un commentaire, la story d'un sticker). */
data class SocialTargetRef(val kind: SocialTargetKind, val id: String)

data class SocialTarget(
    val kind: SocialTargetKind,
    val id: String,
    val parent: SocialTargetRef? = null,
) {
    val ref: SocialTargetRef get() = SocialTargetRef(kind, id)

    companion object {
        private const val HASHTAG_MAX = 100

        /** Un hashtag se nomme en minuscules, sans `#`, 100 caractères au plus. */
        fun hashtag(name: String): SocialTarget {
            val bare = name.trim().removePrefix("#")
            return SocialTarget(SocialTargetKind.HASHTAG, bare.lowercase().take(HASHTAG_MAX))
        }

        /**
         * Un lien se nomme par l'id de son lien de suivi, sinon par le DOMAINE
         * enregistrable de [host], jamais par l'URL. Nul : rien d'enregistrable.
         */
        fun link(host: String?, trackingLinkId: String? = null, parent: SocialTargetRef? = null): SocialTarget? {
            if (!trackingLinkId.isNullOrEmpty()) return SocialTarget(SocialTargetKind.LINK, trackingLinkId, parent)
            val domain = RegistrableDomain.of(host) ?: return null
            return SocialTarget(SocialTargetKind.LINK, domain, parent)
        }
    }
}

/** Le domaine enregistrable (eTLD+1) d'un hôte, miroir de `RegistrableDomain` iOS. */
object RegistrableDomain {
    private val multiLabelSuffixes = setOf(
        "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
        "com.au", "net.au", "org.au", "edu.au", "gov.au",
        "co.nz", "org.nz", "co.jp", "ne.jp", "or.jp", "ac.jp",
        "co.kr", "or.kr", "com.br", "com.ar", "com.mx", "com.co", "com.pe",
        "com.cn", "com.hk", "com.tw", "com.sg", "com.my", "com.tr", "com.ua",
        "co.in", "co.za", "co.il", "co.th", "co.id", "com.ng", "com.gh",
        "com.eg", "com.sa", "com.pk", "com.ph", "com.vn",
        "gouv.fr", "asso.fr", "co.ma", "gov.ma", "co.ke", "co.tz", "co.ug",
        "com.ci", "co.cm", "com.sn",
        "github.io", "blogspot.com", "herokuapp.com", "vercel.app", "netlify.app", "pages.dev",
    )

    fun of(rawHost: String?): String? {
        val host = rawHost?.trim('.')?.lowercase().orEmpty()
        if (host.isEmpty() || !host.contains('.') || isIpAddress(host)) return null
        val labels = host.split('.')
        val take = if (labels.takeLast(2).joinToString(".") in multiLabelSuffixes) 3 else 2
        if (labels.size < take) return null
        return labels.takeLast(take).joinToString(".")
    }

    private fun isIpAddress(host: String): Boolean {
        if (host.contains(':')) return true
        val parts = host.split('.')
        return parts.size == 4 && parts.all { part -> part.toIntOrNull()?.let { it in 0..255 } == true }
    }
}
