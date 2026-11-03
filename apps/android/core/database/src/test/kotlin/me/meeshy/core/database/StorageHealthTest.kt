package me.meeshy.core.database

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StorageHealthTest {

    @Test
    fun `le stockage demarre normal`() {
        assertThat(StorageHealth().current.value).isEqualTo(StorageState.Normal)
    }

    @Test
    fun `un repli disque passe en degrade sans etre ephemere`() {
        val health = StorageHealth().apply { markDegraded("secondary") }

        assertThat(health.current.value).isEqualTo(StorageState.Degraded("secondary"))
        assertThat(health.isEphemeral).isFalse()
    }

    @Test
    fun `le repli en memoire est ephemere`() {
        val health = StorageHealth().apply { markEphemeral("memory") }

        assertThat(health.isEphemeral).isTrue()
    }

    @Test
    fun `un degrade ne remplace jamais un stockage ephemere`() {
        val health = StorageHealth().apply {
            markEphemeral("memory")
            markDegraded("recreated")
        }

        assertThat(health.current.value).isEqualTo(StorageState.Ephemeral("memory"))
    }

    @Test
    fun `le retour a la normale est possible apres un degrade`() {
        val health = StorageHealth().apply {
            markDegraded("recreated")
            markNormal()
        }

        assertThat(health.current.value).isEqualTo(StorageState.Normal)
    }
}
