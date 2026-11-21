package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RelationOpeningsTest {
    @Test
    fun `a capability opens at the level the access law gives it`() {
        assertThat(RelationOpenings.opensAt(RelationFeature.TALKIE)).isEqualTo(RelationLevel.CLOSE)
        assertThat(RelationOpenings.opensAt(RelationFeature.BRING)).isEqualTo(RelationLevel.FRIEND)
        assertThat(RelationOpenings.opensAt(RelationFeature.DM_REQUEST)).isEqualTo(RelationLevel.PUBLIC)
        assertThat(RelationOpenings.opensAt(RelationFeature.LOCATION_LIVE)).isEqualTo(RelationLevel.BLOOD)
        assertThat(RelationOpenings.opensAt(RelationFeature.PRESENCE_DETAILED)).isEqualTo(RelationLevel.CLOSE)
    }

    @Test
    fun `the opening level is never written twice, it equals the minimum of the law for every feature`() {
        RelationFeature.entries
            .filter { it != RelationFeature.ACQUAINTANCE_AUTO }
            .forEach { feature -> assertThat(RelationOpenings.opensAt(feature)).isEqualTo(feature.minimumLevel) }
    }

    @Test
    fun `a level opens what its rung reaches and nothing above`() {
        assertThat(RelationOpenings.isOpen(RelationLevel.FRIEND, RelationFeature.TALKIE)).isFalse()
        assertThat(RelationOpenings.isOpen(RelationLevel.CLOSE, RelationFeature.TALKIE)).isTrue()
        assertThat(RelationOpenings.isOpen(RelationLevel.BLOOD, RelationFeature.TALKIE)).isTrue()
        assertThat(RelationOpenings.isOpen(RelationLevel.PUBLIC, RelationFeature.DM_REQUEST)).isTrue()
    }
}
