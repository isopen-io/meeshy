package me.meeshy.sdk.model.guest

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GuestAttachmentAllowanceTest {
    private val textAndAudio = GuestAttachmentAllowance(listOf(GuestAttachmentKind.TEXT, GuestAttachmentKind.AUDIO))

    @Test
    fun `la famille d un fichier se lit a son extension, sans casse`() {
        assertThat(GuestAttachmentKind.ofFileName("notes.TXT")).isEqualTo(GuestAttachmentKind.TEXT)
        assertThat(GuestAttachmentKind.ofFileName("a.m4a")).isEqualTo(GuestAttachmentKind.AUDIO)
        assertThat(GuestAttachmentKind.ofFileName("p.jpeg")).isEqualTo(GuestAttachmentKind.IMAGE)
        assertThat(GuestAttachmentKind.ofFileName("doc.pdf")).isEqualTo(GuestAttachmentKind.PDF)
        assertThat(GuestAttachmentKind.ofFileName("archive.zip")).isNull()
        assertThat(GuestAttachmentKind.ofFileName("noext")).isNull()
    }

    @Test
    fun `la famille d un type MIME ignore les parametres`() {
        assertThat(GuestAttachmentKind.ofMimeType("text/plain; charset=utf-8")).isEqualTo(GuestAttachmentKind.TEXT)
        assertThat(GuestAttachmentKind.ofMimeType("audio/ogg")).isEqualTo(GuestAttachmentKind.AUDIO)
        assertThat(GuestAttachmentKind.ofMimeType("image/svg+xml")).isNull()
        assertThat(GuestAttachmentKind.ofMimeType(null)).isNull()
    }

    @Test
    fun `des termes absents ne restreignent rien, inconnus n ouvrent rien`() {
        assertThat(GuestAttachmentKind.knownKinds(null)).isNull()
        assertThat(GuestAttachmentKind.knownKinds(listOf("pdf", "nope"))).containsExactly(GuestAttachmentKind.PDF)
        assertThat(GuestAttachmentKind.knownKinds(listOf("nope"))).isEmpty()
    }

    @Test
    fun `sans restriction tout est admis, la famille declaree est rendue quand elle est connue`() {
        assertThat(GuestAttachmentAllowance.UNRESTRICTED.verdict("x.zip", 10_000_000_000L))
            .isEqualTo(GuestAttachmentAllowance.Verdict.Accepted(null))
        assertThat(GuestAttachmentAllowance.UNRESTRICTED.isRestricted).isFalse()
        assertThat(GuestAttachmentAllowance.UNRESTRICTED.offersContactsAndPlaces).isTrue()
    }

    @Test
    fun `un lien restreint refuse une famille fermee, puis un fichier trop lourd`() {
        assertThat(textAndAudio.verdict("a.png", 10))
            .isEqualTo(GuestAttachmentAllowance.Verdict.Refused(GuestAttachmentRefusal.Reason.KIND_NOT_ALLOWED))
        assertThat(textAndAudio.verdict("a.txt", GuestAttachmentAllowance.MAX_BYTES + 1))
            .isEqualTo(GuestAttachmentAllowance.Verdict.Refused(GuestAttachmentRefusal.Reason.TOO_LARGE))
        assertThat(textAndAudio.verdict("a.txt", GuestAttachmentAllowance.MAX_BYTES))
            .isEqualTo(GuestAttachmentAllowance.Verdict.Accepted(GuestAttachmentKind.TEXT))
    }

    @Test
    fun `ce que le composeur offre suit les familles ouvertes`() {
        assertThat(textAndAudio.offersVoiceRecording).isTrue()
        assertThat(textAndAudio.offersVisualMedia).isFalse()
        assertThat(textAndAudio.offersFiles).isTrue()
        assertThat(textAndAudio.offersContactsAndPlaces).isFalse()
        assertThat(GuestAttachmentAllowance.CLOSED.offersFiles).isFalse()
    }

    @Test
    fun `le plafond de World Wide resserre des termes larges et s impose aux termes absents`() {
        val ceiling = GuestAttachmentKind.WORLD_GUEST_CEILING
        assertThat(GuestAttachmentAllowance.UNRESTRICTED.cappedBy(ceiling).kinds).containsExactlyElementsIn(ceiling)
        assertThat(GuestAttachmentAllowance(GuestAttachmentKind.entries).cappedBy(ceiling).kinds).containsExactlyElementsIn(ceiling)
        assertThat(GuestAttachmentAllowance(listOf(GuestAttachmentKind.AUDIO)).cappedBy(ceiling).kinds)
            .containsExactly(GuestAttachmentKind.AUDIO)
    }

    @Test
    fun `le tri d une selection garde les admis et nomme le premier refuse`() {
        val screening = GuestAttachmentScreening.of(
            listOf(
                GuestAttachmentScreening.Candidate("a.txt", 5),
                GuestAttachmentScreening.Candidate("b.png", 5),
                GuestAttachmentScreening.Candidate("c.mp3", 5),
            ),
            textAndAudio,
        )
        assertThat(screening.acceptedIndices).containsExactly(0, 2).inOrder()
        assertThat(screening.refusals.map { it.fileName }).containsExactly("b.png")
    }
}
