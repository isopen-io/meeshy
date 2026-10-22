package me.meeshy.ui.component.settings

import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SettingsRowMetricsTest {
    @Test fun `les constantes de la trame suivent iOS`() {
        assertThat(SettingsRowMetrics.iconSize).isEqualTo(34.dp)
        assertThat(SettingsRowMetrics.iconTextSpacing).isEqualTo(14.dp)
        assertThat(SettingsRowMetrics.horizontalPadding).isEqualTo(16.dp)
        assertThat(SettingsRowMetrics.verticalPadding).isEqualTo(15.dp)
        assertThat(SettingsRowMetrics.minimumHeight).isEqualTo(48.dp)
    }

    @Test fun `le separateur demarre a l alignement du texte`() {
        assertThat(SettingsRowMetrics.separatorInset).isEqualTo(64.dp)
    }

    @Test fun `le libelle combine titre et valeur`() {
        assertThat(SettingsRowMetrics.accessibilityLabel("Langue", "Français")).isEqualTo("Langue, Français")
    }

    @Test fun `une valeur vide ou blanche est omise`() {
        assertThat(SettingsRowMetrics.accessibilityLabel("Langue", null)).isEqualTo("Langue")
        assertThat(SettingsRowMetrics.accessibilityLabel("Langue", "")).isEqualTo("Langue")
        assertThat(SettingsRowMetrics.accessibilityLabel("Langue", "  ")).isEqualTo("Langue")
    }
}
