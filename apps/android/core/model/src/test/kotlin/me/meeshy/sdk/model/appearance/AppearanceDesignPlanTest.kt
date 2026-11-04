package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppearanceDesignPlanTest {

    private val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())
    private val animated = ConversationAppearance().withDesign("animes", "bulles-legeres")

    private fun plan(
        appearance: ConversationAppearance?,
        lowPower: Boolean = false,
        reduceMotion: Boolean = false,
    ) = AppearanceDesignPlan.of(appearance, isDark = false, catalog = catalog, lowPower = lowPower, reduceMotion = reduceMotion)

    @Test
    fun `un modele anime joue sa couche quand Animer est actif`() {
        val plan = plan(animated) as AppearanceDesignPlan.Painted
        assertThat(plan.lottie).isNotNull()
        assertThat(plan.layerMotion).isEqualTo(AppearanceDesignPlan.LayerMotion.ANIMATED)
    }

    @Test
    fun `l economie d energie fige la couche sur sa premiere image`() {
        val plan = plan(animated, lowPower = true) as AppearanceDesignPlan.Painted
        assertThat(plan.layerMotion).isEqualTo(AppearanceDesignPlan.LayerMotion.FIRST_FRAME)
    }

    @Test
    fun `reduire les animations fige la couche sur sa premiere image`() {
        val plan = plan(animated, reduceMotion = true) as AppearanceDesignPlan.Painted
        assertThat(plan.layerMotion).isEqualTo(AppearanceDesignPlan.LayerMotion.FIRST_FRAME)
    }

    @Test
    fun `Animer coupe fige la couche`() {
        val plan = plan(animated.copy(animate = false)) as AppearanceDesignPlan.Painted
        assertThat(plan.layerMotion).isEqualTo(AppearanceDesignPlan.LayerMotion.FIRST_FRAME)
    }

    @Test
    fun `un modele inconnu retombe sur Signature`() {
        assertThat(plan(ConversationAppearance().withDesign("animes", "inconnu"))).isEqualTo(AppearanceDesignPlan.Signature)
        assertThat(plan(ConversationAppearance().withDesign("pack-inconnu", "x"))).isEqualTo(AppearanceDesignPlan.Signature)
    }

    @Test
    fun `sans choix ou avec une couleur unie le plan est Signature`() {
        assertThat(plan(null)).isEqualTo(AppearanceDesignPlan.Signature)
        assertThat(plan(ConversationAppearance())).isEqualTo(AppearanceDesignPlan.Signature)
    }
}
