package me.meeshy.sdk.model.translation

/**
 * Un lot traduit sans qu'un moteur touche aux identités (#14333) — miroir de
 * `TranslationShieldedBatch.swift` (MeeshySDK) et du déroulé de `TranslatorEngine.translate_text`
 * (translator, #14327). L'appelant donne [requests] à son moteur, remet ce qu'il a rendu à
 * [settle], puis fait de même avec `retry` s'il en reste.
 *
 * 1. un texte sans rien à traduire (une adresse seule) est servi tel quel, sans le moteur ;
 * 2. une sortie qui porte chaque marqueur est rendue avec ses entités ;
 * 3. une sortie qui en a perdu ou altéré un repart en morceaux : seul le texte libre ENTRE les
 *    marqueurs est traduit ;
 * 4. si même ce repli perd un marqueur, ou si un morceau manque, le texte n'est PAS servi :
 *    l'appelant retombe sur l'original, jamais sur une phrase qui a perdu un nom ou un lien.
 */
public class TranslationShieldedBatch(texts: List<Piece>) {

    public data class Piece(val id: String, val text: String)

    public data class Settlement(val served: Map<String, String>, val retry: Retry?)

    public class Retry internal constructor(
        public val requests: List<Piece>,
        private val shields: Map<String, Shield>,
        private val parts: Map<String, List<Part>>,
    ) {
        public fun settle(translated: Map<String, String>): Map<String, String> =
            parts.mapNotNull { (id, pieces) ->
                val shield = shields[id] ?: return@mapNotNull null
                val rendered = pieces.map { it.rendered(translated) }
                if (rendered.any { it == null }) return@mapNotNull null
                val reassembled = rendered.joinToString("") { it.orEmpty() }
                if (!TranslationProtectedEntities.placeholdersKept(shield.masked.text, reassembled)) return@mapNotNull null
                id to TranslationProtectedEntities.restore(reassembled, shield.masked.entities)
            }.toMap()
    }

    internal class Shield(val id: String, val original: String, val masked: TranslationProtectedEntities.Masked)

    internal class Part(private val text: String, private val pieceId: String) {
        private val isFree: Boolean =
            !TranslationProtectedEntities.isPlaceholder(text) && TranslationProtectedEntities.hasTranslatableText(text)

        val request: Piece? get() = if (isFree) Piece(pieceId, text.trim()) else null

        fun rendered(translated: Map<String, String>): String? {
            if (!isFree) return text
            val output = translated[pieceId] ?: return null
            return text.takeWhile { it.isWhitespace() } + output.trim() + text.takeLastWhile { it.isWhitespace() }
        }
    }

    private val shields: List<Shield> = texts.map { Shield(it.id, it.text, TranslationProtectedEntities.protect(it.text)) }
    private val translatable = shields.filter { TranslationProtectedEntities.hasTranslatableText(it.masked.text) }
    private val untouched = shields.filterNot { TranslationProtectedEntities.hasTranslatableText(it.masked.text) }
        .associate { it.id to it.original }

    /** Ce que l'appelant donne à son moteur : les textes MASQUÉS. */
    public val requests: List<Piece> = translatable.map { Piece(it.id, it.masked.text) }

    /** [translated] : ce que le moteur a rendu pour [requests]. Un texte non rendu n'est ni servi, ni repris. */
    public fun settle(translated: Map<String, String>): Settlement {
        val served = untouched.toMutableMap()
        val lost = mutableMapOf<String, Shield>()
        for (shield in translatable) {
            val output = translated[shield.id]?.takeIf { it.isNotBlank() } ?: continue
            if (TranslationProtectedEntities.placeholdersKept(shield.masked.text, output)) {
                served[shield.id] = TranslationProtectedEntities.restore(output, shield.masked.entities)
            } else {
                lost[shield.id] = shield
            }
        }
        return Settlement(served, retry(lost))
    }

    private fun retry(lost: Map<String, Shield>): Retry? {
        if (lost.isEmpty()) return null
        val parts = lost.mapValues { (id, shield) ->
            TranslationProtectedEntities.splitOnPlaceholders(shield.masked.text)
                .mapIndexed { index, part -> Part(part, "$id\u001F$index") }
        }
        val requests = parts.keys.sorted().flatMap { id -> parts.getValue(id).mapNotNull { it.request } }
        return Retry(requests, lost, parts)
    }
}
