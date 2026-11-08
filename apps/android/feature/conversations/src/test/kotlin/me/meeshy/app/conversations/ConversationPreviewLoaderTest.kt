package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.conversationlist.ConversationPreviewIntent
import me.meeshy.sdk.model.conversationlist.ConversationPreviewPhase
import me.meeshy.sdk.model.conversationlist.PreviewCacheReading
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationPreviewLoaderTest {

    private class FakeSource(
        var cache: CachedPreview = CachedPreview(PreviewCacheReading.Absent, emptyList()),
        var network: List<ApiMessage>? = null,
        var gate: CompletableDeferred<Unit>? = null,
    ) : ConversationPreviewSource {
        var cacheReads = 0
        var networkReads = 0
        override suspend fun cached(conversationId: String): CachedPreview {
            cacheReads += 1
            gate?.await()
            return cache
        }

        override suspend fun fetchRecent(conversationId: String): List<ApiMessage>? {
            networkReads += 1
            return network
        }
    }

    private class Prefs(override val systemLanguage: String?, override val regionalLanguage: String? = null) :
        LanguageResolver.ContentLanguagePreferences {
        override val customDestinationLanguage: String? = null
    }

    private class Fixture(
        val source: FakeSource,
        val loader: ConversationPreviewLoader,
        var locked: Set<String>,
        var owner: String?,
    )

    private fun TestScope.fixture(
        source: FakeSource = FakeSource(),
        prefs: LanguageResolver.ContentLanguagePreferences = Prefs("fr"),
        locked: Set<String> = emptySet(),
    ): Fixture {
        lateinit var created: Fixture
        val loader = ConversationPreviewLoader(
            scope = this,
            source = source,
            prefs = { prefs },
            isLocked = { it in created.locked },
            ownerId = { created.owner },
        )
        created = Fixture(source, loader, locked, owner = "me")
        return created
    }

    private fun message(id: String, content: String = id, updatedAt: String? = null, translations: List<ApiTextTranslation> = emptyList()) =
        ApiMessage(id = id, conversationId = "c1", content = content, originalLanguage = "en", updatedAt = updatedAt, translations = translations)

    private fun cached(vararg messages: ApiMessage, reading: PreviewCacheReading = PreviewCacheReading.Stale) =
        CachedPreview(reading, messages.toList())

    @Test
    fun `une conversation jamais chargee se lit en chargement, jamais vide`() = runTest {
        assertThat(fixture().loader.state("c1").phase).isEqualTo(ConversationPreviewPhase.Loading)
    }

    @Test
    fun `deux ensure simultanes ne lisent qu une fois`() = runTest(StandardTestDispatcher()) {
        val f = fixture(FakeSource(network = listOf(message("m1"))))

        launch { f.loader.load("c1", ConversationPreviewIntent.Ensure) }
        launch { f.loader.load("c1", ConversationPreviewIntent.Ensure) }
        advanceUntilIdle()

        assertThat(f.source.cacheReads).isEqualTo(1)
        assertThat(f.source.networkReads).isEqualTo(1)
        assertThat(f.loader.state("c1").phase).isEqualTo(ConversationPreviewPhase.Loaded)
    }

    @Test
    fun `une ouverture arrivee pendant un prechargement l attend puis revalide par le reseau`() = runTest(StandardTestDispatcher()) {
        val gate = CompletableDeferred<Unit>()
        val f = fixture(FakeSource(cache = cached(message("m1")), network = listOf(message("m1"), message("m2")), gate = gate))

        launch { f.loader.load("c1", ConversationPreviewIntent.Prefetch) }
        advanceUntilIdle()
        launch { f.loader.load("c1", ConversationPreviewIntent.Open) }
        advanceUntilIdle()
        assertThat(f.source.networkReads).isEqualTo(0)
        gate.complete(Unit)
        advanceUntilIdle()

        assertThat(f.source.networkReads).isEqualTo(1)
        assertThat(f.loader.state("c1").snapshot!!.messages.map { it.id }).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `le prechargement ne touche jamais le reseau et ne dit pas vide sur un cache froid`() = runTest {
        val f = fixture(FakeSource(network = listOf(message("m1"))))

        f.loader.load("c1", ConversationPreviewIntent.Prefetch)

        assertThat(f.source.networkReads).isEqualTo(0)
        assertThat(f.loader.state("c1").phase).isEqualTo(ConversationPreviewPhase.Loading)
    }

    @Test
    fun `un resultat reseau n est jamais ecrase par un cache plus ancien`() = runTest {
        val f = fixture(FakeSource(cache = cached(message("m1")), network = listOf(message("m1"), message("m2"))))
        f.loader.load("c1", ConversationPreviewIntent.Open)

        f.source.network = null
        f.source.cache = cached(message("m1"))
        f.loader.load("c1", ConversationPreviewIntent.Open)

        assertThat(f.loader.state("c1").snapshot!!.messages.map { it.id }).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `ensure ne revalide plus apres un resultat reseau mais open revalide toujours`() = runTest {
        val f = fixture(FakeSource(network = listOf(message("m1"))))
        f.loader.load("c1", ConversationPreviewIntent.Ensure)
        f.loader.load("c1", ConversationPreviewIntent.Ensure)
        assertThat(f.source.networkReads).isEqualTo(1)

        f.loader.load("c1", ConversationPreviewIntent.Open)

        assertThat(f.source.networkReads).isEqualTo(2)
    }

    @Test
    fun `un cache perime servi par un prechargement se revalide encore par ensure`() = runTest {
        val f = fixture(FakeSource(cache = cached(message("m1")), network = listOf(message("m1", content = "edite"))))
        f.loader.load("c1", ConversationPreviewIntent.Prefetch)
        assertThat(f.source.networkReads).isEqualTo(0)

        f.loader.load("c1", ConversationPreviewIntent.Ensure)

        assertThat(f.source.networkReads).isEqualTo(1)
    }

    @Test
    fun `le reseau constate une conversation vide, un echec sur ligne froide la dit indisponible`() = runTest {
        val empty = fixture(FakeSource(network = emptyList()))
        empty.loader.load("c1", ConversationPreviewIntent.Open)
        assertThat(empty.loader.state("c1").phase).isEqualTo(ConversationPreviewPhase.Empty)

        val down = fixture(FakeSource(network = null))
        down.loader.load("c1", ConversationPreviewIntent.Open)
        assertThat(down.loader.state("c1").phase).isEqualTo(ConversationPreviewPhase.Unavailable)
    }

    @Test
    fun `un echec reseau garde ce que le cache montrait`() = runTest {
        val f = fixture(FakeSource(cache = cached(message("m1")), network = null))

        f.loader.load("c1", ConversationPreviewIntent.Open)

        assertThat(f.loader.state("c1").phase).isEqualTo(ConversationPreviewPhase.Loaded)
    }

    @Test
    fun `un message chiffre non dechiffrable est scelle et un message en clair reste lisible`() = runTest {
        val sealed = ApiMessage(id = "e", conversationId = "c1", content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee")
        val f = fixture(FakeSource(network = listOf(sealed, message("p", content = "clair"))))

        f.loader.load("c1", ConversationPreviewIntent.Open)

        val shown = f.loader.state("c1").snapshot!!.messages
        assertThat(shown.first { it.id == "e" }.content).isEmpty()
        assertThat(shown.first { it.id == "p" }.content).isEqualTo("clair")
    }

    @Test
    fun `le prisme elit la traduction de chaque message separement`() = runTest {
        val fr = ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour")
        val f = fixture(FakeSource(network = listOf(message("a", translations = listOf(fr)), message("b"))))

        f.loader.load("c1", ConversationPreviewIntent.Open)

        val snapshot = f.loader.state("c1").snapshot!!
        assertThat(snapshot.servedLanguage("a")).isEqualTo("fr")
        assertThat(snapshot.servedLanguage("b")).isNull()
    }

    @Test
    fun `rien n est republie quand l empreinte n a pas bouge`() = runTest {
        val f = fixture(FakeSource(network = listOf(message("m1"))))
        f.loader.load("c1", ConversationPreviewIntent.Open)
        val before = f.loader.states.value

        f.loader.load("c1", ConversationPreviewIntent.Open)

        assertThat(f.loader.states.value).isSameInstanceAs(before)
    }

    @Test
    fun `un message modifie republie l aperçu`() = runTest {
        val f = fixture(FakeSource(network = listOf(message("m1"))))
        f.loader.load("c1", ConversationPreviewIntent.Open)
        val before = f.loader.states.value

        f.source.network = listOf(message("m1", updatedAt = "2026-06-01T10:00:00Z"))
        f.loader.load("c1", ConversationPreviewIntent.Open)

        assertThat(f.loader.states.value).isNotSameInstanceAs(before)
    }

    @Test
    fun `une conversation verrouillee ne lit rien et se lit scellee`() = runTest {
        val f = fixture(FakeSource(network = listOf(message("m1"))), locked = setOf("c1"))

        f.loader.load("c1", ConversationPreviewIntent.Open)

        assertThat(f.source.cacheReads).isEqualTo(0)
        assertThat(f.loader.state("c1").phase).isEqualTo(ConversationPreviewPhase.Sealed)
    }

    @Test
    fun `un verrou pose apres le chargement vide la memoire`() = runTest {
        val f = fixture(FakeSource(network = listOf(message("m1"))))
        f.loader.load("c1", ConversationPreviewIntent.Open)

        f.locked = setOf("c1")
        f.loader.dropLocked()

        assertThat(f.loader.states.value).doesNotContainKey("c1")
        assertThat(f.loader.state("c1").phase).isEqualTo(ConversationPreviewPhase.Sealed)
    }

    @Test
    fun `un changement de proprietaire de session purge ce qui etait servi`() = runTest {
        val f = fixture(FakeSource(network = listOf(message("m1"))))
        f.loader.load("c1", ConversationPreviewIntent.Open)

        f.owner = "other"
        f.source.network = null
        f.loader.load("c2", ConversationPreviewIntent.Open)

        assertThat(f.loader.states.value).doesNotContainKey("c1")
    }
}
