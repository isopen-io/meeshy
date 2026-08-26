package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * One-for-one mirror of `packages/shared/__tests__/utils/resolve-last-message-preview.test.ts`
 * and of `ConversationPrismeResolutionTests.swift` (iOS). The three clients render the
 * SAME row from the SAME REST payload, so a divergence here shows one account two
 * different texts depending on which app it is read from.
 *
 * Critical Prisme rule #3: never fall back to an arbitrary translation.
 */
class LastMessagePreviewResolverTest {

    private fun resolve(
        preview: String?,
        translations: Map<String, String>? = null,
        originalLanguage: String? = null,
        preferredLanguages: List<String>,
    ): String? = resolveLastMessagePreview(
        preview = preview,
        translations = translations,
        originalLanguage = originalLanguage,
        preferredLanguages = preferredLanguages,
    )

    // ── No translations attached ────────────────────────────────────────────────

    @Test
    fun `raw preview when the map is absent`() {
        assertThat(resolve("Hello", preferredLanguages = listOf("fr"))).isEqualTo("Hello")
    }

    @Test
    fun `raw preview when the map is empty`() {
        assertThat(resolve("Hello", translations = emptyMap(), preferredLanguages = listOf("fr")))
            .isEqualTo("Hello")
    }

    @Test
    fun `null when there is no preview at all`() {
        assertThat(resolve(null, preferredLanguages = listOf("fr"))).isNull()
    }

    // ── A match inside the prism ────────────────────────────────────────────────

