package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameStyleRuleTest {

    private val declined: CallFrameDesign get() = CallFrameCatalogue.all.first { it.styles.isNotEmpty() }

    @Test
    fun `les declinaisons des JSON partages sont lues, et le catalogue garde ses seuls cadres de base`() {
        assertThat(CallFrameCatalogue.all.count { it.styles.isNotEmpty() }).isGreaterThan(0)
        assertThat(CallFrameCatalogue.all.all { it.styleId == null }).isTrue()
    }

    @Test
    fun `un cadre decline porte l identifiant du cadre suivi du sien, et l habillage de la declinaison`() {
        val base = declined
        val style = base.styles.first()
        val styled = CallFrameStyleRule.styled(base, style)
        assertThat(styled.id).isEqualTo("${base.id}.${style.id}")
        assertThat(styled.styleId).isEqualTo(style.id)
        assertThat(styled.look).isEqualTo(style.look)
        assertThat(styled.bucket).isEqualTo(base.bucket)
        assertThat(styled.surfaces).isEqualTo(base.surfaces)
        assertThat(CallLiveFrameRule.isFrameId(styled.id)).isTrue()
    }

    @Test
    fun `une declinaison ne remplace que les cles qu elle declare`() {
        val base = declined
        val style = base.styles.first()
        assertThat(style.look.layout).isEqualTo(base.look.layout)
    }

    @Test
    fun `un identifiant decline se resout, un style inconnu ne resout rien`() {
        val base = declined
        val style = base.styles.first()
        assertThat(CallFrameCatalogue.frame("${base.id}.${style.id}")?.look).isEqualTo(style.look)
        assertThat(CallFrameCatalogue.frame(base.id)).isEqualTo(base)
        assertThat(CallFrameCatalogue.frame("${base.id}.inconnu")).isNull()
        assertThat(CallFrameStyleRule.baseId("${base.id}.${style.id}")).isEqualTo(base.id)
        assertThat(CallFrameStyleRule.baseId(base.id)).isEqualTo(base.id)
    }

    @Test
    fun `les declinaisons d un cadre commencent par sa base, et la voisine ne boucle pas`() {
        val base = declined
        val ids = CallFrameStyleRule.declinations(base.id).map { it.id }
        assertThat(ids.first()).isEqualTo(base.id)
        assertThat(ids).hasSize(base.styles.size + 1)
        assertThat(CallFrameStyleRule.neighbour(base.id, offset = 1)?.id).isEqualTo(ids[1])
        assertThat(CallFrameStyleRule.neighbour(base.id, offset = -1)).isNull()
        assertThat(CallFrameStyleRule.neighbour(ids.last(), offset = 1)).isNull()
        assertThat(CallFrameStyleRule.declinations("inconnu.cadre.duo")).isEmpty()
    }

    @Test
    fun `la declinaison partagee par l autre s affiche comme son cadre de base`() {
        val base = CallLiveFrameRule.frames().first { it.styles.isNotEmpty() }
        val id = "${base.id}.${base.styles.first().id}"
        assertThat(CallLiveFrameRule.displayed(id, participants = 2)?.id).isEqualTo(id)
    }
}
