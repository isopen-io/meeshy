package me.meeshy.sdk.model.account

/**
 * Le compte à qui appartient le cache VIVANT (#8674).
 *
 * Le cache n'a aucune colonne propriétaire : un seul compte y vit à la fois. Ce
 * marqueur dit lequel, et survit au processus — c'est ce qui permet à un démarrage
 * à froid de savoir si le contenu appartient bien au compte qui s'ouvre.
 *
 * Miroir Kotlin de iOS `CacheLiveOwner`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator+Accounts.swift`).
 */
sealed interface LiveOwner {

    /**
     * Aucun marqueur : un cache d'avant la loi, attribué au premier compte qui s'y
     * lie — le contenu n'est pas rechargé.
     */
    data object Unrecorded : LiveOwner

    /** Personne : le cache vivant est vide. */
    data object Nobody : LiveOwner

    /**
     * Une bascule a été interrompue : le contenu n'appartient à personne qu'on puisse
     * nommer, il sera effacé. Jamais servi, jamais attribué.
     */
    data object Interrupted : LiveOwner

    data class Account(val key: AccountStorageKey) : LiveOwner

    /**
     * Le marqueur à graver : `null` pour [Unrecorded] (aucune valeur), `""` pour
     * [Nobody], `"~"` pour [Interrupted], `"<hôte>\n<utilisateur>"` pour un compte.
     * Mêmes valeurs que iOS : le marqueur est un format de fichier, il ne change pas.
     */
    fun encode(): String? = when (this) {
        Unrecorded -> null
        Nobody -> NOBODY_MARKER
        Interrupted -> INTERRUPTED_MARKER
        is Account -> key.environmentHost + SEPARATOR + key.userId
    }

    companion object {
        private const val NOBODY_MARKER = ""
        private const val INTERRUPTED_MARKER = "~"
        private const val SEPARATOR = '\n'

        /**
         * Relit un marqueur gravé. Un marqueur illisible (sans séparateur, ou sans
         * identifiant) vaut [Interrupted] : dans le doute, le contenu est effacé,
         * jamais attribué. Un hôte vide reste un compte valide.
         */
        fun decode(raw: String?): LiveOwner {
            if (raw == null) return Unrecorded
            if (raw == NOBODY_MARKER) return Nobody
            if (raw == INTERRUPTED_MARKER) return Interrupted
            val separator = raw.indexOf(SEPARATOR)
            if (separator < 0) return Interrupted
            val key = AccountStorageKey.ofNormalized(
                userId = raw.substring(separator + 1),
                environmentHost = raw.substring(0, separator),
            )
            return key?.let(::Account) ?: Interrupted
        }
    }
}
