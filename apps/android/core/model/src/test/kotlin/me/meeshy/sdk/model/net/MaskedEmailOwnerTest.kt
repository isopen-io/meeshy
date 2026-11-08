package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class MaskedEmailOwnerTest {

    private fun parse(raw: String) = MaskedEmailOwner.from(Json.parseToJsonElement(raw))

    @Test
    fun `le detenteur masque se lit avec son avatar`() {
        assertThat(parse("""{"maskedDisplayName":"J*** D***","maskedUsername":"j***e","avatar":"https://x/a.png"}"""))
            .isEqualTo(MaskedEmailOwner("J*** D***", "j***e", "https://x/a.png"))
    }

    @Test
    fun `l'avatar est facultatif`() {
        assertThat(parse("""{"maskedDisplayName":"J***","maskedUsername":"j***"}""")?.avatar).isNull()
    }

    @Test
    fun `un detenteur mal forme vaut null sans lever`() {
        assertThat(parse("""{"maskedDisplayName":"J***"}""")).isNull()
        assertThat(parse("""{"maskedDisplayName":3,"maskedUsername":"x"}""")).isNull()
        assertThat(parse("\"texte\"")).isNull()
        assertThat(MaskedEmailOwner.from(null)).isNull()
    }
}
