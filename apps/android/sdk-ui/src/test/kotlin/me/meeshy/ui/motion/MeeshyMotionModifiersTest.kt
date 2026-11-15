package me.meeshy.ui.motion

import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.SpringSpec
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyMotion
import org.junit.Test

class MeeshyMotionModifiersTest {

    @Test
    fun `sous reduction le ressort est remplace par un snap`() {
        assertThat(motionSpec(reduce = true, response = 0.2f, damping = 0.6f)).isInstanceOf(SnapSpec::class.java)
    }

    @Test
    fun `hors reduction le ressort est celui d'iOS`() {
        val spec = motionSpec(reduce = false, response = 0.2f, damping = 0.6f) as SpringSpec<*>
        assertThat(spec.dampingRatio).isEqualTo(0.6f)
        assertThat(spec.stiffness).isWithin(0.01f).of(MeeshyMotion.stiffnessForResponse(0.2f))
    }
}
