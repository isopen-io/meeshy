package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ExternalDraftRevisionTest {

    @Test fun `le premier brouillon ne change pas la révision`() {
        assertThat(ExternalDraftRevision().of("bonjour")).isEqualTo(0)
    }

    @Test fun `ce que le champ écrit ne change pas la révision`() {
        val r = ExternalDraftRevision()
        r.of("")
        r.typed("b")
        assertThat(r.of("b")).isEqualTo(0)
    }

    @Test fun `ce que l'hôte pose change la révision`() {
        val r = ExternalDraftRevision()
        r.of("")
        r.typed("@al")
        assertThat(r.of("@alice ")).isEqualTo(1)
        assertThat(r.of("")).isEqualTo(2)
        assertThat(r.of("")).isEqualTo(2)
    }
}
