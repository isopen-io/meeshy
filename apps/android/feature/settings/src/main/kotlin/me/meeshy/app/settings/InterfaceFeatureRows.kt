package me.meeshy.app.settings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.reading.mode.LentilleFeatureFlag
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val DISABLED_ROW_ALPHA = 0.45f
private const val ROW_FADE_MILLIS = 180

/**
 * Les trois interrupteurs d'interface, à la suite de la section Apparence (iOS `interfaceFeatureRows`).
 * La Rivière est un mode de lecture : modes coupés, sa rangée se grise en fondu et un indice
 * déroulé en dessous dit pourquoi ; son choix mémorisé n'est pas effacé.
 */
@Composable
internal fun InterfaceFeatureRows(
    separatorTint: androidx.compose.ui.graphics.Color,
    viewModel: InterfaceFeaturesViewModel = hiltViewModel(),
) {
    val flags by viewModel.flags.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val riviereAlpha by animateFloatAsState(
        targetValue = if (flags.isRiviereAdjustable) 1f else DISABLED_ROW_ALPHA,
        animationSpec = tween(ROW_FADE_MILLIS),
        label = "riviereRowAlpha",
    )

    SettingsSeparator(separatorTint)
    NotificationToggleRow(
        label = stringResource(R.string.settings_interface_lentille_list),
        checked = flags.lentilleList,
        onCheckedChange = { viewModel.setEnabled(LentilleFeatureFlag.LENTILLE_LIST, it) },
        icon = MeeshyIcons.ListChecklist,
        color = MeeshyPalette.TrackingAccent,
    )
    SettingsSeparator(separatorTint)
    NotificationToggleRow(
        label = stringResource(R.string.settings_interface_reading_modes),
        subtitle = stringResource(R.string.settings_interface_reading_modes_subtitle),
        checked = flags.readingModes,
        onCheckedChange = { viewModel.setEnabled(LentilleFeatureFlag.READING_MODES, it) },
        icon = MeeshyIcons.Dictionary,
        color = MeeshyPalette.Indigo400,
    )
    SettingsSeparator(separatorTint)
    Column(modifier = Modifier.alpha(riviereAlpha).semantics { if (!flags.isRiviereAdjustable) disabled() }) {
        NotificationToggleRow(
            label = stringResource(R.string.settings_interface_riviere_mode),
            checked = flags.riviereMode,
            enabled = flags.isRiviereAdjustable,
            onCheckedChange = {
                haptics.light()
                viewModel.setEnabled(LentilleFeatureFlag.RIVIERE_MODE, it)
            },
            icon = MeeshyIcons.ChartLine,
            color = MeeshyPalette.Info,
        )
        AnimatedVisibility(
            visible = !flags.isRiviereAdjustable,
            enter = fadeIn(tween(ROW_FADE_MILLIS)) + expandVertically(tween(ROW_FADE_MILLIS)),
            exit = fadeOut(tween(ROW_FADE_MILLIS)) + shrinkVertically(tween(ROW_FADE_MILLIS)),
        ) {
            Text(
                text = stringResource(R.string.settings_interface_riviere_mode_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(
                    start = MeeshySpacing.lg,
                    end = MeeshySpacing.lg,
                    bottom = MeeshySpacing.sm,
                ),
            )
        }
    }
}
