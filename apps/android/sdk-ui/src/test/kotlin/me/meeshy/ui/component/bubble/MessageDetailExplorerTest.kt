package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.LanguageInfo
import org.junit.Test

private data class ExplorerPrefs(
    override val systemLanguage: String?,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
) : LanguageResolver.ContentLanguagePreferences

private data class ExplorerTranslation(
    override val targetLanguage: String,
    override val translatedContent: String,
) : LanguageResolver.TranslationLike

class MessageDetailExplorerTest {

    private val french = ExplorerPrefs(systemLanguage = "fr")

    // A small, deterministic candidate set so ordering assertions are stable and
    // independent of the full LanguageData table.
    private val candidates = listOf(
        LanguageInfo("en", "English", "English", "🇬🇧", "6366F1"),
        LanguageInfo("fr", "French", "Francais", "🇫🇷", "3B82F6"),
        LanguageInfo("es", "Spanish", "Espanol", "🇪🇸", "EF4444"),
        LanguageInfo("de", "German", "Deutsch", "🇩🇪", "F59E0B"),
    )

    private fun build(
        originalLanguage: String? = "en",
        content: String = "Hello there",
        transcription: String? = null,
        translations: List<LanguageResolver.TranslationLike> = emptyList(),
        preferences: LanguageResolver.ContentLanguagePreferences = french,
        candidates: List<LanguageInfo> = this.candidates,
        translatingCodes: Set<String> = emptySet(),
        selectedCode: String? = null,
        previewLength: Int = 60,
    ) = MessageDetailExplorer.build(
        originalLanguage = originalLanguage,
        content = content,
        transcription = transcription,
        translations = translations,
        preferences = preferences,
        candidates = candidates,
        translatingCodes = translatingCodes,
        selectedCode = selectedCode,
        previewLength = previewLength,
    )

    @Test
    fun `the original language is surfaced as the banner and excluded from the rows`() {
        val model = build(originalLanguage = "en")

        assertThat(model.originalCode).isEqualTo("en")
        assertThat(model.originalInfo?.code).isEqualTo("en")
        assertThat(model.rows.map { it.code }).doesNotContain("en")
    }

    @Test
    fun `original banner preview is the text content when present`() {
        val model = build(content = "  Hello there  ", transcription = "ignored")

        assertThat(model.originalPreview).isEqualTo("Hello there")
    }

    @Test
    fun `original banner preview falls back to the transcription when content is blank`() {
        val model = build(content = "   ", transcription = "  spoken words  ")

        assertThat(model.originalPreview).isEqualTo("spoken words")
    }

    @Test
    fun `original banner preview is empty when neither content nor transcription exist`() {
        val model = build(content = "", transcription = null)

        assertThat(model.originalPreview).isEmpty()
    }

    @Test
    fun `configured content languages lead the rows before the remaining candidates`() {
        val prefs = ExplorerPrefs(systemLanguage = "de", regionalLanguage = "es")
        val model = build(originalLanguage = "en", preferences = prefs)

        // de, es are configured (in that order) and must precede fr (a plain candidate).
        assertThat(model.rows.map { it.code }).containsExactly("de", "es", "fr").inOrder()
    }

    @Test
    fun `a configured language absent from the candidate list still gets a row`() {
        val prefs = ExplorerPrefs(systemLanguage = "ja")
        val model = build(originalLanguage = "en", preferences = prefs)

        assertThat(model.rows.map { it.code }).contains("ja")
        assertThat(model.rows.first().code).isEqualTo("ja")
    }

    @Test
    fun `a row with a matching non-blank translation has content and a truncated preview`() {
        val long = "a".repeat(80)
        val model = build(
            translations = listOf(ExplorerTranslation("fr", long)),
            previewLength = 60,
        )

        val fr = model.rows.single { it.code == "fr" }
        assertThat(fr.hasContent).isTrue()
        assertThat(fr.preview).isEqualTo("a".repeat(60) + "…")
    }

