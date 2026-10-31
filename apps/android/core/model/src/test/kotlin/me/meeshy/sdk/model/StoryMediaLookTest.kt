package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * #13841 : le look d'un média (format v1 d'iOS, `StoryMediaLook.swift`, spec § 3.6) — des identifiants opaques,
 * tous optionnels, absents quand ils ne peignent rien ; une lecture TOLÉRANTE (champ illisible ⇒ absent, identifiant
 * inconnu gardé).
 */
@RunWith(JUnit4::class)
class StoryMediaLookTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class Holder(
        @Serializable(with = StoryMediaLooksSerializer::class) val looks: Map<String, StoryMediaLook> = emptyMap(),
    )

    @Test
    fun `un look plein s ecrit aux noms d iOS et se relit a l identique`() {
        val look = StoryMediaLook(filterPreset = "warm", frameId = "classic:polaroid", faceEffect = "angel", framing = StoryMediaFraming(0.4, 0.6, 1.5))

        val text = json.encodeToString(StoryMediaLook.serializer(), look)

        assertThat(text).isEqualTo("""{"filterPreset":"warm","frameId":"classic:polaroid","faceEffect":"angel","framing":{"centerX":0.4,"centerY":0.6,"scale":1.5}}""")
        assertThat(json.decodeFromString(StoryMediaLook.serializer(), text)).isEqualTo(look)
    }

    @Test
    fun `le cadrage identite ne s ecrit pas`() {
        val text = json.encodeToString(StoryMediaLook.serializer(), StoryMediaLook(filterPreset = "cool", framing = StoryMediaFraming.IDENTITY))

        assertThat(text).isEqualTo("""{"filterPreset":"cool"}""")
    }

    @Test
    fun `un look neutre se normalise en absence`() {
        assertThat(StoryMediaLook().normalized).isNull()
        assertThat(StoryMediaLook(framing = StoryMediaFraming.IDENTITY).normalized).isNull()
        assertThat(StoryMediaLook(frameId = "frame:x").normalized).isEqualTo(StoryMediaLook(frameId = "frame:x"))
    }

    @Test
    fun `un champ illisible se lit absent, les autres restent`() {
        val look = json.decodeFromString(StoryMediaLook.serializer(), """{"filterPreset":12,"frameId":"frame:neon-duo","faceEffect":"","framing":{"centerX":"a"}}""")

        assertThat(look).isEqualTo(StoryMediaLook(frameId = "frame:neon-duo"))
    }

    @Test
    fun `un identifiant inconnu est garde tel quel`() {
        val look = json.decodeFromString(StoryMediaLook.serializer(), """{"filterPreset":"sepia-2027","faceEffect":"wizard"}""")

        assertThat(look.filterPreset).isEqualTo("sepia-2027")
        assertThat(look.faceEffect).isEqualTo("wizard")
    }

    @Test
    fun `une carte de looks illisible se lit vide, une entree illisible ou neutre disparait`() {
        assertThat(json.decodeFromString(Holder.serializer(), """{"looks":"oops"}""").looks).isEmpty()
        val read = json.decodeFromString(Holder.serializer(), """{"looks":{"a":{"filterPreset":"vivid"},"b":42,"c":{}}}""").looks

        assertThat(read).containsExactly("a", StoryMediaLook(filterPreset = "vivid"))
    }

    @Test
    fun `une carte de looks s ecrit sans ses entrees neutres`() {
        val text = json.encodeToString(Holder.serializer(), Holder(mapOf("a" to StoryMediaLook(faceEffect = "toad"), "b" to StoryMediaLook())))

        assertThat(text).isEqualTo("""{"looks":{"a":{"faceEffect":"toad"}}}""")
    }

    @Test
    fun `la signature est deterministe et distingue deux looks`() {
        val a = StoryMediaLook(filterPreset = "warm", framing = StoryMediaFraming(0.5, 0.25, 2.0))

        assertThat(a.signature).isEqualTo("warm|-|-|0.500,0.250,2.000")
        assertThat(StoryMediaLook(filterPreset = "cool").signature).isNotEqualTo(a.signature)
    }
}

@RunWith(JUnit4::class)
class StoryDraftSlideMediaLooksTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `un ancien brouillon sans looks se relit sans look`() {
        val old = json.decodeFromString(StoryDraftSlideSnapshot.serializer(), """{"id":"s","mediaIds":["m1"]}""")

        assertThat(old.mediaLooks).isEmpty()
    }

    @Test
    fun `les looks d une diapo font l aller retour du brouillon`() {
        val slide = StoryDraftSlideSnapshot(id = "s", mediaIds = listOf("m1"), mediaLooks = mapOf("m1" to StoryMediaLook(filterPreset = "warm", frameId = "classic:polaroid")))

        val back = json.decodeFromString(StoryDraftSlideSnapshot.serializer(), json.encodeToString(StoryDraftSlideSnapshot.serializer(), slide))

        assertThat(back).isEqualTo(slide)
    }
}
