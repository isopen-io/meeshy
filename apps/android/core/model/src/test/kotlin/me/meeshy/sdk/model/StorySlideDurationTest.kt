package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * `StorySlideDuration` is the Android port of iOS's single source of truth for
 * how long a story slide stays on screen before the viewer auto-advances
 * (`StorySlide.computedTotalDuration()` / `StoryEffects.contentDerivedDuration`,
 * StoryModels.swift). These tests pin the exact priority ladder and arithmetic so
 * the two clients never drift: a 6s static default, a long-text extension, a
 * background-loop rule, and an author-pinned `timelineDuration` override that wins
 * over content while the legacy `slideDuration` is deliberately ignored.
 */
class StorySlideDurationTest {

    private fun text(id: String, body: String): StoryTextObject =
        StoryTextObject(id = id, text = body)

    private fun media(
        id: String,
        isBackground: Boolean = false,
        mediaType: String = "video",
        duration: Double? = null,
        startTime: Double? = null,
    ): StoryMediaObject = StoryMediaObject(
        id = id,
        isBackground = isBackground,
        mediaType = mediaType,
        duration = duration,
        startTime = startTime,
    )

    private fun audio(
        id: String,
        isBackground: Boolean? = null,
        duration: Float? = null,
        startTime: Float? = null,
    ): StoryAudioPlayerObject = StoryAudioPlayerObject(
        id = id,
        isBackground = isBackground,
        duration = duration,
        startTime = startTime,
    )

    // --- Default / static ---------------------------------------------------

    @Test
    fun `null effects retombe sur les 6s statiques`() {
        assertThat(StorySlideDuration.computeSeconds(null)).isEqualTo(6.0)
    }

    @Test
    fun `un slide vide dure 6s`() {
        assertThat(StorySlideDuration.computeSeconds(StoryEffects())).isEqualTo(6.0)
    }

    @Test
    fun `un texte court jusqu'a 30 mots dure 6s`() {
        val effects = StoryEffects(textObjects = listOf(text("t", (1..30).joinToString(" ") { "mot" })))
        assertThat(StorySlideDuration.computeSeconds(effects)).isEqualTo(6.0)
    }

    // --- Long text ----------------------------------------------------------

    @Test
    fun `un texte long ajoute une seconde par tranche de 6 mots au-dela de 30`() {
        // 36 mots -> 6 au-dela du seuil -> 6s + 6*(1/6) = 7s.
        val effects = StoryEffects(textObjects = listOf(text("t", (1..36).joinToString(" ") { "mot" })))
        assertThat(StorySlideDuration.computeSeconds(effects)).isWithin(1e-9).of(7.0)
    }

    @Test
    fun `le total de mots se cumule sur tous les text objects`() {
        // 20 + 20 = 40 mots -> 6 + 10/6 s.
        val effects = StoryEffects(
            textObjects = listOf(
                text("a", (1..20).joinToString(" ") { "mot" }),
                text("b", (1..20).joinToString(" ") { "mot" }),
            ),
        )
        assertThat(StorySlideDuration.computeSeconds(effects)).isWithin(1e-9).of(6.0 + 10.0 / 6.0)
    }

    @Test
    fun `les espaces multiples ne comptent pas comme des mots (parite split iOS)`() {
        // "a   b" a deux mots, pas quatre — comme Swift split(separator: " ").
        val effects = StoryEffects(textObjects = listOf(text("t", "a   b")))
        assertThat(StorySlideDuration.computeSeconds(effects)).isEqualTo(6.0)
    }

    // --- Background video / audio loop --------------------------------------

    @Test
    fun `une video de fond plus longue que la cible impose sa duree`() {
        val effects = StoryEffects(mediaObjects = listOf(media("v", isBackground = true, duration = 9.0)))
        assertThat(StorySlideDuration.computeSeconds(effects)).isWithin(1e-9).of(9.0)
    }

    @Test
    fun `une video de fond plus courte boucle jusqu'a atteindre la cible`() {
        // periode 4s, cible 6s -> ceil(6/4)=2 -> 8s.
        val effects = StoryEffects(mediaObjects = listOf(media("v", isBackground = true, duration = 4.0)))
        assertThat(StorySlideDuration.computeSeconds(effects)).isWithin(1e-9).of(8.0)
    }

