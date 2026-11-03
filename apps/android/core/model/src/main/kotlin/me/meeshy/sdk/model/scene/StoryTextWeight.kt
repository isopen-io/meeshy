package me.meeshy.sdk.model.scene

/**
 * Le poids de police choisi par l'auteur, indépendant du style (iOS `StoryTextWeight`) : fin, normal, semi-gras, gras.
 * Absent du fil ⇒ le poids dérive du style. Une valeur inconnue d'un client plus récent se lit « absente » (`null`),
 * jamais une erreur : le texte garde le poids de son style.
 */
enum class StoryTextWeight(val wire: String, val cssWeight: Int) {
    THIN("thin", 200),
    NORMAL("normal", 400),
    SEMIBOLD("semibold", 600),
    BOLD("bold", 700),
    ;

    companion object {
        fun fromWire(raw: String?): StoryTextWeight? = entries.firstOrNull { it.wire == raw }
    }
}
