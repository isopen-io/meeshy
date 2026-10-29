package me.meeshy.app.game.reveal

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameRarityEntry
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.engagement.EngagementRevealPlan
import me.meeshy.sdk.model.game.engagement.RarityBorder
import me.meeshy.sdk.model.game.engagement.RevealMedalSpec
import me.meeshy.sdk.model.game.engagement.RevealOccasion
import me.meeshy.sdk.model.game.engagement.RevealPhotoMoment
import me.meeshy.sdk.model.game.engagement.RevealPhotoOffer
import me.meeshy.sdk.model.game.engagement.RevealRim
import me.meeshy.sdk.model.game.engagement.RevealSymbol
import me.meeshy.sdk.model.game.engagement.RevealTint
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.GameMedalFamily
import me.meeshy.ui.component.game.GameMedalGlyph
import me.meeshy.ui.component.game.GameMedalState
import me.meeshy.ui.component.game.GameMedalView
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

private val CARD_WIDTH = 300.dp
private val DISC = 104.dp
private const val RAY_COUNT = 12
private const val CARD_TILT_DEGREES = -1.5f

/**
 * **Le palier obtenu se REGARDE avant de se ranger dans une grille** (miroir d'`AchievementRevealView`, iOS #5809,
 * #10816) : une CARTE de 300 dp, inclinée d'un degré et demi, posée sur un voile qui laisse voir l'écran couvert —
 * médaille (ou disque et glyphe), mot du palier, explication. Toucher le voile referme.
 *
 * [onSeeProgression] est la sortie qui MÈNE au tableau de bord (célébration seulement) ; [onContinue] ne fait QUE
 * fermer. Sous « Réduire les animations » le palier est POSÉ à son état final — ni échelle, ni halo qui pulse, ni
 * rayons : une animation « plus lente » reste une animation. Les animations vivent dans la fenêtre et partent avec elle.
 */
@Composable
fun AchievementRevealScreen(
    reveal: EngagementReveal,
    onContinue: () -> Unit,
    modifier: Modifier = Modifier,
    occasion: RevealOccasion = RevealOccasion.Celebration,
    onSeeProgression: (() -> Unit)? = null,
    rarity: GameRarityEntry? = null,
    onPhoto: ((RevealPhotoMoment) -> Unit)? = null,
) {
    val plan = remember(reveal, occasion) { EngagementRevealPlan.of(reveal, occasion) }
    // La rareté ne se montre que sur ce qui est OBTENU, et seulement si elle a le droit de se montrer (fail-closed).
    val shownRarity = remember(rarity, occasion) { rarity?.takeIf { occasion.isObtained } }
    val rarityLine = remember(shownRarity) { RevealRim.line(shownRarity) }
    val rim = remember(shownRarity) { RevealRim.border(shownRarity) }
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val photoMoment = remember(reveal, occasion, onPhoto != null, shownRarity, plan, res, locale) {
        RevealPhotoOffer.of(reveal, occasion, offersPhotos = onPhoto != null, title = RevealCopy.title(res, locale, plan.title), entry = shownRarity)
    }
    val reduceMotion = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val appeared = remember { Animatable(if (reduceMotion) 1f else 0f) }
    val halo = remember { Animatable(if (reduceMotion) 1f else 0f) }
    LaunchedEffect(plan, reduceMotion) {
        if (plan.celebratesWithSuccessHaptic) haptics.success() else haptics.light()
        if (reduceMotion) {
            appeared.snapTo(1f)
            halo.snapTo(1f)
        } else {
            appeared.animateTo(1f, spring(dampingRatio = REVEAL_DAMPING, stiffness = Spring.StiffnessMediumLow))
        }
    }
    LaunchedEffect(plan, reduceMotion) {
        if (!reduceMotion) halo.animateTo(1f, tween(HALO_MILLIS, delayMillis = HALO_DELAY_MILLIS))
    }

    Dialog(
        onDismissRequest = onContinue,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        val scrim = if (MeeshyTheme.isDark) SCRIM_DARK else SCRIM_LIGHT
        Box(
            modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = scrim))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onContinue),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.xxl)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = {}),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                RevealCard(plan, appeared.asValue(), halo.asValue(), reduceMotion, rim, rarityLine)
                RevealExit(
                    plan, appeared.asValue(), onContinue, onSeeProgression.takeIf { plan.leadsToProgression },
                    onPhoto = photoMoment?.let { moment -> { onPhoto?.invoke(moment) } },
                )
            }
        }
    }
}

private fun Animatable<Float, *>.asValue(): () -> Float = { value }

