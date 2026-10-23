package me.meeshy.sdk.model.security

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SecureKeyNamespaceTest {
    @Test
    fun `sans compte la cle reste nue`() {
        assertThat(SecureKeyNamespace.compose(null, "jwt")).isEqualTo("jwt")
    }

    @Test
    fun `avec compte la cle est prefixee par le compte`() {
        assertThat(SecureKeyNamespace.compose("u1", "jwt")).isEqualTo("u1.jwt")
    }

    @Test
    fun `un compte vide ou blanc vaut absent`() {
        assertThat(SecureKeyNamespace.compose("", "jwt")).isEqualTo("jwt")
        assertThat(SecureKeyNamespace.compose("  ", "jwt")).isEqualTo("jwt")
    }

    @Test
    fun `une cle nue n'appartient a aucun compte et inversement`() {
        assertThat(SecureKeyNamespace.belongsTo("jwt", null)).isTrue()
        assertThat(SecureKeyNamespace.belongsTo("u1.jwt", null)).isFalse()
        assertThat(SecureKeyNamespace.belongsTo("u1.jwt", "u1")).isTrue()
        assertThat(SecureKeyNamespace.belongsTo("u10.jwt", "u1")).isFalse()
        assertThat(SecureKeyNamespace.bareKey("u1.jwt", "u1")).isEqualTo("jwt")
        assertThat(SecureKeyNamespace.bareKey("u2.jwt", "u1")).isNull()
    }
}