    @Test
    fun `serves the primary language translation when it exists`() {
        assertThat(
            resolve(
                "Hello",
                translations = mapOf("fr" to "Bonjour", "es" to "Hola"),
                originalLanguage = "en",
                preferredLanguages = listOf("fr", "es"),
            )
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `descends to the next prism language when the primary has none`() {
        assertThat(
            resolve(
                "Hello",
                translations = mapOf("es" to "Hola"),
                originalLanguage = "en",
                preferredLanguages = listOf("de", "es"),
            )
        ).isEqualTo("Hola")
    }

    @Test
    fun `honours the prism ORDER, not the map key order`() {
        // The map enumerates `es` before `fr`; the reader prefers `fr`. A resolver
        // iterating the map instead of the reader's languages would serve "Hola" — and
        // nobody would see it on a single-entry map.
        assertThat(
            resolve(
                "Hello",
                translations = linkedMapOf("es" to "Hola", "fr" to "Bonjour"),
                originalLanguage = "en",
                preferredLanguages = listOf("fr", "es"),
            )
        ).isEqualTo("Bonjour")
    }

    // ── The original language competes at its own RANK ──────────────────────────

    @Test
    fun `raw preview when the message already IS in a reader language`() {
        assertThat(
            resolve(
                "Bonjour",
                translations = mapOf("en" to "Hello"),
                originalLanguage = "fr",
                preferredLanguages = listOf("fr"),
            )
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `prefers the PRIMARY language translation over an original written in a secondary`() {
        // Reader `[de, fr]`, French message, German translation available. The original
        // language competes at ITS rank (2nd): German (rank 1) wins. A membership
        // formulation — "the original language is somewhere in the prism ⇒ the
        // original" — would serve "Bonjour" and demote the reader's primary language.
        assertThat(
            resolve(
                "Bonjour",
                translations = mapOf("de" to "Guten Tag"),
                originalLanguage = "fr",
                preferredLanguages = listOf("de", "fr"),
            )
        ).isEqualTo("Guten Tag")
    }

    @Test
    fun `stops at the original language without looking lower`() {
        assertThat(
            resolve(
                "Guten Tag",
                translations = mapOf("fr" to "Bonjour"),
                originalLanguage = "de",
                preferredLanguages = listOf("de", "fr"),
            )
        ).isEqualTo("Guten Tag")
    }

    // ── The device locale never supersedes an in-app preference ─────────────────

    @Test
    fun `serves French to a French speaker whose phone is in English`() {
        assertThat(
            resolve(
                "Hello everyone",
                translations = mapOf("fr" to "Bonjour à tous"),
                originalLanguage = "en",
                preferredLanguages = listOf("fr", "en"),
            )
        ).isEqualTo("Bonjour à tous")
    }

    @Test
    fun `lets the device locale serve ONLY when the in-app language has nothing`() {
        assertThat(
            resolve(
                "Hello everyone",
                translations = mapOf("es" to "Hola a todos"),
                originalLanguage = "en",
                preferredLanguages = listOf("fr", "en"),
            )
        ).isEqualTo("Hello everyone")
    }

    // ── Never fall back to an arbitrary translation ─────────────────────────────

    @Test
    fun `serves the original rather than a language outside the prism`() {
        assertThat(
            resolve(
                "Hello",
                translations = mapOf("es" to "Hola"),
                originalLanguage = "en",
                preferredLanguages = listOf("fr", "de"),
            )
        ).isEqualTo("Hello")
    }

    @Test
    fun `raw preview when the reader has no configured language`() {
        assertThat(
            resolve("Hello", translations = mapOf("fr" to "Bonjour"), preferredLanguages = emptyList())
        ).isEqualTo("Hello")
    }

    @Test
    fun `ignores a blank translation instead of blanking the row`() {
        assertThat(
            resolve(
                "Hello",
                translations = mapOf("fr" to "   "),
                originalLanguage = "en",
                preferredLanguages = listOf("fr"),
            )
        ).isEqualTo("Hello")
    }

    // ── Case insensitivity ──────────────────────────────────────────────────────

    @Test
    fun `matches a reader language written in upper case`() {
        assertThat(
            resolve("Hello", translations = mapOf("fr" to "Bonjour"), preferredLanguages = listOf("FR"))
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `matches a map KEY written in upper case`() {
        assertThat(
            resolve("Hello", translations = mapOf("FR" to "Bonjour"), preferredLanguages = listOf("fr"))
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `recognises an original language written in upper case`() {
        assertThat(
            resolve(
                "Bonjour",
                translations = mapOf("en" to "Hello"),
                originalLanguage = "FR",
                preferredLanguages = listOf("fr"),
            )
        ).isEqualTo("Bonjour")
    }

    // ── A region-tagged original competes at its NORMALISED rank ────────────────

    @Test
    fun `serves the original when the message is already in the PRIMARY language, region-tagged`() {
        // Reader `[en, fr]`. English message tagged `en-US`, French translation
        // available (rank 2). Compared in lowercase alone, `en` never matched `en-us`
        // and the French of rank 2 won — demoting the reader's primary language.
        assertThat(
            resolve(
                "Hello everyone",
                translations = mapOf("fr" to "Bonjour à tous"),
                originalLanguage = "en-US",
                preferredLanguages = listOf("en", "fr"),
            )
        ).isEqualTo("Hello everyone")
    }

    @Test
    fun `stops at a region-tagged original without serving a lower rank`() {
        assertThat(
            resolve(
                "Olá pessoal",
                translations = mapOf("en" to "Hello everyone"),
                originalLanguage = "pt-BR",
                preferredLanguages = listOf("pt", "en"),
            )
        ).isEqualTo("Olá pessoal")
    }

    @Test
    fun `matches a region-tagged translation KEY against the reader's normalised rank`() {
        assertThat(
            resolve(
                "Hello",
                translations = mapOf("fr-FR" to "Bonjour"),
                originalLanguage = "en",
                preferredLanguages = listOf("fr"),
            )
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `matches a region-tagged READER language against a normalised translation key`() {
        // An in-app level persisted verbatim (`systemLanguage = "pt-BR"`, never
        // normalised at write time) must match the `pt` translation.
        assertThat(
            resolve(
                "Hello",
                translations = mapOf("pt" to "Olá"),
                originalLanguage = "en",
                preferredLanguages = listOf("pt-BR"),
            )
        ).isEqualTo("Olá")
    }

    // ── Degenerate prism entries ────────────────────────────────────────────────

    @Test
    fun `skips blank entries in the reader's language list`() {
        assertThat(
            resolve("Hello", translations = mapOf("fr" to "Bonjour"), preferredLanguages = listOf("", "fr"))
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `tolerates a null map without throwing`() {
        assertThat(resolve("Hello", translations = null, preferredLanguages = listOf("fr")))
            .isEqualTo("Hello")
    }
}
