package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Les cas témoins de `services/translator/tests/test_protected_identities.py` (#14327), rejoués sur
 * la règle de l'appareil (#14333), avec le déroulé du moteur (`TranslationShieldedBatch`).
 */
class TranslationProtectedEntitiesTest {

    private val sharedReel = "🔗 Reel de recretrait_b: https://staging.meeshy.me/l/I0tqQp"

    /** Le moteur bouchonné réécrit chaque mot hors marqueur, comme NLLB sur un pseudo. */
    private fun rewriteWords(text: String) = text.split(" ").joinToString(" ") { if ("🔹" in it) it else "«$it»" }

    /** Un moteur qui avale les marqueurs dès que la phrase en contient. */
    private fun dropMarkers(text: String) = text.split(" ").filterNot { "🔹" in it }.joinToString(" ") { "«$it»" }

    private fun protectedValues(text: String) = TranslationProtectedEntities.protect(text).entities.toSortedMap().values.toList()

    private fun roundTrip(text: String): String {
        val masked = TranslationProtectedEntities.protect(text)
        return TranslationProtectedEntities.restore(rewriteWords(masked.text), masked.entities)
    }

    private fun translate(texts: List<String>, engine: (String) -> String): Pair<List<String>, List<String>> {
        val batch = TranslationShieldedBatch(texts.mapIndexed { i, t -> TranslationShieldedBatch.Piece("$i", t) })
        val seen = batch.requests.map { it.text }.toMutableList()
        val settlement = batch.settle(batch.requests.associate { it.id to engine(it.text) })
        val served = settlement.served.toMutableMap()
        settlement.retry?.let { retry ->
            seen += retry.requests.map { it.text }
            retry.settle(retry.requests.associate { it.id to engine(it.text) }).forEach { (k, v) -> served.putIfAbsent(k, v) }
        }
        return texts.indices.map { served["$it"] ?: "∅" } to seen
    }

    @Test
    fun `the author of a share phrase is never given to the engine`() {
        listOf(
            sharedReel to "recretrait_b",
            "🔗 Réel de Jean Dupont : https://meeshy.me/l/abc" to "Jean Dupont",
            "🔗 Story by Marie: https://meeshy.me/l/abc" to "Marie",
            "🔗 Publicación de Ana López: https://meeshy.me/l/abc" to "Ana López",
            "🔗 Beitrag von Jürgen: https://meeshy.me/l/abc" to "Jürgen",
            "🔗 Storia di Luca: https://meeshy.me/l/abc" to "Luca",
            "🔗 Publicação de João: https://meeshy.me/l/abc" to "João",
            "🔗 قصة سارة: https://meeshy.me/l/abc" to "سارة",
        ).forEach { (phrase, author) ->
            val masked = TranslationProtectedEntities.protect(phrase)
            assertThat(masked.text).doesNotContain(author)
            assertThat(masked.entities.values).contains(author)
            assertThat(roundTrip(phrase).split(author)).hasSize(2)
        }
    }

    @Test
    fun `the share phrase keeps its kind to translate`() {
        assertThat(TranslationProtectedEntities.protect(sharedReel).text).contains("Reel de")
    }

    @Test
    fun `a sentence that only mentions sharing keeps its words translatable`() {
        val masked = TranslationProtectedEntities.protect("🔗 Voici le lien de la soirée : https://meeshy.me/x")
        assertThat(masked.text).contains("la soirée")
        assertThat(masked.entities.values).contains("https://meeshy.me/x")
    }

    @Test
    fun `a bare handle crosses the translation identically`() {
        listOf("recretrait_b", "jean_42", "user42", "_dark_").forEach { identity ->
            assertThat(TranslationProtectedEntities.protect("Demande à $identity demain").text).doesNotContain(identity)
            assertThat(roundTrip("Demande à $identity demain")).contains(identity)
        }
    }

    @Test
    fun `ordinary words and ordinals stay translatable`() {
        listOf("1er", "2e", "14h30", "demain").forEach { word ->
            assertThat(TranslationProtectedEntities.protect("On se voit le $word matin").text).contains(word)
        }
    }

    @Test
    fun `emails mentions and hashtags cross whole`() {
        listOf("contact@meeshy.me", "jean.dupont+tag@mail.example.org", "@recretrait_b", "#11783").forEach { entity ->
            assertThat(protectedValues("Écris à $entity ce soir.")).contains(entity)
        }
    }

    @Test
    fun `an email keeps the sentence final period outside`() {
        assertThat(protectedValues("Écris à contact@meeshy.me.")).containsExactly("contact@meeshy.me")
    }

    @Test
    fun `a CJK sentence is never taken for an emoji`() {
        assertThat(TranslationProtectedEntities.protect("你好世界").entities).isEmpty()
    }

    @Test
    fun `already masked markers stay opaque and numbering continues`() {
        val masked = TranslationProtectedEntities.protect("Voici 🔹EMOJI_3🔹 et @ami")
        assertThat(masked.entities).containsExactly(4, "@ami")
        assertThat(masked.text).isEqualTo("Voici 🔹EMOJI_3🔹 et 🔹EMOJI_4🔹")
    }

    @Test
    fun `restore tolerates spaces in a marker and never reads the value as a template`() {
        assertThat(TranslationProtectedEntities.restore("Mira 🔹 EMOJI_0 🔹", mapOf(0 to "\$1 @ami"))).isEqualTo("Mira \$1 @ami")
    }

    @Test
    fun `the shared reel reaches the reader with author and link intact`() {
        val result = translate(listOf(sharedReel), ::rewriteWords).first.single()
        assertThat(result).contains("recretrait_b")
        assertThat(result).contains("https://staging.meeshy.me/l/I0tqQp")
        assertThat(result).startsWith("🔗")
    }

    @Test
    fun `no identity is ever given to the engine`() {
        val seen = translate(listOf(sharedReel, "Écris à contact@meeshy.me ou @ami_2"), ::dropMarkers).second.joinToString()
        listOf("recretrait_b", "https://", "contact@meeshy.me", "@ami_2").forEach { assertThat(seen).doesNotContain(it) }
    }

    @Test
    fun `an address alone is served untouched without the engine`() {
        val (served, seen) = translate(listOf("https://staging.meeshy.me/l/I0tqQp")) { "«$it»" }
        assertThat(served).containsExactly("https://staging.meeshy.me/l/I0tqQp")
        assertThat(seen).isEmpty()
    }

    @Test
    fun `a translation that lost a marker falls back to translating between markers`() {
        assertThat(translate(listOf("Regarde https://a.com maintenant"), ::dropMarkers).first)
            .containsExactly("«Regarde» https://a.com «maintenant»")
    }

    @Test
    fun `a translation that altered a marker is never served`() {
        val engine = { text: String -> if ("🔹" in text) text.replace("EMOJI_0", "EMOJI_1") else "«$text»" }
        assertThat(translate(listOf("Voici @ami et @amie"), engine).first).containsExactly("«Voici» @ami «et» @amie")
    }

    @Test
    fun `the batch path falls back too`() {
        val served = translate(listOf(sharedReel, "Voici @ami", "Va sur https://a.com vite"), ::dropMarkers).first
        assertThat(served[0]).contains("recretrait_b")
        assertThat(served[0]).contains("https://staging.meeshy.me/l/I0tqQp")
        assertThat(served[1]).isEqualTo("«Voici» @ami")
        assertThat(served[2]).isEqualTo("«Va» «sur» https://a.com «vite»")
    }

    @Test
    fun `when even the fallback loses a marker the text is not served`() {
        val engine = { text: String -> if ("🔹" in text) "perdu" else "🔹EMOJI_9🔹 $text" }
        assertThat(translate(listOf("Voici @ami"), engine).first).containsExactly("∅")
    }

    @Test
    fun `a text the engine did not translate is neither served nor retried`() {
        val settlement = TranslationShieldedBatch(listOf(TranslationShieldedBatch.Piece("a", "Voici @ami"))).settle(emptyMap())
        assertThat(settlement.served).isEmpty()
        assertThat(settlement.retry).isNull()
    }
}
