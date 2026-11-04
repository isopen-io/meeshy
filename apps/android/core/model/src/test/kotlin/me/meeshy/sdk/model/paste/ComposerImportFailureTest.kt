package me.meeshy.sdk.model.paste

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerImportFailureTest {
    @Test
    fun `les noms échoués sont listés et le repli remplace un nom absent`() {
        assertThat(ComposerImportFailure.names(listOf("a.pdf", null, "  "), "sans nom"))
            .isEqualTo("a.pdf, sans nom, sans nom")
    }
}
