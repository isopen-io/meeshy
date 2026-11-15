package me.meeshy.sdk.model.packs

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import org.junit.Test

class PackTypeTest {
    @Test
    fun `les trois types servis se lisent`() {
        assertThat(PackType.fromWire("builtin")).isEqualTo(PackType.BUILTIN)
        assertThat(PackType.fromWire("official")).isEqualTo(PackType.OFFICIAL)
        assertThat(PackType.fromWire("community")).isEqualTo(PackType.COMMUNITY)
    }

    @Test
    fun `un type inconnu d'un serveur plus recent est ignore sans erreur`() {
        val decoded = Json.decodeFromString(ListSerializer(PackType.serializer()), """["official","partner"]""")

        assertThat(decoded).containsExactly(PackType.OFFICIAL, PackType.UNKNOWN).inOrder()
        assertThat(PackType.fromWire(null)).isEqualTo(PackType.UNKNOWN)
    }
}
