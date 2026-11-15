package me.meeshy.sdk.model.signal

/** Ce que la passerelle sait du bundle du compte, vu depuis `GET /signal/keys/{moi}`. */
sealed interface RemoteBundleLookup {
    /** 404 — le compte n'a jamais publié de clés. */
    data object NotPublished : RemoteBundleLookup

    /** Le compte porte déjà un bundle. */
    data class Published(val identityKey: String, val signedPreKeyPublic: String) : RemoteBundleLookup

    /** 403 — la route refuse de se lire soi-même (aucune conversation en commun) : on ne sait pas. */
    data object SelfRouteRefused : RemoteBundleLookup

    companion object {
        fun of(bundle: SignalPreKeyBundle) = Published(bundle.identityKey, bundle.signedPreKeyPublic)
    }
}

enum class BundlePublicationDecision {
    /** Rien n'est publié : on publie. */
    PUBLISH,

    /** La passerelle porte déjà exactement ce bundle. */
    ALREADY_UP_TO_DATE,

    /** Le compte porte le bundle d'un AUTRE appareil : on ne l'écrase pas (« Chiffrement actif sur un autre appareil »). */
    OWNED_BY_ANOTHER_DEVICE,

    /** On ne peut pas lire le bundle du compte : par prudence on ne publie pas. */
    CANNOT_VERIFY,
}

/**
 * La passerelle garde UN bundle par utilisateur et fige `deviceId` à 1 : publier écrase celui d'un
 * autre appareil et casse son déchiffrement. Seule une même `identityKey` autorise l'écriture.
 */
object BundlePublicationPolicy {
    fun decide(local: SignalPreKeyBundle, remote: RemoteBundleLookup): BundlePublicationDecision = when (remote) {
        RemoteBundleLookup.NotPublished -> BundlePublicationDecision.PUBLISH
        RemoteBundleLookup.SelfRouteRefused -> BundlePublicationDecision.CANNOT_VERIFY
        is RemoteBundleLookup.Published -> when {
            remote.identityKey != local.identityKey -> BundlePublicationDecision.OWNED_BY_ANOTHER_DEVICE
            remote.signedPreKeyPublic == local.signedPreKeyPublic -> BundlePublicationDecision.ALREADY_UP_TO_DATE
            else -> BundlePublicationDecision.PUBLISH
        }
    }
}

/**
 * Faut-il rejouer une publication qui a échoué ? Les routes Signal ont un limiteur serré (5 POST et
 * 30 GET par minute) : on ne rejoue que ce qui peut changer (hors ligne, 429 après un recul d'au
 * moins [MIN_BACKOFF_SECONDS], 5xx), jamais un 4xx, jamais le refus `E2EE_UNAVAILABLE`, jamais une
 * réponse malformée, et jamais plus de [MAX_ATTEMPTS] fois.
 */
object BundlePublishRetryPolicy {
    const val MAX_ATTEMPTS: Int = 5
    const val MIN_BACKOFF_SECONDS: Long = 60

    fun shouldRetry(httpStatus: Int?, code: String?, attempt: Int): Boolean {
        if (attempt >= MAX_ATTEMPTS) return false
        return when (SignalFailure.from(httpStatus, code)) {
            SignalFailure.TRANSPORT, SignalFailure.RATE_LIMITED -> true
            SignalFailure.SERVER_UNAVAILABLE -> code != "E2EE_UNAVAILABLE"
            SignalFailure.UNKNOWN -> httpStatus != null && httpStatus >= 500
            SignalFailure.KEYS_NOT_PUBLISHED, SignalFailure.NOT_AUTHORIZED -> false
        }
    }
}