    @Test
    fun `un audio de fond boucle sur la meme regle que la video`() {
        // periode 4s, cible 6s -> 8s.
        val effects = StoryEffects(audioPlayerObjects = listOf(audio("a", isBackground = true, duration = 4f)))
        assertThat(StorySlideDuration.computeSeconds(effects)).isWithin(1e-9).of(8.0)
    }

    @Test
    fun `une video de premier plan (non background) ne declenche pas la boucle mais compte sa fenetre`() {
        // Non-background media: pas de bgLoopPeriods, mais startTime+duration = fenetre de donnees.
        val effects = StoryEffects(
            mediaObjects = listOf(media("v", isBackground = false, duration = 5.0, startTime = 3.0)),
        )
        // longestData = 8, target = max(6, 8) = 8, aucune boucle -> 8s.
        assertThat(StorySlideDuration.computeSeconds(effects)).isWithin(1e-9).of(8.0)
    }

    @Test
    fun `une periode de boucle quasi nulle est ignoree`() {
        // duration 0 -> filtree (> 0.001) -> retombe sur la cible statique 6s.
        val effects = StoryEffects(mediaObjects = listOf(media("v", isBackground = true, duration = 0.0)))
        assertThat(StorySlideDuration.computeSeconds(effects)).isEqualTo(6.0)
    }

    @Test
    fun `la fenetre de donnees d'un audio (startTime + duration) peut depasser la boucle`() {
        // audio non-background: fenetre = 2 + 12 = 14s ; aucune boucle -> 14s.
        val effects = StoryEffects(
            audioPlayerObjects = listOf(audio("a", isBackground = false, duration = 12f, startTime = 2f)),
        )
        assertThat(StorySlideDuration.computeSeconds(effects)).isWithin(1e-9).of(14.0)
    }

    @Test
    fun `seule la video marquee background nourrit la boucle, pas une image de fond`() {
        // Un media background de type image n'a pas de periode de boucle.
        val effects = StoryEffects(
            mediaObjects = listOf(media("img", isBackground = true, mediaType = "image", duration = 4.0)),
        )
        // Pas de bgVideoDur (kind != video), mais fenetre de donnees = 4 < 6 -> 6s.
        assertThat(StorySlideDuration.computeSeconds(effects)).isEqualTo(6.0)
    }

    // --- timelineDuration override ------------------------------------------

    @Test
    fun `un timelineDuration positif l'emporte sur le contenu`() {
        // Contenu qui vaudrait 9s, mais l'auteur a epingle 3s -> 3s (media rogne).
        val effects = StoryEffects(
            timelineDuration = 3.0,
            mediaObjects = listOf(media("v", isBackground = true, duration = 9.0)),
        )
        assertThat(StorySlideDuration.computeSeconds(effects)).isWithin(1e-9).of(3.0)
    }

    @Test
    fun `un timelineDuration nul ou negatif retombe sur le contenu`() {
        val zero = StoryEffects(timelineDuration = 0.0)
        val negative = StoryEffects(timelineDuration = -5.0)
        assertThat(StorySlideDuration.computeSeconds(zero)).isEqualTo(6.0)
        assertThat(StorySlideDuration.computeSeconds(negative)).isEqualTo(6.0)
    }

    @Test
    fun `le legacy slideDuration est ignore (valeurs backend arbitraires)`() {
        // slideDuration = 12s ne doit PAS gagner — seul timelineDuration epingle.
        val effects = StoryEffects(slideDuration = 12f)
        assertThat(StorySlideDuration.computeSeconds(effects)).isEqualTo(6.0)
    }

    // --- Millis conversion --------------------------------------------------

    @Test
    fun `computeMillis convertit les secondes en millisecondes entieres`() {
        assertThat(StorySlideDuration.computeMillis(null)).isEqualTo(6000)
        val sevenSeconds = StoryEffects(textObjects = listOf(text("t", (1..36).joinToString(" ") { "mot" })))
        assertThat(StorySlideDuration.computeMillis(sevenSeconds)).isEqualTo(7000)
    }
}
