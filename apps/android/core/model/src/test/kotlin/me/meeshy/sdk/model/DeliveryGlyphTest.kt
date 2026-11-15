package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DeliveryGlyphTest {
    private fun glyph(s: DeliveryGlyphState, offline: Boolean = false, revealed: Boolean = true) =
        DeliveryGlyphs.resolve(s, offline, revealed)

    @Test fun `invisible ne montre rien`() {
        assertThat(glyph(DeliveryGlyphState.Invisible).shape).isEqualTo(DeliveryGlyphShape.None)
    }

    @Test fun `l'envoi frais reste cache avant la revelation`() {
        assertThat(glyph(DeliveryGlyphState.Sending, revealed = false).shape).isEqualTo(DeliveryGlyphShape.None)
        assertThat(glyph(DeliveryGlyphState.Sending).shape).isEqualTo(DeliveryGlyphShape.Clock)
    }

    @Test fun `lent est une horloge orange`() {
        val g = glyph(DeliveryGlyphState.Slow)
        assertThat(g.shape).isEqualTo(DeliveryGlyphShape.Clock)
        assertThat(g.tone).isEqualTo(DeliveryGlyphTone.Warning)
    }

    @Test fun `hors ligne un envoi en vol montre un sablier orange meme masque`() {
        listOf(DeliveryGlyphState.Sending, DeliveryGlyphState.Clock, DeliveryGlyphState.Slow).forEach {
            val g = glyph(it, offline = true, revealed = false)
            assertThat(g.shape).isEqualTo(DeliveryGlyphShape.Hourglass)
            assertThat(g.tone).isEqualTo(DeliveryGlyphTone.Warning)
            assertThat(g.label).isEqualTo(DeliveryGlyphLabel.OfflinePending)
        }
    }

    @Test fun `hors ligne n'affecte pas les etats regles`() {
        assertThat(glyph(DeliveryGlyphState.Sent, offline = true).shape).isEqualTo(DeliveryGlyphShape.Check)
        assertThat(glyph(DeliveryGlyphState.Failed, offline = true).shape).isEqualTo(DeliveryGlyphShape.ErrorCircle)
    }

    @Test fun `envoye distribue lu`() {
        assertThat(glyph(DeliveryGlyphState.Sent).shape).isEqualTo(DeliveryGlyphShape.Check)
        assertThat(glyph(DeliveryGlyphState.Delivered).shape).isEqualTo(DeliveryGlyphShape.DoubleCheck)
        assertThat(glyph(DeliveryGlyphState.Delivered).tone).isEqualTo(DeliveryGlyphTone.Meta)
        val read = glyph(DeliveryGlyphState.Read)
        assertThat(read.shape).isEqualTo(DeliveryGlyphShape.DoubleCheck)
        assertThat(read.tone).isEqualTo(DeliveryGlyphTone.Read)
    }

    @Test fun `echec est rouge`() {
        assertThat(glyph(DeliveryGlyphState.Failed).tone).isEqualTo(DeliveryGlyphTone.Error)
    }

    @Test fun `chaque etat visible a un libelle TalkBack`() {
        DeliveryGlyphState.values().filter { it != DeliveryGlyphState.Invisible }.forEach {
            assertThat(glyph(it).label).isNotNull()
        }
    }

    @Test fun `la coche lue est indigo 400 en sombre et sur overlay et 600 en clair`() {
        assertThat(DeliveryGlyphs.readShade(isDark = true, onOverlay = false)).isEqualTo(ReadShade.Indigo400)
        assertThat(DeliveryGlyphs.readShade(isDark = false, onOverlay = true)).isEqualTo(ReadShade.Indigo400)
        assertThat(DeliveryGlyphs.readShade(isDark = false, onOverlay = false)).isEqualTo(ReadShade.Indigo600)
    }

    @Test fun `le bouton renvoyer se tait quand la bande est affichee`() {
        assertThat(DeliveryGlyphs.footerShowsRetry(isFailed = true, retryBandShown = false)).isTrue()
        assertThat(DeliveryGlyphs.footerShowsRetry(isFailed = true, retryBandShown = true)).isFalse()
        assertThat(DeliveryGlyphs.footerShowsRetry(isFailed = false, retryBandShown = false)).isFalse()
    }
}