@Composable
private fun RevealCard(
    plan: EngagementRevealPlan,
    appeared: () -> Float,
    halo: () -> Float,
    reduceMotion: Boolean,
    rim: RarityBorder?,
    rarityLine: RevealRim.Line?,
) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tint = plan.tint.color()
    val spoken = remember(plan, rarityLine, res, locale) { RevealCopy.spoken(res, locale, plan, rarityLine) }
    Column(
        Modifier
            .width(CARD_WIDTH)
            .graphicsLayer {
                rotationZ = CARD_TILT_DEGREES
                val scale = 0.85f + 0.15f * appeared()
                scaleX = scale
                scaleY = scale
                alpha = appeared().coerceIn(0f, 1f)
            }
            .clip(RoundedCornerShape(MeeshyRadius.xl))
            .background(Brush.verticalGradient(listOf(MeeshyPalette.Indigo900, MeeshyPalette.Indigo950)))
            .drawWithCache {
                // Le dégradé ne dépend que de la taille : construit une fois, seule l'opacité suit l'animation.
                val glow = Brush.radialGradient(listOf(tint.copy(alpha = 0.32f), Color.Transparent), center = Offset(size.width / 2, 0f), radius = GLOW_RADIUS.dp.toPx())
                onDrawBehind { drawRect(glow, alpha = appeared() * (0.7f + 0.3f * halo())) }
            }
            .padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg, top = MeeshySpacing.xl, bottom = MeeshySpacing.lg)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        RevealEmblem(plan, tint, appeared, halo, showRays = !reduceMotion && plan.raysWhenMotionAllowed, rim = rim)
        RevealTexts(plan, res, locale, rarityLine)
    }
}

@Composable
private fun RevealEmblem(plan: EngagementRevealPlan, tint: Color, appeared: () -> Float, halo: () -> Float, showRays: Boolean, rim: RarityBorder?) {
    Box(
        Modifier.size(if (rim == null) RAYS_BOX else RAYS_BOX_RIMMED).graphicsLayer {
            val scale = 0.4f + 0.6f * appeared()
            scaleX = scale
            scaleY = scale
            alpha = appeared().coerceIn(0f, 1f)
        }.clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        if (showRays) Rays(tint, appeared, halo, if (rim == null) RAY_RADIUS else RAY_RADIUS_RIMMED)
        val medal = plan.medal
        if (rim == null) {
            if (medal != null) Medal(medal) else Disc(plan.symbol, tint)
        } else {
            // Le disque dans la plaque que le liseré de rareté cerne : la plaque précède les rayons, qui tournent plus loin.
            val plate = RoundedCornerShape(PLATE_RADIUS)
            Box(
                Modifier.clip(plate).background(tint.copy(alpha = PLATE_ALPHA)).rarityRim(rim, plate).padding(MeeshySpacing.xl),
                contentAlignment = Alignment.Center,
            ) {
                if (medal != null) Medal(medal) else Disc(plan.symbol, tint)
            }
        }
    }
}

/** Douze rayons autour de l'emblème : un seul calque de dessin, lu dans la phase de dessin (aucune recomposition). */
@Composable
private fun Rays(tint: Color, appeared: () -> Float, halo: () -> Float, radius: Int) {
    Canvas(Modifier.fillMaxSize()) {
        val scale = 0.6f + 0.55f * halo()
        val ray = Size(3.dp.toPx(), 18.dp.toPx())
        repeat(RAY_COUNT) { index ->
            rotate(index * (360f / RAY_COUNT), pivot = center) {
                val top = center.y - radius.dp.toPx() * scale
                drawRoundRect(tint, topLeft = Offset(center.x - ray.width / 2, top), size = ray, cornerRadius = CornerRadius(ray.width / 2), alpha = 0.35f * appeared())
            }
        }
    }
}

@Composable
private fun Medal(medal: RevealMedalSpec) {
    GameMedalView(
        family = GameMedalFamily.of(medal.axis.family),
        glyph = GameMedalGlyph.of(medal.axis),
        material = medal.material.toGameMaterial(),
        state = GameMedalState.Lit,
        progress = 0.0,
        label = medal.threshold.toString(),
        modifier = Modifier.width(DISC),
    )
}