    @Test
    fun `a preview at exactly the length boundary is not truncated`() {
        val exact = "b".repeat(60)
        val model = build(
            translations = listOf(ExplorerTranslation("fr", exact)),
            previewLength = 60,
        )

        assertThat(model.rows.single { it.code == "fr" }.preview).isEqualTo(exact)
    }

    @Test
    fun `a blank translation is treated as no content`() {
        val model = build(translations = listOf(ExplorerTranslation("fr", "   ")))

        val fr = model.rows.single { it.code == "fr" }
        assertThat(fr.hasContent).isFalse()
        assertThat(fr.preview).isNull()
    }

    @Test
    fun `a row without content has a null preview and is translatable, not retranslatable`() {
        val model = build(translations = emptyList())

        val fr = model.rows.single { it.code == "fr" }
        assertThat(fr.hasContent).isFalse()
        assertThat(fr.preview).isNull()
        assertThat(fr.canRetranslate).isFalse()
    }

    @Test
    fun `a content row that is not translating can be retranslated`() {
        val model = build(translations = listOf(ExplorerTranslation("fr", "Bonjour")))

        val fr = model.rows.single { it.code == "fr" }
        assertThat(fr.hasContent).isTrue()
        assertThat(fr.isTranslating).isFalse()
        assertThat(fr.canRetranslate).isTrue()
    }

    @Test
    fun `an in-flight translation marks the row translating and blocks retranslate`() {
        val model = build(
            translations = listOf(ExplorerTranslation("fr", "Bonjour")),
            translatingCodes = setOf("  FR  "),
        )

        val fr = model.rows.single { it.code == "fr" }
        assertThat(fr.isTranslating).isTrue()
        assertThat(fr.canRetranslate).isFalse()
    }

    @Test
    fun `the selected code marks exactly one row selected, normalized`() {
        val model = build(selectedCode = "  DE ")

        assertThat(model.rows.filter { it.isSelected }.map { it.code }).containsExactly("de")
    }

    @Test
    fun `no row is selected when the selected code is null`() {
        val model = build(selectedCode = null)

        assertThat(model.rows.none { it.isSelected }).isTrue()
    }

    @Test
    fun `the original language is matched case-insensitively and normalized`() {
        val model = build(originalLanguage = "  EN ")

        assertThat(model.originalCode).isEqualTo("en")
        assertThat(model.rows.map { it.code }).doesNotContain("en")
    }

    @Test
    fun `an unknown original code keeps its code with null metadata`() {
        val model = build(originalLanguage = "xx")

        assertThat(model.originalCode).isEqualTo("xx")
        assertThat(model.originalInfo).isNull()
    }

    @Test
    fun `a blank original language yields a null banner code and drops nothing`() {
        val model = build(originalLanguage = "   ")

        assertThat(model.originalCode).isNull()
        assertThat(model.originalInfo).isNull()
        // Nothing to exclude: every candidate becomes a row.
        assertThat(model.rows.map { it.code }).containsExactly("en", "fr", "es", "de")
    }

    @Test
    fun `duplicated candidates and configured overlaps collapse to one row each`() {
        val prefs = ExplorerPrefs(systemLanguage = "fr")
        val dupes = candidates + candidates
        val model = build(
            originalLanguage = "en",
            preferences = prefs,
            candidates = dupes,
        )

        assertThat(model.rows.map { it.code }).containsExactly("fr", "es", "de").inOrder()
    }

    @Test
    fun `translation targets are matched case-insensitively`() {
        val model = build(translations = listOf(ExplorerTranslation("FR", "Bonjour")))

        assertThat(model.rows.single { it.code == "fr" }.hasContent).isTrue()
    }

    @Test
    fun `with no candidates and empty preferences no default french row is invented`() {
        val model = build(
            originalLanguage = "en",
            preferences = ExplorerPrefs(systemLanguage = null),
            candidates = emptyList(),
        )

        assertThat(model.rows).isEmpty()
    }

