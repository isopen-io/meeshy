package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Miroir des cas de `packages/shared/__tests__/game/banner-recall.test.ts` (#17366, retouche 3). */
class GameBannerRecallTest {

    private fun moment(done: Int = 0, chest: Boolean = false, risk: Boolean = false) =
        GameBannerMoment(actsDone = done, attention = GameAttention(chestReady = chest, flameAtRisk = risk))

    @Test
    fun `un acte du jour realise rappelle le bandeau`() {
        assertThat(GameBannerRecall.reason(moment(done = 1), moment(done = 2))).isEqualTo(GameBannerRecall.Act)
    }

    @Test
    fun `l'Offrande qui devient prete l'emporte sur l'acte qui l'a ouverte`() {
        assertThat(GameBannerRecall.reason(moment(done = 2), moment(done = 3, chest = true)))
            .isEqualTo(GameBannerRecall.OfferingReady)
    }

    @Test
    fun `la Flamme qui passe a risque rappelle le bandeau, apres un acte du meme instant`() {
        assertThat(GameBannerRecall.reason(moment(), moment(risk = true))).isEqualTo(GameBannerRecall.FlameAtRisk)
        assertThat(GameBannerRecall.reason(moment(), moment(done = 1, risk = true))).isEqualTo(GameBannerRecall.Act)
    }

    @Test
    fun `un signal deja leve ou qui retombe ne rappelle rien`() {
        assertThat(GameBannerRecall.reason(moment(chest = true), moment(chest = true))).isNull()
        assertThat(GameBannerRecall.reason(moment(risk = true), moment(risk = true))).isNull()
        assertThat(GameBannerRecall.reason(moment(done = 3), moment(done = 0))).isNull()
        assertThat(GameBannerRecall.reason(moment(chest = true), moment())).isNull()
    }

    @Test
    fun `la premiere lecture et un bloc qui disparait ne rappellent rien`() {
        assertThat(GameBannerRecall.reason(null, moment(done = 2, chest = true, risk = true))).isNull()
        assertThat(GameBannerRecall.reason(moment(done = 1), null)).isNull()
    }

    @Test
    fun `Jeu masque ou aucun bloc, aucun moment`() {
        assertThat(GameBannerMoment.of(null, hidden = false)).isNull()
    }

    @Test
    fun `le rappel dure quelques secondes, comme le web et iOS`() {
        assertThat(GameBannerRecall.DURATION_MS).isEqualTo(5_000L)
    }
}
