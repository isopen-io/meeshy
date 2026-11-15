package me.meeshy.sdk.model

/**
 * Règle produit du badge « Transféré » (porteur, 2026-08-23) : « le forward d'un
 * message, document ne doit pas dire de qui il vient mais de quel groupe si cela
 * vient d'un groupe AU MOINS PUBLIC ».
 *
 * Liste BLANCHE, jamais noire : un type de conversation neuf côté serveur ne
 * devient pas nommable par défaut. Un type absent (ligne de cache antérieure au
 * champ), vide ou inconnu échoue FERMÉ — une règle de confidentialité ne peut pas
 * autoriser une divulgation qu'elle ne sait pas classer.
 *
 * - `public`, `global`, `broadcast`, `channel`, `community` → [ForwardAttribution.Group]
 *   (le groupe se nomme, la personne disparaît ; sans nom exploitable → anonyme).
 * - `direct`, `bot` → [ForwardAttribution.Person] (aucun groupe à nommer ; sans
 *   nom exploitable → anonyme).
 * - `group` est SOUS le seuil : `Conversation` ne porte aucune colonne de
 *   visibilité (`type` : direct, group, public, global…), donc un `group` ne peut
 *   pas être public. Il est anonyme des deux côtés — ni le groupe, ni la personne.
 * - tout autre type, y compris nul ou vide → [ForwardAttribution.Anonymous].
 *
 * Un nom vide, blanc ou égal à `?` (marqueur d'expéditeur inconnu écrit par le SDK)
 * n'est pas un nom.
 *
 * RÈGLE À TROIS MIROIRS — toute évolution touche les trois sites :
 * - iOS : `apps/ios/Meeshy/Features/Main/Views/Bubble/ForwardBadgePolicy.swift`
 * - web : `forwardAttributionOf` dans `apps/web/src/lib/view/message-badges.ts`
 * - Kotlin : ce fichier
 *
 * Sans, la bulle retombe sur le libellé générique « Transféré ». Pur et sans état.
 */
object ForwardBadgePolicy {
    /** Types atteignables au-delà d'un cercle fermé : nommer la source n'y révèle rien de privé. */
    private val PUBLICLY_REACHABLE_TYPES = setOf("public", "global", "broadcast", "channel", "community")

    /** Tête-à-tête : aucun groupe à nommer. */
    private val PEER_TYPES = setOf("direct", "bot")

    private const val UNKNOWN_SENDER_MARKER = "?"

    fun attribution(ref: ForwardReference?): ForwardAttribution {
        val type = ref?.conversationType ?: return ForwardAttribution.Anonymous
        val named: ForwardAttribution? = when (type) {
            in PUBLICLY_REACHABLE_TYPES -> nameOrNull(ref.conversationName)?.let { ForwardAttribution.Group(it) }
            in PEER_TYPES -> nameOrNull(ref.senderName)?.let { ForwardAttribution.Person(it) }
            else -> null
        }
        return named ?: ForwardAttribution.Anonymous
    }

    /**
     * Projection de [attribution] pour les surfaces qui ne savent rendre que le nom
     * d'un groupe : `null` pour [ForwardAttribution.Person] et
     * [ForwardAttribution.Anonymous], qui retombent sur le libellé générique.
     */
    fun conversationName(ref: ForwardReference?): String? =
        (attribution(ref) as? ForwardAttribution.Group)?.name

    private fun nameOrNull(value: String?): String? =
        value?.trim()?.takeUnless { it.isEmpty() || it == UNKNOWN_SENDER_MARKER }
}
