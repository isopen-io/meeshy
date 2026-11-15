package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class TranslationFailureLedgerTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `les trois evenements d'echec se decodent avec leurs champs optionnels absents`() {
        val text = json.decodeFromString<TranslationFailedEvent>("""{"messageId":"m1","conversationId":"c1","error":"boom"}""")
        val audio = json.decodeFromString<AudioTranslationFailedEvent>(
            """{"messageId":"m1","attachmentId":"a1","conversationId":"c1","error":"x","errorCode":"TTS","extra":1}""",
        )
        val transcription = json.decodeFromString<TranscriptionFailedEvent>("""{"messageId":"m1","conversationId":"c1"}""")
        assertThat(text.toFailureEntry().kind).isEqualTo(TranslationFailureKind.TEXT_TRANSLATION)
        assertThat(audio.toFailureEntry().errorCode).isEqualTo("TTS")
        assertThat(transcription.toFailureEntry().attachmentId).isNull()
    }

    @Test
    fun `un echec de texte puis la traduction recue efface l'echec`() {
        val ledger = TranslationFailureLedger().failed(TranslationFailedEvent("m1", "c1", "boom").toFailureEntry())
        assertThat(ledger.hasFailure("m1")).isTrue()
        assertThat(ledger.textTranslated("m1", "fr").hasFailure("m1")).isFalse()
    }

    @Test
    fun `une traduction d'un autre message laisse l'echec en place`() {
        val ledger = TranslationFailureLedger().failed(TranslationFailedEvent("m1", "c1").toFailureEntry())
        assertThat(ledger.textTranslated("m2", "fr")).isSameInstanceAs(ledger)
    }

    @Test
    fun `l'echec d'une piste audio ne tombe que par la piste de sa pièce`() {
        val ledger = TranslationFailureLedger()
            .failed(AudioTranslationFailedEvent("m1", "a1", "c1").toFailureEntry())
            .failed(AudioTranslationFailedEvent("m1", "a2", "c1").toFailureEntry())
        val after = ledger.audioTranslated("m1", "a1", "es")
        assertThat(after.forMessage("m1").map { it.attachmentId }).containsExactly("a2")
    }

    @Test
    fun `la transcription prete efface l'echec de transcription seulement`() {
        val ledger = TranslationFailureLedger()
            .failed(TranscriptionFailedEvent("m1", "a1", "c1").toFailureEntry())
            .failed(TranslationFailedEvent("m1", "c1").toFailureEntry())
        assertThat(ledger.transcribed("m1", "a1").forMessage("m1").map { it.kind })
            .containsExactly(TranslationFailureKind.TEXT_TRANSLATION)
    }

    @Test
    fun `un second echec du meme objet remplace le premier`() {
        val ledger = TranslationFailureLedger()
            .failed(TranslationFailedEvent("m1", "c1", "a").toFailureEntry())
            .failed(TranslationFailedEvent("m1", "c1", "b").toFailureEntry())
        assertThat(ledger.entries).hasSize(1)
        assertThat(ledger.forMessage("m1").single().error).isEqualTo("b")
    }

    @Test
    fun `la relance consomme tous les echecs du message`() {
        val ledger = TranslationFailureLedger()
            .failed(TranslationFailedEvent("m1", "c1").toFailureEntry())
            .failed(TranscriptionFailedEvent("m1", "a1", "c1").toFailureEntry())
        assertThat(ledger.retried("m1").entries).isEmpty()
    }
}
