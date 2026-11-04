package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class KeyLossPolicyTest {

    @Test
    fun `une base chiffree avec la cle relue s'ouvre`() {
        assertThat(KeyLossPolicy.decide(KeyOrigin.EXISTING, DatabaseFileState.ENCRYPTED)).isEqualTo(StartupAction.OPEN)
    }

    @Test
    fun `une base chiffree dont la cle a ete perdue est purgee`() {
        listOf(KeyOrigin.CREATED, KeyOrigin.REGENERATED).forEach { origin ->
            assertThat(KeyLossPolicy.decide(origin, DatabaseFileState.ENCRYPTED)).isEqualTo(StartupAction.PURGE_THEN_OPEN)
        }
    }

    @Test
    fun `une base en clair est migree quelle que soit l'origine de la cle`() {
        KeyOrigin.values().forEach { origin ->
            assertThat(KeyLossPolicy.decide(origin, DatabaseFileState.PLAINTEXT)).isEqualTo(StartupAction.MIGRATE_PLAINTEXT)
        }
    }

    @Test
    fun `un fichier tronque est purge et une installation neuve s'ouvre`() {
        KeyOrigin.values().forEach { origin ->
            assertThat(KeyLossPolicy.decide(origin, DatabaseFileState.TRUNCATED)).isEqualTo(StartupAction.PURGE_THEN_OPEN)
            assertThat(KeyLossPolicy.decide(origin, DatabaseFileState.ABSENT)).isEqualTo(StartupAction.OPEN)
        }
    }

    @Test
    fun `un fichier que le disque refuse de lire n'est jamais purge`() {
        KeyOrigin.values().forEach { origin ->
            assertThat(KeyLossPolicy.decide(origin, DatabaseFileState.UNAVAILABLE)).isEqualTo(StartupAction.DEFER)
        }
    }
}