    private fun buildVoice(
        audio: Map<String, String> = emptyMap(),
        attachmentId: String? = "att1",
        translations: List<LanguageResolver.TranslationLike> = emptyList(),
        selectedCode: String? = null,
        translatingCodes: Set<String> = emptySet(),
    ) = MessageDetailExplorer.build(
        originalLanguage = "en",
        content = "",
        transcription = "Hello from the voice note",
        translations = translations,
        preferences = french,
        candidates = candidates,
        translatingCodes = translatingCodes,
        selectedCode = selectedCode,
        audioTranslations = audio,
        audioAttachmentId = attachmentId,
    )

    @Test
    fun `a voice message banner carries its transcription and says so`() {
        val explorer = buildVoice()
        assertThat(explorer.originalPreview).isEqualTo("Hello from the voice note")
        assertThat(explorer.originalIsTranscription).isTrue()
        assertThat(explorer.audioAttachmentId).isEqualTo("att1")
    }

    @Test
    fun `a language with a spoken track shows its transcription and counts as audio`() {
        val row = buildVoice(audio = mapOf("FR" to "Bonjour la voix")).rows.first { it.code == "fr" }
        assertThat(row.hasAudio).isTrue()
        assertThat(row.audioPreview).isEqualTo("Bonjour la voix")
        assertThat(row.hasContent).isFalse()
        assertThat(row.canRetranslate).isFalse()
    }

    @Test
    fun `the selected card carries the full translated text and the close target`() {
        val long = "x".repeat(120)
        val explorer = build(translations = listOf(ExplorerTranslation("fr", long)), selectedCode = "fr")
        assertThat(explorer.selected?.text).isEqualTo(long)
        assertThat(explorer.selected?.code).isEqualTo("fr")
        assertThat(explorer.selected?.isAudio).isFalse()
        assertThat(explorer.rows.first { it.code == "fr" }.preview).hasLength(61)
    }

    @Test
    fun `a selected language with only a spoken track fills the card from the audio transcription`() {
        val explorer = buildVoice(audio = mapOf("es" to "Hola"), selectedCode = "es")
        assertThat(explorer.selected?.text).isEqualTo("Hola")
        assertThat(explorer.selected?.isAudio).isTrue()
    }

    @Test
    fun `no card when the selected language has nothing to show`() {
        assertThat(build(selectedCode = "fr").selected).isNull()
    }

    @Test
    fun `touching a row selects what exists, requests the voice by attachment for a voice message, else the text`() {
        val explorer = buildVoice(audio = mapOf("es" to "Hola"), translations = listOf(ExplorerTranslation("fr", "Salut")))
        fun action(code: String) = LanguageExplorerRowAction.of(explorer.rows.first { it.code == code }, explorer.audioAttachmentId)
        assertThat(action("fr")).isEqualTo(LanguageExplorerRowAction.Select)
        assertThat(action("es")).isEqualTo(LanguageExplorerRowAction.Select)
        assertThat(action("de")).isEqualTo(LanguageExplorerRowAction.RequestAudio("att1"))
        val text = build()
        assertThat(LanguageExplorerRowAction.of(text.rows.first { it.code == "de" }, text.audioAttachmentId))
            .isEqualTo(LanguageExplorerRowAction.RequestText)
    }

    @Test
    fun `a row in flight takes no new request whatever it holds`() {
        val explorer = buildVoice(translatingCodes = setOf("de"))
        assertThat(LanguageExplorerRowAction.of(explorer.rows.first { it.code == "de" }, "att1"))
            .isEqualTo(LanguageExplorerRowAction.None)
    }

    @Test
    fun `a post passes its translations in and the projection needs nothing else`() {
        val explorer = build(translations = listOf(ExplorerTranslation("fr", "Salut")))
        assertThat(explorer.rows.first { it.code == "fr" }.hasContent).isTrue()
        assertThat(explorer.audioAttachmentId).isNull()
    }
}
