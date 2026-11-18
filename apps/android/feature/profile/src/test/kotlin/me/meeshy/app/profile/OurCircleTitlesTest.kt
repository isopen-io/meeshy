package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.profile.ProfileFace
import me.meeshy.sdk.model.relation.OurCircleView
import me.meeshy.sdk.model.relation.RelationFeature
import me.meeshy.sdk.model.relation.RelationLevel
import org.junit.Test

class OurCircleTitlesTest {
    @Test
    fun `every capability that Notre cercle tells has a title, so no row is ever blank`() {
        OurCircleView.FEATURES.forEach { feature ->
            assertThat(feature.titleRes()).isNotNull()
        }
    }

    @Test
    fun `Notre cercle only tells capabilities the Vitrine already names, never a second vocabulary`() {
        val named = VitrineCapability.entries.map { it.feature }.toSet()
        assertThat(OurCircleView.FEATURES.toSet() - named).isEmpty()
    }

    @Test
    fun `a feature the Vitrine does not name has no title`() {
        assertThat(RelationFeature.ACQUAINTANCE_AUTO.titleRes()).isNull()
    }

    @Test
    fun `each face has its own title and each circle its own glyph`() {
        assertThat(ProfileFace.entries.map { it.titleRes() }.toSet()).hasSize(ProfileFace.entries.size)
        assertThat(RelationLevel.entries.map { it.glyph() }.toSet()).hasSize(RelationLevel.entries.size)
    }
}
