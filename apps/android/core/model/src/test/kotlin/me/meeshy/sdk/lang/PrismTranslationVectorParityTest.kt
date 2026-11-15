package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.testutil.SharedFixtures
import me.meeshy.sdk.testutil.stringList
import me.meeshy.sdk.testutil.stringMapOrNull
import me.meeshy.sdk.testutil.stringOrNull
import org.junit.Test

/**
 * Rejeu Android du fichier de vecteurs partagé
 * `packages/shared/fixtures/reading-modes/prism-translation.vectors.json` — le CONTRAT
 * cross-plateforme de la descente du Prisme Linguistique (CLAUDE.md § *Prisme
 * Linguistique*, « la descente elle-même est UNE fonction »).
 *
 * Trois miroirs de la même loi : `resolvePrismTranslation`
 * (`packages/shared/utils/conversation-helpers.ts`, qui fait foi),
 * `PrismTranslationResolver` (`packages/MeeshySDK/.../Models/PrismTranslationResolver.swift`)
 * et [PrismTranslationResolver] ici. Sur divergence, c'est le consommateur qui bouge —
 * jamais le vecteur.
 *
 * **API réelle rejouée** : la projection CARTE du résolveur, le chemin que les surfaces
 * consomment — jamais une réimplémentation de la boucle dans ce fichier. La projection
 * TEXTE (liste de candidates) est rejouée sur les MÊMES cas : deux projections d'une
 * seule descente doivent rendre le même verdict.
 */
class PrismTranslationVectorParityTest {

    private data class Vector(
        val label: String?,
        val translations: Map<String, String>?,
        val originalLanguage: String?,
        val preferredLanguages: List<String>,
        val expected: PrismTranslation?,
    )

    private fun loadVectors(): List<Vector> =
        SharedFixtures.vectors("reading-modes/prism-translation.vectors.json").map { case ->
            val expected = case.expected
            Vector(
                label = case.label,
                translations = case.input.stringMapOrNull("translations"),
                originalLanguage = case.input.stringOrNull("originalLanguage"),
                preferredLanguages = case.input.stringList("preferredLanguages"),
                expected = if (expected == null || expected is JsonNull) {
                    null
                } else {
                    PrismTranslation(
                        language = expected.jsonObject.getValue("language").stringOrNull()!!,
                        text = expected.jsonObject.getValue("text").stringOrNull()!!,
                    )
                },
            )
        }

    // --- Garde de harnais (leçon 257 : jamais de vert silencieux à zéro cas) ---

    @Test
    fun `loads eighteen vectors, never zero`() {
        val vectors = loadVectors()
        assertThat(vectors).isNotEmpty()
        // Re-preuve du compte au moment de l'écriture : un changement du fichier partagé
        // s'investigue avant d'ajuster ce nombre.
        assertThat(vectors).hasSize(18)
    }

    // --- tous les vecteurs → projection CARTE (égalité stricte de la paire) ---

    @Test
    fun `every vector matches the map projection exactly`() {
        for (v in loadVectors()) {
            val actual = PrismTranslationResolver.resolve(
                originalLanguage = v.originalLanguage,
                translations = v.translations.orEmpty(),
                preferredLanguages = v.preferredLanguages,
            )
            assertWithMessage("cas «${v.label ?: "?"}»").that(actual).isEqualTo(v.expected)
        }
    }

    // --- les mêmes cas → projection TEXTE : une descente, deux projections ---

    @Test
    fun `every vector matches the text projection exactly`() {
        for (v in loadVectors()) {
            val actual = PrismTranslationResolver.resolve(
                originalLanguage = v.originalLanguage,
                candidates = v.translations.orEmpty().map { (language, text) ->
                    PrismCandidate(language = language, value = text)
                },
                preferredLanguages = v.preferredLanguages,
            )
            assertWithMessage("cas «${v.label ?: "?"}»").that(actual).isEqualTo(v.expected)
        }
    }
}
