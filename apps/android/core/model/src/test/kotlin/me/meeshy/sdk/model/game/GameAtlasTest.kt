package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.game.GameLawVectors.array
import me.meeshy.sdk.model.game.GameLawVectors.obj
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

class GameAtlasTest {

    private fun event(kind: AtlasEventKind, language: String, day: String) = AtlasEvent(kind, language, day)

    @Test
    fun `l'Atlas rejoue les vecteurs partages`() {
        GameLawVectors.cases("atlas").forEach {
            val events = it.input["events"].array().map { e ->
                val o = e.obj()
                AtlasEvent(if (o["kind"].text() == "sent") AtlasEventKind.Sent else AtlasEventKind.Received, o["language"].text(), o["dayKey"].text())
            }
            val summary = GameAtlas.summary(GameAtlas.fold(events))
            assertWithMessage(it.label).that(summary.stamped).isEqualTo(it.expected["stamped"]!!.jsonPrimitive.intOrNull)
            assertWithMessage(it.label).that(summary.total).isEqualTo(it.expected["total"]!!.jsonPrimitive.intOrNull)
            assertWithMessage(it.label).that(summary.remaining).isEqualTo(it.expected["remaining"]!!.jsonPrimitive.intOrNull)
            assertWithMessage(it.label).that(summary.stamps.map { s -> s.language to s.stampedOn })
                .isEqualTo(it.expected["stamps"].array().map { s -> s.obj()["language"].text() to s.obj()["stampedOn"].text() })
            assertWithMessage(it.label).that(summary.pending.map { p -> p.language }).isEqualTo(it.expected["pending"].array().map { p -> p.obj()["language"].text() })
        }
    }

    @Test
    fun `la langue d'un code rejoue les vecteurs partages`() {
        GameLawVectors.cases("atlas-language").forEach {
            assertWithMessage(it.label).that(GameAtlas.language(it.str("code"))).isEqualTo(it.expected["language"]?.let { l -> if (l.toString() == "null") null else l.text() })
        }
    }

    @Test
    fun `un tampon exige un message envoye ET un recu, tamponne une seule fois`() {
        val first = GameAtlas.apply(event(AtlasEventKind.Sent, "ja", "2026-10-12"), emptyMap())
        assertThat(first.stamped).isNull()
        val summaryHalf = GameAtlas.summary(first.state)
        assertThat(summaryHalf.pending.single().sent).isTrue()
        assertThat(summaryHalf.pending.single().received).isFalse()
        val second = GameAtlas.apply(event(AtlasEventKind.Received, "ja", "2026-10-13"), first.state)
        assertThat(second.stamped).isEqualTo("ja")
        val third = GameAtlas.apply(event(AtlasEventKind.Received, "ja", "2026-11-01"), second.state)
        assertThat(third.stamped).isNull()
        assertThat(third.state.getValue("ja").stampedOn).isEqualTo("2026-10-13")
    }

    @Test
    fun `un code hors catalogue n'inscrit rien et un code regional se range sous sa langue`() {
        assertThat(GameAtlas.apply(event(AtlasEventKind.Sent, "xx-ZZ", "2026-10-12"), emptyMap()).state).isEmpty()
        assertThat(GameAtlas.language("pt_BR")).isEqualTo("pt")
        assertThat(GameAtlas.language("bas")).isEqualTo("bas")
        assertThat(GameAtlas.language(null)).isNull()
    }

    @Test
    fun `les tampons se rangent du plus ancien au plus recent puis dans l'ordre du catalogue`() {
        val events = listOf("de", "fr").flatMap {
            listOf(event(AtlasEventKind.Sent, it, "2026-10-12"), event(AtlasEventKind.Received, it, "2026-10-12"))
        } + listOf(event(AtlasEventKind.Sent, "en", "2026-10-01"), event(AtlasEventKind.Received, "en", "2026-10-13"))
        assertThat(GameAtlas.summary(GameAtlas.fold(events)).stamps.map { it.language }).containsExactly("fr", "de", "en").inOrder()
    }

    @Test
    fun `l'Atlas est prive par defaut`() {
        assertThat(GameTrophies.atlasDefaultVisibility).isEqualTo(ShowcaseVisibility.Me)
    }

    @Test
    fun `le catalogue egale les langues servies par la passerelle`() {
        var dir: File? = File("").absoluteFile
        var ts: File? = null
        while (dir != null && ts == null) {
            ts = File(dir, "packages/shared/utils/language-codes.ts").takeIf { it.isFile }
            dir = dir.parentFile
        }
        assertThat(ts).isNotNull()
        val body = ts!!.readText().substringAfter("SUPPORTED_LANGUAGE_CODES = [").substringBefore("] as const")
        val served = Regex("'([a-z]+)'").findAll(body).map { it.groupValues[1] }.toList()
        assertThat(GameAtlas.catalog).containsExactlyElementsIn(served).inOrder()
        assertThat(GameAtlas.total).isEqualTo(served.size)
    }
}
