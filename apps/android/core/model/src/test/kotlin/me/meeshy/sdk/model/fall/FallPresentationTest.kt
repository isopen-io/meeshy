package me.meeshy.sdk.model.fall

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.inactivity.InactivityLastBattery
import me.meeshy.sdk.model.inactivity.InactivityLastPosition
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.syncpill.SyncPillGlyph
import org.junit.Test

class FallPresentationTest {
    @Test
    fun `la batterie est bornee et la carte s'ouvre sur la derniere position`() {
        assertThat(FallPresentation.batteryPercent(InactivityLastBattery(140, 0L))).isEqualTo(100)
        assertThat(FallPresentation.mapUri(InactivityLastPosition(48.85, 2.35, null, 0L))).isEqualTo("geo:48.85,2.35?q=48.85,2.35")
    }

    @Test
    fun `le reglage se propose aux Sangs seulement, et ma propre chute ne m'est jamais montree`() {
        assertThat(FallPersonRules.mayShare(RelationLevel.BLOOD)).isTrue()
        assertThat(FallPersonRules.mayShare(RelationLevel.CLOSE)).isFalse()
        assertThat(FallPersonRules.shows("a", viewerId = "me")).isTrue()
        assertThat(FallPersonRules.shows("me", viewerId = "me")).isFalse()
        assertThat(FallPersonRules.shows(null, viewerId = "me")).isFalse()
    }

    @Test
    fun `la pastille defile, ne rejoue jamais une annonce vue, et le retour remplace la chute`() {
        val first = FallPillAnnouncements().announce("fall:a:detected:1", "a", "Une chute a été détectée sur la montre de Awa", nowMs = 0L)
        assertThat(first.announce("fall:a:detected:1", "a", "encore", nowMs = 1L)).isEqualTo(first)
        val back = first.announce("fall:a:responded:2", "a", "Awa va bien", nowMs = 2L)
        assertThat(back.items.map { it.label }).containsExactly("Awa va bien")
        assertThat(back.entries().single().glyph).isEqualTo(SyncPillGlyph.FALL)
        assertThat(back.expire(2L + FallPillAnnouncements.VISIBLE_MS).items).isEmpty()
    }
}
