package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class PreferenceCategoryCodecsTest {

    private fun parse(raw: String): JsonElement = Json.parseToJsonElement(raw)

    private val newerServerKey = """"holographicMode":{"depth":3,"tint":"#fff"}"""

    @Test
    fun `audio keeps an unknown key through a decode then snapshot round trip`() {
        val codec = PreferenceCategoryCodecs.audio
        val block = codec.decode(parse("""{"ttsSpeed":1.5,$newerServerKey}"""))

        val sent = codec.snapshot(block)

        assertThat(block.ttsSpeed).isEqualTo(1.5)
        assertThat(sent["holographicMode"]).isEqualTo(parse("""{"depth":3,"tint":"#fff"}"""))
        assertThat(sent.keys).doesNotContain("extras")
        assertThat(sent["ttsSpeed"]).isEqualTo(JsonPrimitive(1.5))
    }

    @Test
    fun `message keeps an unknown key and the full snapshot carries every declared field`() {
        val codec = PreferenceCategoryCodecs.message
        val block = codec.decode(parse("""{"sendOnEnter":false,$newerServerKey}"""))

        val sent = codec.snapshot(block)

        assertThat(block.sendOnEnter).isFalse()
        assertThat(sent["holographicMode"]).isNotNull()
        assertThat(sent["maxCharacterLimit"]).isEqualTo(JsonPrimitive(5000))
        assertThat(sent["sendOnEnter"]).isEqualTo(JsonPrimitive(false))
    }

    @Test
    fun `video keeps an unknown key and an unknown enum falls back to its default alone`() {
        val codec = PreferenceCategoryCodecs.video
        val block = codec.decode(parse("""{"videoCodec":"AV2","mirrorLocalVideo":false,$newerServerKey}"""))

        assertThat(block.videoCodec).isEqualTo(VideoCodec.VP8)
        assertThat(block.mirrorLocalVideo).isFalse()
        assertThat(codec.snapshot(block)["holographicMode"]).isNotNull()
    }

    @Test
    fun `document keeps an unknown key and an unknown list item is dropped alone`() {
        val codec = PreferenceCategoryCodecs.document
        val block = codec.decode(parse("""{"allowedFileTypes":["pdf",7,"png"],"autoDownloadMaxSize":25,$newerServerKey}"""))

        assertThat(block.allowedFileTypes).containsExactly("pdf", "png").inOrder()
        assertThat(block.autoDownloadMaxSize).isEqualTo(25)
        assertThat(codec.snapshot(block)["holographicMode"]).isNotNull()
    }

    @Test
    fun `application keeps an unknown key but never sends a consent stamp`() {
        val codec = PreferenceCategoryCodecs.application
        val block = codec.decode(
            parse("""{"theme":"dark","voiceDataConsentAt":"2026-10-01T00:00:00Z","fontSize":"huge",$newerServerKey}"""),
        )

        val sent = codec.snapshot(block)

        assertThat(block.theme).isEqualTo(AppThemeMode.DARK)
        assertThat(block.fontSize).isEqualTo(FontSize.MEDIUM)
        assertThat(block.voiceDataConsentAt).isEqualTo("2026-10-01T00:00:00Z")
        assertThat(sent["holographicMode"]).isNotNull()
        assertThat(sent.keys.filter { it.endsWith("ConsentAt") || it == "voiceCloningEnabledAt" }).isEmpty()
    }

    @Test
    fun `the stored token keeps the consent stamps and the unknown keys through a restart`() {
        val codec = PreferenceCategoryCodecs.application
        val block = codec.decode(parse("""{"dataProcessingConsentAt":"2026-10-02T00:00:00Z",$newerServerKey}"""))

        val reread = codec.fromStorage(codec.storageValue(block))

        assertThat(reread).isEqualTo(block)
        assertThat(reread.dataProcessingConsentAt).isEqualTo("2026-10-02T00:00:00Z")
    }

    @Test
    fun `a snapshot decoded again is the same block for each category`() {
        val raw = parse("""{$newerServerKey}""")
        assertThat(PreferenceCategoryCodecs.audio.let { it.decode(it.snapshot(it.decode(raw))) })
            .isEqualTo(PreferenceCategoryCodecs.audio.decode(raw))
        assertThat(PreferenceCategoryCodecs.message.let { it.decode(it.snapshot(it.decode(raw))) })
            .isEqualTo(PreferenceCategoryCodecs.message.decode(raw))
        assertThat(PreferenceCategoryCodecs.video.let { it.decode(it.snapshot(it.decode(raw))) })
            .isEqualTo(PreferenceCategoryCodecs.video.decode(raw))
        assertThat(PreferenceCategoryCodecs.document.let { it.decode(it.snapshot(it.decode(raw))) })
            .isEqualTo(PreferenceCategoryCodecs.document.decode(raw))
    }

    @Test
    fun `a blank or corrupt token and a non-object body are the defaults`() {
        assertThat(PreferenceCategoryCodecs.message.fromStorage(null)).isEqualTo(MessagePreferences())
        assertThat(PreferenceCategoryCodecs.video.fromStorage("{nope")).isEqualTo(VideoPreferences())
        assertThat(PreferenceCategoryCodecs.document.decode(JsonPrimitive("x"))).isEqualTo(DocumentPreferences())
        assertThat(PreferenceCategoryCodecs.audio.decode(null)).isEqualTo(AudioPreferences())
    }

    @Test
    fun `a declared key wins over an extras entry of the same name`() {
        val codec = PreferenceCategoryCodecs.message
        val block = MessagePreferences(sendOnEnter = false, extras = mapOf("sendOnEnter" to JsonPrimitive(true)))

        assertThat(codec.snapshot(block).jsonObject["sendOnEnter"]).isEqualTo(JsonPrimitive(false))
    }

    @Test
    fun `each codec knows its route category`() {
        assertThat(PreferenceCategoryCodecs.audio.category).isEqualTo(PreferenceCategory.AUDIO)
        assertThat(PreferenceCategoryCodecs.message.category).isEqualTo(PreferenceCategory.MESSAGE)
        assertThat(PreferenceCategoryCodecs.video.category).isEqualTo(PreferenceCategory.VIDEO)
        assertThat(PreferenceCategoryCodecs.document.category).isEqualTo(PreferenceCategory.DOCUMENT)
        assertThat(PreferenceCategoryCodecs.application.category).isEqualTo(PreferenceCategory.APPLICATION)
    }

}