@Composable
private fun Disc(symbol: RevealSymbol, tint: Color) {
    Box(
        Modifier.size(DISC).clip(CircleShape).background(Brush.linearGradient(listOf(tint, tint.copy(alpha = 0.55f)))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(symbol.icon(), contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(46.dp))
    }
}

@Composable
private fun RevealTexts(plan: EngagementRevealPlan, res: android.content.res.Resources, locale: java.util.Locale, rarityLine: RevealRim.Line?) {
    val obtained = plan.tint != RevealTint.Locked
    Column(Modifier.fillMaxWidth().clearAndSetSemantics { }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            RevealCopy.banner(res, locale, plan.banner).uppercase(locale),
            style = meeshyText(MeeshyFontSize.small, FontWeight.Bold),
            color = if (obtained) MeeshyPalette.Indigo200 else MeeshyPalette.Neutral500,
            textAlign = TextAlign.Center,
        )
        Text(
            RevealCopy.title(res, locale, plan.title),
            style = meeshyText(MeeshyFontSize.title, FontWeight.Bold),
            color = MeeshyPalette.White,
            textAlign = TextAlign.Center,
        )
        Text(
            RevealCopy.subtitle(res, plan.subtitle),
            style = meeshyText(MeeshyFontSize.body),
            color = MeeshyPalette.Indigo200,
            textAlign = TextAlign.Center,
        )
        // « Épique · 4 % des comptes » : le nom de la rareté, lu en toutes lettres sous le liseré.
        if (rarityLine != null) {
            Text(
                RevealCopy.rarityLine(res, locale, rarityLine),
                style = meeshyText(MeeshyFontSize.footnote, if (rarityLine is RevealRim.Line.Measured) FontWeight.SemiBold else FontWeight.Medium),
                color = MeeshyPalette.Indigo200,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** L'action OFFERTE en premier, pleine ; la fermeture pleine quand elle est SEULE, en retrait sinon. */
@Composable
private fun RevealExit(
    plan: EngagementRevealPlan,
    appeared: () -> Float,
    onContinue: () -> Unit,
    onSeeProgression: (() -> Unit)?,
    onPhoto: (() -> Unit)?,
) {
    val tint = plan.tint.color()
    Column(
        Modifier.widthIn(max = CARD_WIDTH).graphicsLayer { alpha = appeared().coerceIn(0f, 1f) },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (onSeeProgression != null) {
            ExitButton(stringResource(R.string.reveal_continue), filled = true, tint = tint, onClick = onSeeProgression)
        }
        if (onPhoto != null) PhotoButton(onPhoto)
        val label = stringResource(if (plan.leadsToProgression) R.string.reveal_ok else R.string.reveal_close)
        ExitButton(label, filled = onSeeProgression == null, tint = tint, onClick = onContinue)
    }
}

/** « En faire une carte » : la carte 9:16 du succès, offerte sous l'action proposée, en retrait. */
@Composable
private fun PhotoButton(onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button) { haptics.light(); onClick() },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.Camera, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(stringResource(R.string.reveal_achievement_photo), style = meeshyText(MeeshyFontSize.callout, FontWeight.SemiBold), color = MeeshyPalette.White)
    }
}

@Composable
private fun ExitButton(label: String, filled: Boolean, tint: Color, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(CircleShape)
            .background(if (filled) tint else Color.Transparent)
            .border(1.dp, if (filled) Color.Transparent else MeeshyPalette.White.copy(alpha = 0.6f), CircleShape)
            .clickable(role = Role.Button) { haptics.light(); onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = meeshyText(MeeshyFontSize.callout, FontWeight.SemiBold), color = MeeshyPalette.White)
    }
}

private fun RevealTint.color(): Color = when (this) {
    RevealTint.Locked -> MeeshyPalette.Neutral500
    RevealTint.Achievement -> MeeshyPalette.Purple500
    RevealTint.Badge -> MeeshyPalette.Indigo500
    RevealTint.Streak -> MeeshyPalette.Warning
    RevealTint.Level -> MeeshyPalette.Indigo500
}

private fun RevealSymbol.icon() = when (this) {
    RevealSymbol.Lock -> MeeshyIcons.Lock
    RevealSymbol.Rosette -> MeeshyIcons.VerifiedFilled
    RevealSymbol.Medal -> MeeshyIcons.Premium
    RevealSymbol.Flame -> MeeshyIcons.FlameFilled
    RevealSymbol.StarCircle -> MeeshyIcons.StarFilled
}

private fun BadgeMaterialKey.toGameMaterial(): GameMaterial = when (this) {
    BadgeMaterialKey.CUIVRE -> GameMaterial.COPPER
    BadgeMaterialKey.BRONZE -> GameMaterial.BRONZE
    BadgeMaterialKey.ARGENT -> GameMaterial.SILVER
    BadgeMaterialKey.OR -> GameMaterial.GOLD
    BadgeMaterialKey.PLATINE -> GameMaterial.PLATINUM
    BadgeMaterialKey.OBSIDIENNE -> GameMaterial.OBSIDIAN
    BadgeMaterialKey.PRISME -> GameMaterial.PRISM
}

private val RAYS_BOX = 180.dp
private val RAYS_BOX_RIMMED = 216.dp
private val PLATE_RADIUS = 36.dp
private const val PLATE_ALPHA = 0.14f
private const val RAY_RADIUS = 64
private const val RAY_RADIUS_RIMMED = 86
private const val GLOW_RADIUS = 260
private const val SCRIM_DARK = 0.62f
private const val SCRIM_LIGHT = 0.45f
private const val REVEAL_DAMPING = 0.62f
private const val HALO_MILLIS = 900
private const val HALO_DELAY_MILLIS = 100
