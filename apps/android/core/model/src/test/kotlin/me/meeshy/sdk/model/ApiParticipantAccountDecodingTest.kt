package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** #15717 / #15887 : la fermeture du compte et la sorte du participant sont lues, absentes ⇒ défaut sûr. */
class ApiParticipantAccountDecodingTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(raw: String) = json.decodeFromString(ApiParticipant.serializer(), raw)

    @Test
    fun `accountClosed et type sont lus quand la passerelle les sert`() {
        val p = decode("""{"id":"p1","userId":"u1","accountClosed":true,"type":"anonymous"}""")
        assertThat(p.accountClosed).isTrue()
        assertThat(p.type).isEqualTo("anonymous")
    }

    @Test
    fun `une vieille passerelle qui ne les sert pas laisse les champs nuls`() {
        val p = decode("""{"id":"p1","userId":"u1"}""")
        assertThat(p.accountClosed).isNull()
        assertThat(p.type).isNull()
    }
}
