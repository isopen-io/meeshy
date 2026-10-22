package me.meeshy.sdk.model.auth

/** Un compte, sous une génération de session (miroir d'`AuthManager.SessionOwner`, #10904). */
public data class SessionOwner(val userId: String?, val generation: Long)

/**
 * Les jetons remplacés d'UNE session, en mémoire bornée. Un 401 tardif d'une requête partie
 * sous un jeton déjà renouvelé se reconnaît ici : il se rejoue sous le jeton courant au
 * lieu de relancer un renouvellement.
 */
public data class RetiredTokenRing(
    val owner: SessionOwner? = null,
    val tokens: List<String> = emptyList(),
) {
    /** `token` vient d'être remplacé dans la session [of] ; une autre session repart de zéro. */
    public fun retire(token: String, of: SessionOwner): RetiredTokenRing {
        val kept = if (owner == of) tokens else emptyList()
        return RetiredTokenRing(of, (kept + token).takeLast(RequestOwnership.RETIRED_TOKEN_MEMORY))
    }

    public fun remembers(token: String, of: SessionOwner): Boolean = owner == of && token in tokens
}

/** Ce qu'une requête en refus d'authentification a le droit de déclencher. */
public enum class OwnershipVerdict {
    /** Le jeton présenté EST celui du compte actif : le refus le vise. */
    OWNER,

    /** Jeton remplacé dans la MÊME session : rejouer sous le jeton courant, sans renouveler. */
    REPLAY_WITH_CURRENT,

    /** Autre compte, jeton retiré hors mémoire, génération périmée, bascule en cours : on ignore. */
    ABANDON,
}

/**
 * La règle de propriété d'une requête (#10904) : un refus ne s'applique qu'au compte actif,
 * sous la génération courante, et jamais pendant une bascule ou une sortie de session.
 * Loi pure, sans état — le porte-jetons et l'horloge vivent côté réseau.
 */
public object RequestOwnership {
    public const val RETIRED_TOKEN_MEMORY: Int = 8

    public fun decide(
        presentedToken: String?,
        activeToken: String?,
        current: SessionOwner,
        sentUnderGeneration: Long?,
        retired: RetiredTokenRing,
        isTransitioning: Boolean,
    ): OwnershipVerdict {
        if (isTransitioning || presentedToken.isNullOrBlank() || activeToken.isNullOrBlank()) {
            return OwnershipVerdict.ABANDON
        }
        if (sentUnderGeneration != null && sentUnderGeneration != current.generation) {
            return OwnershipVerdict.ABANDON
        }
        if (presentedToken == activeToken) return OwnershipVerdict.OWNER
        return if (retired.remembers(presentedToken, current)) {
            OwnershipVerdict.REPLAY_WITH_CURRENT
        } else {
            OwnershipVerdict.ABANDON
        }
    }
}
