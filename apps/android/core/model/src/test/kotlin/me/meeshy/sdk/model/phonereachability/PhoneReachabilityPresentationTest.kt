package me.meeshy.sdk.model.phonereachability

import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.connection.ConnectionPill
import me.meeshy.sdk.model.connection.SyncPillEntryKind
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.syncpill.SyncPillGlyph
import me.meeshy.sdk.model.syncpill.SyncPillPresenter
import me.meeshy.sdk.model.syncpill.SyncPillTapOutcome
import org.junit.Test

class PhoneReachabilityPresentationTest {
    private val paris = ZoneId.of("Europe/Paris")
    private val tokyo = ZoneId.of("Asia/Tokyo")

    private fun at(zone: ZoneId, y: Int, mo: Int, d: Int, h: Int, mi: Int): Long =
        LocalDateTime.of(y, mo, d, h, mi).atZone(zone).toInstant().toEpochMilli()

    private fun announcement(kind: PhoneReachabilityAnnouncementKind = PhoneReachabilityAnnouncementKind.UNREACHABLE, at: Long = 1L) =
        PhoneReachabilityAnnouncement(kind, at)

    @Test
    fun `aujourd'hui, l'heure locale du lecteur seule`() {
        val since = at(paris, 2026, 11, 15, 14, 10)
        val now = at(paris, 2026, 11, 15, 18, 0)
        assertThat(PhoneReachabilityPresentation.sinceText(since, now, paris, Locale.FRENCH)).isEqualTo("14:10")
    }

    @Test
    fun `l'heure suit le fuseau du lecteur, pas celui de l'emetteur`() {
        val since = at(paris, 2026, 11, 15, 14, 10)
        val now = at(tokyo, 2026, 11, 15, 23, 30)
        assertThat(PhoneReachabilityPresentation.sinceText(since, now, tokyo, Locale.FRENCH)).isEqualTo("22:10")
    }

    @Test
    fun `hors aujourd'hui, le jour est dit`() {
        val since = at(paris, 2026, 11, 14, 23, 50)
        val now = at(paris, 2026, 11, 15, 0, 20)
        val text = PhoneReachabilityPresentation.sinceText(since, now, paris, Locale.FRENCH)
        assertThat(text).isEqualTo("samedi 23:50")
        val older = PhoneReachabilityPresentation.sinceText(at(paris, 2026, 11, 2, 9, 5), now, paris, Locale.FRENCH)
        assertThat(older).contains("09:05")
        assertThat(older).contains("2026")
    }

    @Test
    fun `une date a venir se lit aujourd'hui`() {
        val since = at(paris, 2026, 11, 15, 18, 5)
        val now = at(paris, 2026, 11, 15, 18, 0)
        assertThat(PhoneReachabilityPresentation.sinceText(since, now, paris, Locale.FRENCH)).isEqualTo("18:05")
    }

    @Test
    fun `la cause probable a sa ligne, une cause inconnue se tait`() {
        assertThat(PhoneReachabilityPresentation.causeKey(PhoneUnreachableCause.BATTERY)).isEqualTo("phone.cause.battery")
        assertThat(PhoneReachabilityPresentation.causeKey(PhoneUnreachableCause.NETWORK)).isEqualTo("phone.cause.network")
        assertThat(PhoneReachabilityPresentation.causeKey(PhoneUnreachableCause.UNKNOWN)).isNull()
        assertThat(PhoneReachabilityPresentation.pillKey(PhoneReachabilityAnnouncementKind.REACHABLE)).isEqualTo("phone.pill.reachable")
    }

    @Test
    fun `le partage s'offre des Proche, le consentement une fois et jamais a un Sang`() {
        assertThat(PhoneReachabilityPersonRules.mayShare(RelationLevel.FRIEND)).isFalse()
        assertThat(PhoneReachabilityPersonRules.mayShare(RelationLevel.CLOSE)).isTrue()
        assertThat(PhoneReachabilityPersonRules.mayShare(RelationLevel.BLOOD)).isTrue()
        assertThat(PhoneReachabilityPersonRules.offersConsent(RelationLevel.CLOSE, shared = false, alreadyOffered = false, sharingEnabled = true)).isTrue()
        assertThat(PhoneReachabilityPersonRules.offersConsent(RelationLevel.CLOSE, shared = false, alreadyOffered = true, sharingEnabled = true)).isFalse()
        assertThat(PhoneReachabilityPersonRules.offersConsent(RelationLevel.CLOSE, shared = true, alreadyOffered = false, sharingEnabled = true)).isFalse()
        assertThat(PhoneReachabilityPersonRules.offersConsent(RelationLevel.BLOOD, shared = false, alreadyOffered = false, sharingEnabled = true)).isFalse()
        assertThat(PhoneReachabilityPersonRules.offersConsent(RelationLevel.CLOSE, shared = false, alreadyOffered = false, sharingEnabled = false)).isFalse()
    }

    @Test
    fun `mon propre etat ne m'est jamais montre`() {
        assertThat(PhoneReachabilityPersonRules.shows("me", "me")).isFalse()
        assertThat(PhoneReachabilityPersonRules.shows("ada", "me")).isTrue()
        assertThat(PhoneReachabilityPersonRules.shows(null, "me")).isFalse()
        assertThat(PhoneReachabilityPersonRules.shows("ada", null)).isTrue()
    }

    @Test
    fun `une annonce defile puis quitte la pastille et ne revient jamais`() {
        val shown = PhoneReachabilityPillAnnouncements().announce("a", announcement(at = 10L), "Le téléphone d'Ada est injoignable", 0L)
        assertThat(shown.entries().map { it.literalLabel }).containsExactly("Le téléphone d'Ada est injoignable")
        val gone = shown.expire(PhoneReachabilityPillAnnouncements.VISIBLE_MS)
        assertThat(gone.entries()).isEmpty()
        assertThat(gone.announce("a", announcement(at = 10L), "x", 10_000L).entries()).isEmpty()
    }

    @Test
    fun `le retour remplace l'annonce d'injoignabilite de la meme personne`() {
        val first = PhoneReachabilityPillAnnouncements().announce("a", announcement(at = 1L), "injoignable", 0L)
        val second = first.announce("a", announcement(PhoneReachabilityAnnouncementKind.REACHABLE, at = 2L), "répond", 100L)
        assertThat(second.entries().map { it.literalLabel }).containsExactly("répond")
        assertThat(second.nextExpiryMs()).isEqualTo(100L + PhoneReachabilityPillAnnouncements.VISIBLE_MS)
    }

    @Test
    fun `une annonce n'est jamais lue comme en cours ni persistante, avec son glyphe`() {
        val entries = PhoneReachabilityPillAnnouncements().announce("a", announcement(), "x", 0L).entries()
        assertThat(entries.single().kind).isEqualTo(SyncPillEntryKind.ANNOUNCEMENT)
        val rows = SyncPillPresenter.rows(ConnectionPill.HIDDEN, entries)
        val row = rows.single()
        assertThat(row.glyph).isEqualTo(SyncPillGlyph.PHONE_UNREACHABLE)
        assertThat(row.showsActivityDots).isFalse()
        assertThat(row.tapOutcome).isEqualTo(SyncPillTapOutcome.Advance)
        assertThat(SyncPillPresenter.isPersistent(rows)).isFalse()
    }
}
