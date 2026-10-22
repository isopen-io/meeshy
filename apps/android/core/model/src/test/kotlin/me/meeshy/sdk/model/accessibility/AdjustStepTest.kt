package me.meeshy.sdk.model.accessibility

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AdjustStepTest {
    @Test fun `le pas signe suit la direction`() {
        assertThat(AdjustStep.signed(AdjustStep.SECONDS, AdjustDirection.INCREMENT)).isEqualTo(0.1)
        assertThat(AdjustStep.signed(AdjustStep.SECONDS, AdjustDirection.DECREMENT)).isEqualTo(-0.1)
    }

    @Test fun `la fraction avance d un centieme arrondi`() {
        assertThat(AdjustStep.nudgedFraction(0.29, AdjustDirection.INCREMENT)).isEqualTo(0.3)
        assertThat(AdjustStep.nudgedFraction(0.5, AdjustDirection.DECREMENT)).isEqualTo(0.49)
    }

    @Test fun `la fraction reste bornee et rend null quand rien ne change`() {
        assertThat(AdjustStep.nudgedFraction(1.0, AdjustDirection.INCREMENT)).isNull()
        assertThat(AdjustStep.nudgedFraction(0.0, AdjustDirection.DECREMENT)).isNull()
    }
}
