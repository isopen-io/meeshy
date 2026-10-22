package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocialEventV2LimitsTest {

    @Test
    fun `une fraction est arrondie a deux decimales`() {
        assertThat(SocialEventV2Wire.fraction(0.456)).isEqualTo(0.46)
        assertThat(SocialEventV2Wire.fraction(0.123)).isEqualTo(0.12)
    }

    @Test
    fun `NaN et infini valent zero`() {
        assertThat(SocialEventV2Wire.fraction(Double.NaN)).isEqualTo(0.0)
        assertThat(SocialEventV2Wire.fraction(Double.POSITIVE_INFINITY)).isEqualTo(0.0)
        assertThat(SocialEventV2Wire.fraction(Double.NEGATIVE_INFINITY)).isEqualTo(0.0)
    }

    @Test
    fun `une fraction hors bornes est ramenee dans 0 a 1`() {
        assertThat(SocialEventV2Wire.fraction(1.7)).isEqualTo(1.0)
        assertThat(SocialEventV2Wire.fraction(-0.4)).isEqualTo(0.0)
    }

    @Test
    fun `reasonCode et notificationType sont tronques a 64`() {
        val long = "x".repeat(100)
        val negative = SocialNegative(SocialNegative.Action.REPORT_SUBMIT, reasonCode = long).fields()
        assertThat(negative["reasonCode"].toString()).isEqualTo("\"" + "x".repeat(64) + "\"")
        val notif = SocialNotificationEvent(SocialNotificationEvent.Action.RECEIVED, long, SocialNotificationEvent.Channel.FCM).fields()
        assertThat(notif["notificationType"].toString()).isEqualTo("\"" + "x".repeat(64) + "\"")
    }

    @Test
    fun `un evenement de plus de 2 Kio n'est pas encode`() {
        val big = event(SocialNegative(SocialNegative.Action.HIDE), surface = "s".repeat(3_000))
        assertThat(SocialEventV2Wire.encode(big)).isNull()
        assertThat(SocialEventV2Wire.encode(event(SocialNegative(SocialNegative.Action.HIDE)))).isNotNull()
    }

    @Test
    fun `la limite de 2 Kio se mesure en octets UTF-8`() {
        val padding = SocialEventV2Wire.MAX_EVENT_BYTES
        val multibyte = event(SocialNegative(SocialNegative.Action.HIDE), surface = "é".repeat(padding / 2))
        assertThat(SocialEventV2Wire.encode(multibyte)).isNull()
    }

    @Test
    fun `une requete est plafonnee a 200 evenements`() {
        assertThat(SocialEventV2Wire.capBatch((1..450).toList())).hasSize(200)
        assertThat(SocialEventV2Wire.capBatch((1..3).toList())).hasSize(3)
    }

    @Test
    fun `un evenement de plus de 72 h est perime`() {
        val h = 3_600_000L
        assertThat(SocialEventV2Wire.isFresh(T0, T0 + 72 * h)).isTrue()
        assertThat(SocialEventV2Wire.isFresh(T0, T0 + 72 * h + 1)).isFalse()
    }

    @Test
    fun `un quick skip n'existe que sous une seconde de visibilite`() {
        assertThat(SocialNegative.quickSkip(999)).isNotNull()
        assertThat(SocialNegative.quickSkip(0)!!.action).isEqualTo("quick_skip")
        assertThat(SocialNegative.quickSkip(1_000)).isNull()
        assertThat(SocialNegative.quickSkip(-1)).isNull()
    }

    @Test
    fun `un hashtag est en minuscules sans diese et borne a 100`() {
        assertThat(SocialTarget.hashtag("  #Paris ").id).isEqualTo("paris")
        assertThat(SocialTarget.hashtag("a".repeat(150)).id).hasLength(100)
    }

    @Test
    fun `un lien se nomme par son jeton sinon par son domaine enregistrable`() {
        assertThat(SocialTarget.link("www.blog.example.co.uk", trackingLinkId = "t9")!!.id).isEqualTo("t9")
        assertThat(SocialTarget.link("www.blog.example.co.uk")!!.id).isEqualTo("example.co.uk")
        assertThat(SocialTarget.link("sub.meeshy.me")!!.id).isEqualTo("meeshy.me")
        assertThat(SocialTarget.link("192.168.0.1")).isNull()
        assertThat(SocialTarget.link("localhost")).isNull()
        assertThat(SocialTarget.link(null)).isNull()
    }

    @Test
    fun `une source de classement inconnue se replie sur other`() {
        assertThat(SocialRankingSource.served("for_you")).isEqualTo(SocialRankingSource.FOR_YOU)
        assertThat(SocialRankingSource.served("warp")).isEqualTo(SocialRankingSource.OTHER)
        assertThat(SocialRankingSource.served(null)).isEqualTo(SocialRankingSource.OTHER)
    }
}
