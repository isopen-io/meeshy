package me.meeshy.sdk.model.util

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Test

class SerializationLoggingTest {
    @Serializable
    private data class Payload(val n: Int)

    private val json = Json
    private fun capture(): Pair<MutableList<SerializationFailure>, SerializationFailureSink> {
        val list = mutableListOf<SerializationFailure>()
        return list to SerializationFailureSink { list += it }
    }

    @Test
    fun `une charge corrompue rend null et est enregistree`() {
        val (failures, sink) = capture()
        val result = json.decodeOrLog<Payload>("{not json", field = "attachmentsJson", id = "m1", sink = sink)
        assertThat(result).isNull()
        assertThat(failures).hasSize(1)
        assertThat(failures[0].direction).isEqualTo(SerializationFailure.Direction.DECODE)
        assertThat(failures[0].field).isEqualTo("attachmentsJson")
        assertThat(failures[0].id).isEqualTo("m1")
    }

    @Test
    fun `une charge valide se decode sans journal`() {
        val (failures, sink) = capture()
        assertThat(json.decodeOrLog<Payload>("""{"n":2}""", field = "f", sink = sink)).isEqualTo(Payload(2))
        assertThat(failures).isEmpty()
    }

    @Test
    fun `un encodage reussi rend le JSON`() {
        assertThat(json.encodeOrLog(Payload(1), field = "f")).isEqualTo("""{"n":1}""")
    }

    private object Boom : kotlinx.serialization.KSerializer<Payload> {
        override val descriptor = Payload.serializer().descriptor
        override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: Payload) = error("cannot encode")
        override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): Payload = error("cannot decode")
    }

    @Test
    fun `un encodage en echec rend null et est enregistre`() {
        val (failures, sink) = capture()
        assertThat(json.encodeOrLog(Boom, Payload(1), field = "col", id = "x", sink = sink)).isNull()
        assertThat(failures.single().direction).isEqualTo(SerializationFailure.Direction.ENCODE)
    }

    @Test
    fun `encodeOrKeep conserve la charge precedente quand l'encodage echoue`() {
        val (_, sink) = capture()
        val kept = json.encodeOrLog(Boom, Payload(1), field = "c", sink = sink) ?: "previous"
        assertThat(kept).isEqualTo("previous")
        assertThat(json.encodeOrKeep(Payload(3), previous = "old", field = "c", sink = sink)).isEqualTo("""{"n":3}""")
    }
}
