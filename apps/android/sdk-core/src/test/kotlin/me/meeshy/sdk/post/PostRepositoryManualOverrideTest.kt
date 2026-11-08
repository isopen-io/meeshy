package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test

/**
 * Une traduction reçue en direct s'ajoute à la carte des traductions : elle n'écrase ni le texte d'origine
 * ni les autres langues (donc ni le choix manuel du lecteur, tenu côté écran), et garde confiance et modèle.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PostRepositoryManualOverrideTest {

    private val api: PostApi = mockk(relaxed = true)
    private val translationApi: TranslationApi = mockk(relaxed = true)
    private val outbox: OutboxRepository = mockk(relaxed = true)

    private val chosen = ApiPostTranslationEntry(text = "Hola", translationModel = "nllb", confidenceScore = 0.9)

    private suspend fun seeded(): PostRepository {
        val post = ApiPost(id = "p1", content = "Bonjour", originalLanguage = "fr", translations = mapOf("es" to chosen))
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(success = true, data = listOf(post))
        return PostRepository(api, translationApi, outbox).also { it.refresh() }
    }

    @Test
    fun aPushedTranslationKeepsTheLanguageTheReaderChoseIntact() = runTest {
        val repo = seeded()
        val pushed = ApiPostTranslationEntry(text = "Hallo", translationModel = "nllb-200", confidenceScore = 0.83)

        assertThat(repo.applyTranslationUpdate("p1", "de", pushed)).isTrue()

        val cached = repo.cachedPost("p1")!!
        assertThat(cached.content).isEqualTo("Bonjour")
        assertThat(cached.translations!!["es"]).isEqualTo(chosen)
        assertThat(cached.translations!!["de"]).isEqualTo(pushed)
    }

    @Test
    fun aPushedRefinementOfTheChosenLanguageKeepsItsConfidenceAndModel() = runTest {
        val repo = seeded()
        val refined = ApiPostTranslationEntry(text = "Hola a todos", translationModel = "nllb-200", confidenceScore = 0.95)

        repo.applyTranslationUpdate("p1", "es", refined)

        assertThat(repo.cachedPost("p1")!!.translations!!["es"]).isEqualTo(refined)
    }
}
