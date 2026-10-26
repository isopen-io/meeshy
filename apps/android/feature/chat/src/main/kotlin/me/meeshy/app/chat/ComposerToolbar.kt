package me.meeshy.app.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageEffectsEditor
import me.meeshy.sdk.model.composer.ComposerIconTint
import me.meeshy.sdk.model.composer.ComposerProtection
import me.meeshy.sdk.model.composer.ComposerToolbarDoors
import me.meeshy.sdk.model.composer.ComposerToolbarLaw
import me.meeshy.sdk.model.composer.ComposerTrailingDoor
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyMessageStateColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La couleur d'état d'une protection (iOS `ComposerProtection.tint`) ; l'éphémère prend son encre en clair. */
@Composable
internal fun composerProtectionColor(protection: ComposerProtection, forIcon: Boolean = false): Color = when (protection) {
    ComposerProtection.EPHEMERAL -> if (forIcon && !MeeshyTheme.isDark) MeeshyTheme.tokens.errorInk else MeeshyTheme.tokens.error
    ComposerProtection.VIEW_ONCE -> MeeshyMessageStateColors.ViewOnce
    ComposerProtection.BLURRED -> MeeshyMessageStateColors.Concealed
}

/** UNE loi de teinte pour toutes les icônes du verre (iOS `ComposerIconTint`). */
@Composable
internal fun composerIconTint(flags: Long): Color = when (val tint = ComposerToolbarLaw.iconTint(flags)) {
    is ComposerIconTint.Protection -> composerProtectionColor(tint.protection, forIcon = true)
    ComposerIconTint.Brand -> MeeshyPalette.Indigo500
    ComposerIconTint.Common -> MeeshyTheme.tokens.textSecondary
}

/**
 * Le verre « dans le verre » des contrôles de la rangée ((+), champ, bande d'emojis) : un lavis
 * clair et le liseré liquide, sans second flou (iOS `adaptiveLiquidGlass` sur la plaque).
 */
@Composable
internal fun Modifier.composerInnerGlass(shape: Shape, tint: Color? = null): Modifier {
    val dark = MeeshyTheme.isDark
    val wash = Color.White.copy(alpha = if (dark) 0.08f else 0.5f)
    return this
        .clip(shape)
        .background(wash, shape)
        .then(if (tint != null) Modifier.background(tint.copy(alpha = if (dark) 0.35f else 0.25f), shape) else Modifier)
        .border(1.dp, MeeshyGradients.liquidGlassRim(dark, tint != null), shape)
}

/**
 * La barre d'outils du haut de la plaque (iOS `ComposerToolbarStrip`) : à gauche les bascules
 * qui défilent (éphémère, flou, vue unique, effets), puis la pastille de langue épinglée, puis
 * à droite les portes photothèque et caméra puis le chevron de repli ⌄, qui ne défilent jamais.
 */
