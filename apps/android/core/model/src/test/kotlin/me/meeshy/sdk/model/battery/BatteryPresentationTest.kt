package me.meeshy.sdk.model.battery

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.connection.SyncPillEntryKind
import me.meeshy.sdk.model.connection.ConnectionPill
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.syncpill.SyncPillGlyph
import me.meeshy.sdk.model.syncpill.SyncPillPresenter
import me.meeshy.sdk.model.syncpill.SyncPillTapOutcome
import org.junit.Test

class BatteryPresentationTest {
    private fun state(
        level: Int = 18,
        phase: BatteryPhase = BatteryPhase.LOW,
        charging: Boolean = false,
        estimated: Int? = null,
        measuredAt: Long = 0L,
    ) = BatteryState("a", phase, level, charging, lowPower = false, estimatedMinutes = estimated, measuredAtMillis = measuredAt, deviceLabel = null)

    private fun announcement(kind: BatteryAnnouncementKind, at: Long = 1L, level: Int? = 20, threshold: Int? = null) =
        BatteryAnnouncement(kind, level, threshold, at)

    @Test
    fun `la teinte suit la phase et la charge`() {
        assertThat(BatteryPresentation.tone(state())).isEqualTo(BatteryTone.LOW)
        assertThat(BatteryPresentation.tone(state(level = 4, phase = BatteryPhase.CRITICAL))).isEqualTo(BatteryTone.CRITICAL)
        assertThat(BatteryPresentation.tone(state(level = 4, phase = BatteryPhase.CHARGING, charging = true))).isEqualTo(BatteryTone.CHARGING)
        assertThat(BatteryPresentation.tone(state(level = 1, phase = BatteryPhase.OFF))).isEqualTo(BatteryTone.OFF)
    }

    @Test
    fun `un appareil eteint se dessine vide`() {
        assertThat(BatteryPresentation.fill(state(level = 2, phase = BatteryPhase.OFF))).isEqualTo(0f)
        assertThat(BatteryPresentation.fill(state(level = 25))).isEqualTo(0.25f)
    }

    @Test
    fun `il y a X min ne devient jamais negatif`() {
        assertThat(BatteryPresentation.minutesAgo(state(measuredAt = 0L), 7 * 60_000L + 59_000L)).isEqualTo(7)
        assertThat(BatteryPresentation.minutesAgo(state(measuredAt = 10_000L), 0L)).isEqualTo(0)
    }

    @Test
    fun `l'autonomie se dit en heures et minutes et se tait en charge`() {
        assertThat(BatteryPresentation.autonomy(state(estimated = 95))).isEqualTo(BatteryAutonomy(1, 35))
        assertThat(BatteryPresentation.autonomy(state(estimated = 95, charging = true))).isNull()
        assertThat(BatteryPresentation.autonomy(state(estimated = null))).isNull()
    }

    @Test
    fun `un palier se dit par le palier franchi`() {
        assertThat(BatteryPresentation.pillLevel(announcement(BatteryAnnouncementKind.THRESHOLD, level = 24, threshold = 25))).isEqualTo(25)
        assertThat(BatteryPresentation.pillLevel(announcement(BatteryAnnouncementKind.LOW, level = 29))).isEqualTo(29)
        assertThat(BatteryPresentation.pillKey(BatteryAnnouncementKind.PROBABLY_OFF)).isEqualTo("battery.pill.probably-off")
    }

    @Test
    fun `le partage s'offre des Proche et le releve a la demande au Sang seul`() {
        assertThat(BatteryPersonRules.mayShare(RelationLevel.FRIEND)).isFalse()
        assertThat(BatteryPersonRules.mayShare(RelationLevel.CLOSE)).isTrue()
        assertThat(BatteryPersonRules.mayPull(RelationLevel.CLOSE)).isFalse()
        assertThat(BatteryPersonRules.mayPull(RelationLevel.BLOOD)).isTrue()
    }

    @Test
    fun `le consentement d'un Proche est propose une fois et jamais a un Sang`() {
        assertThat(BatteryPersonRules.offersConsent(RelationLevel.CLOSE, shared = false, alreadyOffered = false, sharingEnabled = true)).isTrue()
        assertThat(BatteryPersonRules.offersConsent(RelationLevel.CLOSE, shared = false, alreadyOffered = true, sharingEnabled = true)).isFalse()
        assertThat(BatteryPersonRules.offersConsent(RelationLevel.CLOSE, shared = true, alreadyOffered = false, sharingEnabled = true)).isFalse()
        assertThat(BatteryPersonRules.offersConsent(RelationLevel.BLOOD, shared = false, alreadyOffered = false, sharingEnabled = true)).isFalse()
        assertThat(BatteryPersonRules.offersConsent(RelationLevel.CLOSE, shared = false, alreadyOffered = false, sharingEnabled = false)).isFalse()
    }

    @Test
    fun `une annonce defile puis quitte la pastille et ne revient jamais`() {
        val critical = announcement(BatteryAnnouncementKind.CRITICAL, at = 10L, level = 5)
        val shown = BatteryPillAnnouncements().announce("a", critical, "Alice · 5 %", nowMs = 0L)
        assertThat(shown.entries().map { it.literalLabel }).containsExactly("Alice · 5 %")
        val gone = shown.expire(BatteryPillAnnouncements.VISIBLE_MS)
        assertThat(gone.entries()).isEmpty()
        assertThat(gone.announce("a", critical, "Alice · 5 %", nowMs = 10_000L).entries()).isEmpty()
    }

    @Test
    fun `une nouvelle annonce de la meme personne remplace la precedente`() {
        val first = BatteryPillAnnouncements().announce("a", announcement(BatteryAnnouncementKind.LOW, at = 1L), "low", 0L)
        val second = first.announce("a", announcement(BatteryAnnouncementKind.THRESHOLD, at = 2L), "25", 100L)
        assertThat(second.entries().map { it.literalLabel }).containsExactly("25")
        assertThat(second.nextExpiryMs()).isEqualTo(100L + BatteryPillAnnouncements.VISIBLE_MS)
    }

    @Test
    fun `une annonce n'est jamais lue comme en cours ni persistante`() {
        val entries = BatteryPillAnnouncements().announce("a", announcement(BatteryAnnouncementKind.CRITICAL), "x", 0L).entries()
        assertThat(entries.single().kind).isEqualTo(SyncPillEntryKind.ANNOUNCEMENT)
        val rows = SyncPillPresenter.rows(ConnectionPill.HIDDEN, entries)
        val row = rows.single()
        assertThat(row.glyph).isEqualTo(SyncPillGlyph.BATTERY)
        assertThat(row.showsActivityDots).isFalse()
        assertThat(row.tapOutcome).isEqualTo(SyncPillTapOutcome.Advance)
        assertThat(SyncPillPresenter.isPersistent(rows)).isFalse()
    }

    @Test
    fun `une annonce ne masque pas la ligne de synchronisation`() {
        val entries = BatteryPillAnnouncements().announce("a", announcement(BatteryAnnouncementKind.LOW), "x", 0L).entries()
        val rows = SyncPillPresenter.rows(ConnectionPill.SYNCING, entries)
        assertThat(rows.map { it.id }).contains("status.syncing")
    }
}
