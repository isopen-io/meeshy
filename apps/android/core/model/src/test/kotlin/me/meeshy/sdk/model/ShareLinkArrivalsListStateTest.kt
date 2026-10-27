package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareLinkArrivalsListStateTest {

    private fun entry(name: String) = ShareLinkArrivalEntry(displayName = name, joinedAt = "2026-10-20T10:00:00.000Z")
    private fun page(vararg names: String, next: String? = null) =
        ShareLinkArrivalsPage(arrivals = names.map(::entry), nextCursor = next)

    @Test
    fun `la liste se peint des arrivees recentes sans squelette`() {
        val state = ShareLinkArrivalsListState.seeded(total = 12, seed = listOf(entry("a"), entry("a"), entry("b")))
        assertThat(state.arrivals.map { it.displayName }).containsExactly("a", "b").inOrder()
        assertThat(state.showsSkeleton).isFalse()
    }

    @Test
    fun `a froid sans graine le squelette se montre pendant la premiere page`() {
        val state = ShareLinkArrivalsListState.seeded(total = 0, seed = emptyList()).firstPageRequested()
        assertThat(state.showsSkeleton).isTrue()
        assertThat(state.showsEmpty).isFalse()
    }

    @Test
    fun `la premiere page remplace la graine et ouvre la suite`() {
        val requested = ShareLinkArrivalsListState.seeded(5, listOf(entry("seed"))).firstPageRequested()
        val loaded = requested.firstPageLoaded(requested.generation, page("a", "b", next = "c1"))
        assertThat(loaded.arrivals.map { it.displayName }).containsExactly("a", "b").inOrder()
        assertThat(loaded.hasMore).isTrue()
        assertThat(loaded.isLoadingFirstPage).isFalse()
    }

    @Test
    fun `une premiere page sans arrivee dit le vide`() {
        val requested = ShareLinkArrivalsListState.seeded(0, emptyList()).firstPageRequested()
        val loaded = requested.firstPageLoaded(requested.generation, page())
        assertThat(loaded.showsEmpty).isTrue()
    }

    @Test
    fun `une premiere page en echec sans rien a montrer dit l erreur pleine`() {
        val requested = ShareLinkArrivalsListState.seeded(0, emptyList()).firstPageRequested()
        val failed = requested.firstPageFailedAt(requested.generation)
        assertThat(failed.showsFullError).isTrue()
        assertThat(failed.showsFooterError).isFalse()
    }

    @Test
    fun `une premiere page en echec avec la graine garde la liste et dit l erreur en pied`() {
        val requested = ShareLinkArrivalsListState.seeded(3, listOf(entry("seed"))).firstPageRequested()
        val failed = requested.firstPageFailedAt(requested.generation)
        assertThat(failed.arrivals).hasSize(1)
        assertThat(failed.showsFullError).isFalse()
        assertThat(failed.showsFooterError).isTrue()
    }

    @Test
    fun `la page suivante s ajoute sans jamais montrer deux fois la meme ligne`() {
        val first = ShareLinkArrivalsListState.seeded(4, emptyList()).firstPageRequested().let { it.firstPageLoaded(it.generation, page("a", "b", next = "c1")) }
        val asked = first.nextPageRequested()
        val next = asked.nextPageLoaded(asked.generation, page("b", "c", next = null))
        assertThat(next.arrivals.map { it.displayName }).containsExactly("a", "b", "c").inOrder()
        assertThat(next.hasMore).isFalse()
    }

    @Test
    fun `une page suivante en echec ne retire rien et se dit en pied`() {
        val first = ShareLinkArrivalsListState.seeded(4, emptyList()).firstPageRequested().let { it.firstPageLoaded(it.generation, page("a", next = "c1")) }
        val asked = first.nextPageRequested()
        val failed = asked.nextPageFailedAt(asked.generation)
        assertThat(failed.arrivals).hasSize(1)
        assertThat(failed.showsFooterError).isTrue()
        assertThat(failed.nextPageFailed).isTrue()
    }

    @Test
    fun `une page suivante demandee avant un rechargement n entre pas dans la liste neuve`() {
        val first = ShareLinkArrivalsListState.seeded(4, emptyList()).firstPageRequested().let { it.firstPageLoaded(it.generation, page("a", next = "c1")) }
        val asked = first.nextPageRequested()
        val refreshed = asked.firstPageRequested().let { it.firstPageLoaded(it.generation, page("z", next = "c9")) }
        val late = refreshed.nextPageLoaded(asked.generation, page("late", next = null))
        assertThat(late.arrivals.map { it.displayName }).containsExactly("z")
    }

    @Test
    fun `la suite se demande pres de la fin seulement`() {
        val loaded = ShareLinkArrivalsListState.seeded(40, emptyList()).firstPageRequested()
            .let { it.firstPageLoaded(it.generation, ShareLinkArrivalsPage(List(30) { i -> entry("n$i") }, "c1")) }
        assertThat(loaded.shouldPrefetchAt(index = 10)).isFalse()
        assertThat(loaded.shouldPrefetchAt(index = 25)).isTrue()
    }

    @Test
    fun `aucune suite ne se demande apres un echec ni pendant un chargement`() {
        val loaded = ShareLinkArrivalsListState.seeded(40, emptyList()).firstPageRequested()
            .let { it.firstPageLoaded(it.generation, ShareLinkArrivalsPage(List(30) { i -> entry("n$i") }, "c1")) }
        assertThat(loaded.nextPageRequested().shouldPrefetchAt(29)).isFalse()
        val asked = loaded.nextPageRequested()
        assertThat(asked.nextPageFailedAt(asked.generation).shouldPrefetchAt(29)).isFalse()
    }

    @Test
    fun `reessayer reprend la premiere page si aucune n est venue sinon la suivante`() {
        val cold = ShareLinkArrivalsListState.seeded(0, emptyList()).firstPageRequested().let { it.firstPageFailedAt(it.generation) }
        assertThat(cold.retryTarget).isEqualTo(ShareLinkArrivalsRetry.FirstPage)
        val loaded = ShareLinkArrivalsListState.seeded(0, emptyList()).firstPageRequested().let { it.firstPageLoaded(it.generation, page("a", next = "c")) }
        assertThat(loaded.retryTarget).isEqualTo(ShareLinkArrivalsRetry.NextPage)
    }
}

class ShareLinkArrivalsListStateSeedTest {
    private fun entry(name: String) = ShareLinkArrivalEntry(displayName = name, joinedAt = "2026-10-20T10:00:00.000Z")

    @Test
    fun `une graine tardive peint la liste sans casser le chargement en cours`() {
        val loading = ShareLinkArrivalsListState().firstPageRequested()
        val seeded = loading.withSeed(7, listOf(entry("a")))
        assertThat(seeded.arrivals).hasSize(1)
        assertThat(seeded.isLoadingFirstPage).isTrue()
        assertThat(seeded.generation).isEqualTo(loading.generation)
    }

    @Test
    fun `une graine tardive ne remplace jamais une page serveur`() {
        val loaded = ShareLinkArrivalsListState().firstPageRequested().let {
            it.firstPageLoaded(it.generation, ShareLinkArrivalsPage(listOf(entry("srv")), null))
        }
        assertThat(loaded.withSeed(7, listOf(entry("a")))).isEqualTo(loaded)
    }
}
