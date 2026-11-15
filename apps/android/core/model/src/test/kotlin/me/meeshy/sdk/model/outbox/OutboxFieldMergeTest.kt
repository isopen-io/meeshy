package me.meeshy.sdk.model.outbox

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Test

class OutboxFieldMergeTest {

    private fun obj(vararg pairs: Pair<String, String?>) =
        JsonObject(pairs.associate { (k, v) -> k to (v?.let(::JsonPrimitive) ?: JsonNull) })

    @Test
    fun `the newer write wins on the keys it names and the older keeps the others`() {
        val merged = OutboxFieldMerge.merge(obj("title" to "A", "description" to "d"), obj("title" to "B"))

        assertThat(merged).isEqualTo(obj("title" to "B", "description" to "d"))
    }

    @Test
    fun `an explicit null in the newer write clears the field`() {
        val merged = OutboxFieldMerge.merge(obj("avatar" to "x"), obj("avatar" to null))

        assertThat(merged["avatar"]).isEqualTo(JsonNull)
    }

    @Test
    fun `mergeAll folds from the oldest to the newest`() {
        val merged = OutboxFieldMerge.mergeAll(listOf(obj("a" to "1"), obj("a" to "2", "b" to "x"), obj("a" to "3")))

        assertThat(merged).isEqualTo(obj("a" to "3", "b" to "x"))
    }

    @Test
    fun `a settings sentinel is stable per method and endpoint and never a local id`() {
        val a = OutboxSentinelTargets.settingsAction("patch", "/me/preferences/x")

        assertThat(a).isEqualTo(OutboxSentinelTargets.settingsAction("PATCH", "me/preferences/x"))
        assertThat(a).isNotEqualTo(OutboxSentinelTargets.settingsAction("PUT", "me/preferences/x"))
        assertThat(OutboxSentinelTargets.isSentinel(a)).isTrue()
        assertThat(me.meeshy.sdk.model.ObjectIdGuard.isLocalId(a)).isFalse()
        assertThat(me.meeshy.sdk.model.ObjectIdGuard.isValid(a)).isFalse()
    }

    @Test
    fun `a read list is capped to the most recent ids without duplicates`() {
        val ids = (1..250).map { "m$it" } + "m250"

        val capped = ReadListBounds.cappedIds(ids)

        assertThat(capped).hasSize(ReadListBounds.MAX_IDS)
        assertThat(capped.last()).isEqualTo("m250")
        assertThat(capped.first()).isEqualTo("m51")
    }

    @Test
    fun `languages are trimmed lowercased deduplicated and bounded`() {
        val framed = ReadListBounds.framedLanguages(listOf(" FR", "fr", "", "en") + (1..20).map { "l$it" })

        assertThat(framed).hasSize(ReadListBounds.MAX_LANGUAGES)
        assertThat(framed.take(2)).containsExactly("fr", "en").inOrder()
    }
}