@Composable
internal fun ComposerToolbar(
    effects: MessageEffects,
    languageCode: String,
    showEphemeralRail: Boolean,
    onEphemeral: () -> Unit,
    onVeil: (ComposerProtection) -> Unit,
    onEffects: () -> Unit,
    onPickLanguage: (String) -> Unit,
    onLibrary: (() -> Unit)?,
    onCamera: (() -> Unit)?,
    accentColor: Color,
    onFold: (() -> Unit)? = null,
) {
    val iconTint = composerIconTint(effects.flags)
    val flags = effects.flags
    val scroll = rememberScrollState()
    val fadeWidth = 44.dp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = MeeshySpacing.sm, end = MeeshySpacing.sm, top = MeeshySpacing.xsPlus, bottom = MeeshySpacing.xxs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Row(
            modifier = Modifier
                .weight(1f, fill = false)
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    if (scroll.canScrollForward) {
                        val fade = fadeWidth.toPx().coerceAtMost(size.width)
                        drawRect(
                            brush = Brush.horizontalGradient(
                                listOf(Color.Black, Color.Transparent),
                                startX = size.width - fade,
                                endX = size.width,
                            ),
                            blendMode = BlendMode.DstIn,
                        )
                    }
                }
                .horizontalScroll(scroll),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            val ephemeralOn = MessageEffectFlags.has(flags, MessageEffectFlags.EPHEMERAL)
            val ephemeralTint = composerProtectionColor(ComposerProtection.EPHEMERAL, forIcon = true)
            ComposerToolToggle(
                icon = if (ephemeralOn || showEphemeralRail) MeeshyIcons.FlameFilled else MeeshyIcons.Flame,
                active = ephemeralOn,
                label = EphemeralDuration.fromSeconds(effects.ephemeralDuration)
                    ?.takeIf { ephemeralOn }
                    ?.let { stringResource(ephemeralDurationLabel(it)) },
                tint = iconTint,
                activeTint = ephemeralTint,
                description = stringResource(R.string.chat_effect_ephemeral),
                onClick = onEphemeral,
            )
            val blurOn = MessageEffectFlags.has(flags, MessageEffectFlags.BLURRED)
            ComposerToolToggle(
                icon = if (blurOn) MeeshyIcons.EyeOffFilled else MeeshyIcons.EyeOff,
                active = blurOn,
                label = if (blurOn) stringResource(R.string.chat_effect_blurred) else null,
                tint = iconTint,
                activeTint = composerProtectionColor(ComposerProtection.BLURRED),
                description = stringResource(R.string.chat_effect_blurred),
                onClick = { onVeil(ComposerProtection.BLURRED) },
            )
            val onceOn = MessageEffectFlags.has(flags, MessageEffectFlags.VIEW_ONCE)
            ComposerToolToggle(
                glyph = { color -> ViewOnceGlyph(filled = onceOn, color = color) },
                active = onceOn,
                label = if (onceOn) stringResource(R.string.chat_effect_view_once) else null,
                tint = iconTint,
                activeTint = composerProtectionColor(ComposerProtection.VIEW_ONCE),
                description = stringResource(R.string.chat_effect_view_once),
                onClick = { onVeil(ComposerProtection.VIEW_ONCE) },
            )
            val count = MessageEffectsEditor.activeCount(effects.copy(flags = flags and MessageEffectFlags.LIFECYCLE_MASK.inv()))
            ComposerToolToggle(
                icon = MeeshyIcons.MagicWand,
                active = count > 0,
                label = if (count > 0) count.toString() else null,
                tint = iconTint,
                activeTint = iconTint,
                description = stringResource(R.string.chat_effects_open),
                onClick = onEffects,
            )
        }
        ComposerLanguagePill(
            languageCode = languageCode,
            tint = iconTint,
            accentColor = accentColor,
            onPick = onPickLanguage,
        )
        val doors = ComposerToolbarDoors.trailing(
            offersLibrary = onLibrary != null,
            offersCamera = onCamera != null,
            offersFold = onFold != null,
        )
        doors.forEach { door ->
            when (door) {
                ComposerTrailingDoor.LIBRARY -> onLibrary?.let {
                    ComposerGlassDoor(MeeshyIcons.PhotoLibrary, stringResource(R.string.composer_attach_photo), iconTint, it)
                }
                ComposerTrailingDoor.CAMERA -> onCamera?.let {
                    ComposerGlassDoor(MeeshyIcons.Camera, stringResource(R.string.composer_attach_camera), iconTint, it)
                }
                ComposerTrailingDoor.FOLD -> Unit
            }
        }
        // Le ⌄ ferme la rangée, tout à l'angle droit (iOS `foldButton`, #8642) : il apparaît et
        // s'efface (clavier levé, prise vocale) en fondu + échelle 0,8 ancrée en haut à droite.
        AnimatedVisibility(
            visible = ComposerTrailingDoor.FOLD in doors,
            enter = fadeIn() + scaleIn(initialScale = 0.8f, transformOrigin = TransformOrigin(1f, 0f)),
            exit = fadeOut() + scaleOut(targetScale = 0.8f, transformOrigin = TransformOrigin(1f, 0f)),
        ) {
            val fold = remember { mutableStateOf(onFold) }
            if (onFold != null) fold.value = onFold
            ComposerFoldDoor(tint = iconTint, onClick = { fold.value?.invoke() })
        }
    }
}

