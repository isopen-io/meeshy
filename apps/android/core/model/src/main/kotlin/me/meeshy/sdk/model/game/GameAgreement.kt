package me.meeshy.sdk.model.game

/**
 * L'accord du jeu. MIROIR de `GameCopy.isSingular` (iOS) et de `isSingular`
 * du web : l'accord ne passe jamais par un `== 1` isolé, il sait que le
 * français et le portugais lisent zéro au singulier (« 0 point »).
 *
 * L'accord se choisit sur l'ENTIER, jamais sur le texte déjà formaté.
 */
public object GameAgreement {

    private val zeroIsSingular: Set<String> = setOf("fr", "pt")

    /** [languageCode] est le code de langue seul (« fr », « pt », « en »…), `null` quand il est inconnu. */
    public fun isSingular(count: Int, languageCode: String?): Boolean {
        if (count == 1) return true
        return count == 0 && languageCode != null && languageCode.lowercase() in zeroIsSingular
    }
}
