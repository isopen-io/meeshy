package me.meeshy.sdk.model.audio

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import java.util.Locale
import me.meeshy.sdk.model.BackgroundSoundV3
import me.meeshy.sdk.model.CanvasV3
import me.meeshy.sdk.model.SoundSourceV3
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import org.junit.Test

class BackgroundAudioAnnouncementTest {
    private fun library(id: String = "snd") = BackgroundSoundV3(source = SoundSourceV3(t = "library", soundId = id))

    private fun credit(title: String? = null, username: String? = null, releasedAt: Long? = null) =
        BackgroundAudioAnnouncement.Credit(title, username, null, releasedAt)

    private fun text(c: BackgroundAudioAnnouncement.Credit) =
        BackgroundAudioAnnouncement.creditText(c, Locale.FRANCE, ZoneOffset.UTC)

    @Test fun `sans effets ni piste rien n'est annonce`() {
        assertThat(BackgroundAudioAnnouncement.of(null)).isEqualTo(BackgroundAudioAnnouncement.None)
        assertThat(BackgroundAudioAnnouncement.of(StoryEffects())).isEqualTo(BackgroundAudioAnnouncement.None)
    }

    @Test fun `le son du document v3 l'emporte sur la piste de fond et sur l'identifiant herite`() {
        val fx = StoryEffects(
            canvas = CanvasV3(sound = BackgroundSoundV3()),
            backgroundAudioId = "legacy",
            audioPlayerObjects = listOf(StoryAudioPlayerObject("a", isBackground = true, soundId = "x", name = "Titre")),
        )
        assertThat(BackgroundAudioAnnouncement.of(fx)).isEqualTo(BackgroundAudioAnnouncement.Original)
    }

    @Test fun `un son de document emprunte porte le credit de la piste de fond`() {
        val fx = StoryEffects(
            canvas = CanvasV3(sound = library()),
            audioPlayerObjects = listOf(StoryAudioPlayerObject("a", isBackground = true, name = "Pulse", soundAuthorUsername = "belva")),
        )
        assertThat(BackgroundAudioAnnouncement.of(fx)).isEqualTo(credit("Pulse", "belva"))
    }

    @Test fun `la piste de fond sans soundId est originale`() {
        val fx = StoryEffects(backgroundAudioId = "legacy", audioPlayerObjects = listOf(StoryAudioPlayerObject("a", isBackground = true)))
        assertThat(BackgroundAudioAnnouncement.of(fx)).isEqualTo(BackgroundAudioAnnouncement.Original)
    }

    @Test fun `la piste de fond avec soundId est un credit`() {
        val fx = StoryEffects(audioPlayerObjects = listOf(StoryAudioPlayerObject("a", isBackground = true, soundId = "s", name = "Pulse", duration = 12f)))
        assertThat(BackgroundAudioAnnouncement.of(fx)).isEqualTo(BackgroundAudioAnnouncement.Credit("Pulse", null, 12.0, null))
    }

    @Test fun `l'identifiant de fond herite est un credit sans metadonnees`() {
        assertThat(BackgroundAudioAnnouncement.of(StoryEffects(backgroundAudioId = "s"))).isEqualTo(credit())
    }

    @Test fun `un identifiant vide n'annonce rien et une piste de premier plan non plus`() {
        assertThat(BackgroundAudioAnnouncement.of(StoryEffects(backgroundAudioId = ""))).isEqualTo(BackgroundAudioAnnouncement.None)
        val fx = StoryEffects(audioPlayerObjects = listOf(StoryAudioPlayerObject("a", soundId = "s")))
        assertThat(BackgroundAudioAnnouncement.of(fx)).isEqualTo(BackgroundAudioAnnouncement.None)
    }

    @Test fun `la date de creation du son est lue en ISO`() {
        val fx = StoryEffects(audioPlayerObjects = listOf(StoryAudioPlayerObject("a", isBackground = true, soundId = "s", soundAuthorUsername = "belva", soundCreatedAt = "2026-03-12T10:00:00Z")))
        val c = BackgroundAudioAnnouncement.of(fx) as BackgroundAudioAnnouncement.Credit
        assertThat(c.releasedAtEpochMillis).isEqualTo(1773309600000L)
        val bad = fx.copy(audioPlayerObjects = fx.audioPlayerObjects!!.map { it.copy(soundCreatedAt = "hier") })
        assertThat((BackgroundAudioAnnouncement.of(bad) as BackgroundAudioAnnouncement.Credit).releasedAtEpochMillis).isNull()
    }

    @Test fun `creditText joint titre et auteur`() {
        assertThat(text(credit("Pulse", "@belva"))).isEqualTo("Pulse · @belva")
        assertThat(text(credit("Pulse", null))).isEqualTo("Pulse")
    }

    @Test fun `creditText sans titre dit auteur puis date localisee`() {
        val text = text(credit(null, "belva", 1773309600000L))
        assertThat(text).startsWith("@belva · ")
        assertThat(text).contains("2026")
    }

    @Test fun `la date sans auteur n'est pas dite`() {
        assertThat(text(credit(null, null, 1773309600000L))).isEqualTo(BackgroundAudioAnnouncement.UNKNOWN_CREDIT)
        assertThat(text(credit("  ", " @ "))).isEqualTo(BackgroundAudioAnnouncement.UNKNOWN_CREDIT)
    }

    @Test fun `la description parlee dit la nature puis le credit`() {
        val spoken = { a: BackgroundAudioAnnouncement -> BackgroundAudioAnnouncement.spokenDescription(a, "Audio de fond", Locale.FRANCE, ZoneOffset.UTC) }
        assertThat(spoken(BackgroundAudioAnnouncement.None)).isEmpty()
        assertThat(spoken(BackgroundAudioAnnouncement.Original)).isEqualTo("Audio de fond")
        assertThat(spoken(credit())).isEqualTo("Audio de fond")
        assertThat(spoken(credit("Pulse", "belva"))).isEqualTo("Audio de fond · Pulse · @belva")
    }

    @Test fun `le bouton muet existe si et seulement si une piste existe`() {
        assertThat(BackgroundAudioAnnouncement.None.showsMuteControl).isFalse()
        assertThat(BackgroundAudioAnnouncement.Original.showsMuteControl).isTrue()
        assertThat(credit().showsMuteControl).isTrue()
    }

    @Test fun `le credit defilant est plafonne a 18 et suit la taille choisie`() {
        assertThat(BackgroundAudioAnnouncement.creditFontSizeSp(11f)).isEqualTo(11f)
        assertThat(BackgroundAudioAnnouncement.creditFontSizeSp(30f)).isEqualTo(18f)
    }
}
