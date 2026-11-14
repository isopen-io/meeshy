package me.meeshy.feature.kit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.chrome.LocalReduceTransparency
import me.meeshy.ui.component.kit.MeeshyGlass
import me.meeshy.ui.component.kit.MeeshyGlassDensity
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val STATE_PLAIN = "plain"
private const val STATE_DEEP = "deep"
private const val STATE_DEEP_DENSE = "deep-dense"
private const val STATE_ON_LIGHT = "onlight"
private const val STATE_THEME = "theme"
private const val STATE_TINTED = "teinte"
private const val STATE_OPAQUE = "opaque"

/** Les états de K01, ceux d'iOS : un par ton, la densité qui porte du texte, la teinte et le fond plein. */
internal val entryK01: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K01",
    name = "MeeshyGlassTone",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_PLAIN, boardView = "R1", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DEEP, boardView = "R2", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DEEP_DENSE, boardView = "R7", backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_ON_LIGHT, boardView = "R13", backdrop = MeeshyKitCatalogBackdrop.Light, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_TINTED, backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_OPAQUE, backdrop = MeeshyKitCatalogBackdrop.Media),
    ),
)

/**
 * L'échantillon d'un état : une pilule de verre portant un glyphe et l'`id` de l'état, à l'encre blanche du chrome sur
 * média ; `theme` se pose sur le fond de l'app, à l'encre du thème. L'état `opaque` pose « réduire la transparence ».
 */
@Composable
internal fun ContentK01(state: MeeshyKitCatalogState, isPressed: Boolean) {
    CompositionLocalProvider(LocalReduceTransparency provides if (state.id == STATE_OPAQUE) true else null) {
        if (state.id == STATE_THEME) {
            Box(Modifier.background(MeeshyTheme.tokens.backgroundPrimary).padding(MeeshySpacing.sm)) {
                Pill(state, isPressed, MeeshyTheme.tokens.textPrimary, MeeshyGlassTone.Theme, MeeshyGlassDensity.Regular, tint = null)
            }
        } else {
            Pill(
                state = state,
                isPressed = isPressed,
                ink = MeeshyMediaChromeColors.OnMedia,
                tone = toneOf(state.id),
                density = if (state.id == STATE_DEEP_DENSE) MeeshyGlassDensity.Dense else MeeshyGlassDensity.Regular,
                tint = if (state.id == STATE_TINTED) MeeshyPalette.Indigo500 else null,
            )
        }
    }
}

private fun toneOf(id: String): MeeshyGlassTone = when (id) {
    STATE_PLAIN -> MeeshyGlassTone.Plain
    STATE_ON_LIGHT -> MeeshyGlassTone.OnLight
    else -> MeeshyGlassTone.Deep
}

@Composable
private fun Pill(
    state: MeeshyKitCatalogState,
    isPressed: Boolean,
    ink: Color,
    tone: MeeshyGlassTone,
    density: MeeshyGlassDensity,
    tint: Color?,
) {
    val source = remember { MutableInteractionSource() }
    MeeshyGlass(
        shape = RoundedCornerShape(MeeshyRadius.pill),
        tone = tone,
        density = density,
        tint = tint,
        interactionSource = if (state.isTouchable && !isPressed) source else null,
        pressed = if (state.isTouchable && isPressed) true else null,
    ) {
        Row(
            modifier = Modifier
                .then(if (state.isTouchable) Modifier.clickable(interactionSource = source, indication = null) {} else Modifier)
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(MeeshyIcons.Sparkles, contentDescription = null, tint = ink)
            Text(text = state.id, style = MaterialTheme.typography.bodySmall, color = ink)
        }
    }
}