/**
 * Le chevron de repli : glyphe gras dans un cercle de verre de 30, cible de 44 dont le débord
 * vertical (-7) ne grossit pas la rangée (iOS `foldButton`).
 */
@Composable
private fun ComposerFoldDoor(tint: Color, onClick: () -> Unit) {
    val label = stringResource(R.string.composer_fold)
    Box(
        modifier = Modifier
            .layout { measurable, constraints ->
                val placeable = measurable.measure(constraints.copy(minHeight = 0, maxHeight = Constraints.Infinity))
                val trim = 7.dp.roundToPx()
                val height = (placeable.height - 2 * trim).coerceAtLeast(0)
                layout(placeable.width, height) { placeable.place(0, -trim) }
            }
            .size(44.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(30.dp)
                .composerInnerGlass(CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = MeeshyIcons.ChevronDown, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        }
    }
}

/** Le « 1 » cerclé de la vue unique (SF `1.circle` / `1.circle.fill`). */
@Composable
private fun ViewOnceGlyph(filled: Boolean, color: Color) {
    Box(
        modifier = Modifier
            .size(14.dp)
            .then(if (filled) Modifier.background(color, CircleShape) else Modifier.border(1.4.dp, color, CircleShape)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "1",
            color = if (filled) Color.White else color,
            fontSize = 9.sp,
            lineHeight = 9.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

/**
 * Une bascule de la barre d'outils : capsule h8 v4, glyphe 12 semibold ; armée, elle prend un
 * fond de sa teinte à 15 %, un contour à 30 % et son libellé 11 bold.
 */
@Composable
private fun ComposerToolToggle(
    active: Boolean,
    label: String?,
    tint: Color,
    activeTint: Color,
    description: String,
    onClick: () -> Unit,
    icon: ImageVector? = null,
    glyph: (@Composable (Color) -> Unit)? = null,
) {
    val color = if (active) activeTint else tint
    val shape = CircleShape
    Row(
        modifier = Modifier
            .height(30.dp)
            .clip(shape)
            .then(
                if (active) {
                    Modifier
                        .background(activeTint.copy(alpha = 0.15f), shape)
                        .border(0.5.dp, activeTint.copy(alpha = 0.3f), shape)
                } else {
                    Modifier
                },
            )
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        when {
            glyph != null -> glyph(color)
            icon != null -> Icon(imageVector = icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        }
        if (label != null) {
            Text(text = label, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}

/** Une porte de la bande (photothèque, caméra) : glyphe 18 dans un cadre de 30, cible de 44. */
@Composable
private fun ComposerGlassDoor(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .width(36.dp)
            .height(30.dp)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(19.dp))
    }
}

/**
 * Le rail des durées éphémères, DANS la plaque (iOS `ephemeralPicker` sur `railSurface`) : un
 * toucher arme l'éphémère avec cette durée.
 */
@Composable
internal fun ComposerEphemeralRail(
    selected: EphemeralDuration?,
    onPick: (EphemeralDuration) -> Unit,
) {
    val dark = MeeshyTheme.isDark
    val tint = composerProtectionColor(ComposerProtection.EPHEMERAL, forIcon = true)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = MeeshySpacing.sm, end = MeeshySpacing.sm, top = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(if (dark) Color.Black.copy(alpha = 0.3f) else Color.White.copy(alpha = 0.9f))
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.FlameFilled, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        EphemeralDuration.entries.forEach { duration ->
            val on = duration == selected
            Text(
                text = stringResource(ephemeralDurationLabel(duration)),
                color = if (on) Color.White else tint,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (on) tint else tint.copy(alpha = 0.12f))
                    .clickable(role = Role.Button) { onPick(duration) }
                    .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xsPlus),
            )
        }
    }
}
