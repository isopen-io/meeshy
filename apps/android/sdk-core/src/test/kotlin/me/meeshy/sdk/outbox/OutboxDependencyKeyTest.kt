package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxDependencyKeyTest {

    @Test
    fun `encode of no prerequisites is null`() {
        assertThat(OutboxDependencyKey.encode(emptyList())).isNull()
    }

    @Test
    fun `encode of only blanks is null`() {
        assertThat(OutboxDependencyKey.encode(listOf("", "   "))).isNull()
    }

    @Test
    fun `encode wraps a single member in delimiters`() {
        assertThat(OutboxDependencyKey.encode(listOf("a"))).isEqualTo("|a|")
    }

    @Test
    fun `encode joins several members preserving order`() {
        assertThat(OutboxDependencyKey.encode(listOf("a", "b", "c"))).isEqualTo("|a|b|c|")
    }

    @Test
    fun `encode collapses duplicates and trims blanks`() {
        assertThat(OutboxDependencyKey.encode(listOf(" a ", "a", "", "b"))).isEqualTo("|a|b|")
    }

    @Test
    fun `decode of null is empty`() {
        assertThat(OutboxDependencyKey.decode(null)).isEmpty()
    }

    @Test
    fun `decode of blank is empty`() {
        assertThat(OutboxDependencyKey.decode("   ")).isEmpty()
    }

    @Test
    fun `decode of a bare cmid yields a singleton`() {
        assertThat(OutboxDependencyKey.decode("upload")).containsExactly("upload")
    }

    @Test
    fun `decode of a wrapped key yields its members in order`() {
        assertThat(OutboxDependencyKey.decode("|a|b|c|")).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `encode then decode round-trips the set`() {
        val members = listOf("cmid_1", "cmid_2", "cmid_3")
        assertThat(OutboxDependencyKey.decode(OutboxDependencyKey.encode(members)))
            .containsExactlyElementsIn(members)
            .inOrder()
    }

    @Test
    fun `likePattern wraps the escaped member for a membership match`() {
        assertThat(OutboxDependencyKey.likePattern("a")).isEqualTo("%|a|%")
    }

    @Test
    fun `likePattern escapes the underscore wildcard a cmid carries`() {
        assertThat(OutboxDependencyKey.likePattern("cmid_7")).isEqualTo("%|cmid\\_7|%")
    }

    @Test
    fun `escapeLike escapes every like metacharacter`() {
        assertThat(OutboxDependencyKey.escapeLike("a_b%c\\d")).isEqualTo("a\\_b\\%c\\\\d")
    }
}
