package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UnreadRegistryTest {

    @Test
    fun `un registre vierge ne possede aucun total`() {
        assertThat(UnreadRegistry().total).isEqualTo(0)
        assertThat(UnreadRegistry().isEmpty).isTrue()
    }

    @Test
    fun `le serveur ecrase la valeur precedente`() {
        val registry = UnreadRegistry().applyServer("c1", 5).applyServer("c1", 2)
        assertThat(registry.total).isEqualTo(2)
    }

    @Test
    fun `l'instantane du cache seme une conversation jamais vue`() {
        val registry = UnreadRegistry().seedFromCache(mapOf("c1" to 3, "c2" to 4))
        assertThat(registry.total).isEqualTo(7)
    }

    @Test
    fun `l'instantane du cache ne regresse jamais une valeur possedee par le socket`() {
        val registry = UnreadRegistry().applyServer("c1", 1).seedFromCache(mapOf("c1" to 9))
        assertThat(registry.total).isEqualTo(1)
    }

    @Test
    fun `l'instantane du cache ne ressuscite pas une conversation lue localement`() {
        val registry = UnreadRegistry().seedFromCache(mapOf("c1" to 3)).markReadLocally("c1")
            .seedFromCache(mapOf("c1" to 3))
        assertThat(registry.total).isEqualTo(0)
    }

    @Test
    fun `la lecture locale est optimiste puis le serveur reprend la main`() {
        val registry = UnreadRegistry().applyServer("c1", 4).markReadLocally("c1")
        assertThat(registry.total).isEqualTo(0)
        assertThat(registry.applyServer("c1", 2).total).isEqualTo(2)
    }

    @Test
    fun `la conversation ouverte n'est pas comptee`() {
        val registry = UnreadRegistry().applyServer("c1", 4).applyServer("c2", 1).withOpen("c1")
        assertThat(registry.total).isEqualTo(1)
        assertThat(registry.withOpen(null).total).isEqualTo(5)
    }

    @Test
    fun `une valeur negative est ramenee a zero`() {
        assertThat(UnreadRegistry().applyServer("c1", -3).total).isEqualTo(0)
    }

    @Test
    fun `reappliquer la meme valeur rend un registre egal`() {
        val registry = UnreadRegistry().applyServer("c1", 2)
        assertThat(registry.applyServer("c1", 2)).isEqualTo(registry)
    }

    @Test
    fun `cleared oublie tout y compris la conversation ouverte`() {
        val registry = UnreadRegistry().applyServer("c1", 2).withOpen("c2").cleared()
        assertThat(registry).isEqualTo(UnreadRegistry())
    }
}
