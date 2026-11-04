package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConceptEmblemDesignTest {

    @Test
    fun `les etincelles reprennent le jeton indigo et l etincelle d or de concept-emblems ts`() {
        val design = ConceptEmblemDesign.of(ConceptEmblemKind.Points)
        assertThat(design.paint).isEqualTo(ConceptEmblemPaint.Indigo)
        assertThat(design.body).isEqualTo(ConceptEmblemBody.Circle(34f, 38f, 28f))
        assertThat(design.signature).isEqualTo(ConceptEmblemSignature(34f, 38f, 38f, 100f))
        val spark = design.accents.single() as ConceptEmblemAccent.Spark
        assertThat(spark.tone).isEqualTo(ConceptEmblemTone.Gold)
        assertThat(spark.points.map { it.x to it.y }).containsExactly(
            56f to 4f, 59f to 13f, 68f to 16f, 59f to 19f, 56f to 28f, 53f to 19f, 44f to 16f, 53f to 13f,
        ).inOrder()
    }

    @Test
    fun `les elans reprennent le carre flamme et son chevron`() {
        val design = ConceptEmblemDesign.of(ConceptEmblemKind.Elans)
        assertThat(design.paint).isEqualTo(ConceptEmblemPaint.Flame)
        assertThat(design.body).isEqualTo(ConceptEmblemBody.Rect(8f, 8f, 56f, 56f, 18f))
        assertThat(design.signature).isEqualTo(ConceptEmblemSignature(36f, 47f, 32f, 104f))
        val chevron = design.accents.single() as ConceptEmblemAccent.Chevron
        assertThat(chevron.strokeWidth).isEqualTo(6f)
        assertThat(chevron.tone).isEqualTo(ConceptEmblemTone.Ink)
        assertThat(chevron.points.map { it.x to it.y }).containsExactly(23f to 30f, 36f to 17f, 49f to 30f).inOrder()
    }

    @Test
    fun `la boite est le carre de soixante-douze`() {
        assertThat(ConceptEmblemDesign.BOX).isEqualTo(72f)
    }

    @Test
    fun `l entree decale de quatre centiemes par carte et plafonne a quatre dixiemes`() {
        assertThat(GameStaggeredEntranceLaw.delaySeconds(0)).isEqualTo(0.0)
        assertThat(GameStaggeredEntranceLaw.delayMillis(1)).isEqualTo(40)
        assertThat(GameStaggeredEntranceLaw.delayMillis(5)).isEqualTo(200)
        assertThat(GameStaggeredEntranceLaw.delayMillis(10)).isEqualTo(400)
        assertThat(GameStaggeredEntranceLaw.delayMillis(15)).isEqualTo(400)
        assertThat(GameStaggeredEntranceLaw.delayMillis(-3)).isEqualTo(0)
    }

    @Test
    fun `l entree ne se joue qu une fois et jamais en mouvement reduit`() {
        assertThat(GameStaggeredEntranceLaw.plays(entered = false, reduceMotion = false)).isTrue()
        assertThat(GameStaggeredEntranceLaw.plays(entered = true, reduceMotion = false)).isFalse()
        assertThat(GameStaggeredEntranceLaw.plays(entered = false, reduceMotion = true)).isFalse()
        assertThat(GameStaggeredEntranceLaw.isResting(entered = false, reduceMotion = true)).isTrue()
    }
}
