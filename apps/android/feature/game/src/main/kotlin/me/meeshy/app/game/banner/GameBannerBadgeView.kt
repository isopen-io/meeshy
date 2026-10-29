package me.meeshy.app.game.banner

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.gameString
import me.meeshy.sdk.model.game.GameBannerBadge
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.ui.component.game.LevelRing
import me.meeshy.ui.component.game.RankBlason
import me.meeshy.ui.profile.ProfileGameSlot
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.meeshyText

private const val SPARK_GLYPH = "✦"
private const val GLORY_GLYPH = "♛"
private const val VEIL_ALPHA = 0.24f
private val EMBLEM = 36.dp
private val GROUP_MIN_WIDTH = 96.dp
private const val SEPARATOR = ", "

/**
 * **L'emplacement du jeu sur la bannière d'un membre** (miroir de `ProfileSheetEnvironment`, iOS) : le niveau à l'angle bas
 * du DÉBUT, le rang à l'angle bas de la FIN, ce que le serveur sert selon SES réglages et rien d'autre. Fourni une fois à la
 * racine de l'application ; les bannières de TOUS les profils (le mien comme ceux des autres) le lisent.
 */
fun gameProfileSlot(): ProfileGameSlot = ProfileGameSlot(
    level = { userId, _ -> GameBannerLevel(userId) },
    rank = { userId, _ -> GameBannerRank(userId) },
)

@Composable
private fun rememberBadge(userId: String): GameBannerBadge? {
    val viewModel: GameBannerBadgeViewModel = hiltViewModel()
    LaunchedEffect(userId) { viewModel.ensureLoaded(userId) }
    val flow = remember(viewModel, userId) { viewModel.observe(userId) }
    val badge by flow.collectAsStateWithLifecycle(initialValue = null)
    return badge
}

@Composable
internal fun GameBannerLevel(userId: String) {
    val badge = rememberBadge(userId)
    GroupFade(badge) { LevelGroup(it) }
}

@Composable
internal fun GameBannerRank(userId: String) {
    val badge = rememberBadge(userId)
    GroupFade(badge) { RankGroup(it) }
}

/** Le badge apparaît en fondu (0,2 s, comme iOS) quand la lecture le sert, et part de même quand elle le retire. */
@Composable
private fun GroupFade(badge: GameBannerBadge?, content: @Composable (GameBannerBadge) -> Unit) {
    AnimatedVisibility(visible = badge != null, enter = fadeIn(tween(FADE_MILLIS)), exit = fadeOut(tween(FADE_MILLIS))) {
        // Le dernier badge servi reste peint pendant le fondu de sortie.
        val shown = remember { badge }
        (badge ?: shown)?.let { content(it) }
    }
}

/** En colonne : le nom du palier, le cercle, puis les étincelles dessous. */
@Composable
private fun LevelGroup(badge: GameBannerBadge) {
    val locale = LocalConfiguration.current.locales[0]
    val tierName = gameString(GameCopyLaws.tierName(badge.tier))
    val label = listOfNotNull(
        gameString(GameCopyLaws.levelRingAccessibility(badge.level, badge.tier)),
        badge.pocket?.let { gameString(GameCopyLaws.points(it)) },
    ).joinToString(SEPARATOR)
    val pocket = badge.pocket?.let { amount(SPARK_GLYPH, GameNumberFormat.formatCount(it, locale)) }
    BannerGroup(startFacing = true, label = label) {
        Text(tierName, style = banner(MeeshyFontSize.small, FontWeight.Medium), color = Color.White.copy(alpha = 0.92f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        LevelRing(
            level = badge.level,
            progress = badge.levelProgress.toFloat(),
            tier = badge.tier,
            prestige = badge.prestige,
            trackColor = Color.White.copy(alpha = 0.3f),
            inkColor = Color.Black,
            modifier = Modifier.height(if (badge.prestige > 0) EMBLEM * 66 / 56 else EMBLEM),
        )
        pocket?.let { Text(it, style = banner(MeeshyFontSize.body, FontWeight.Bold), color = Color.White, maxLines = 1) }
    }
}

/** En colonne : la Gloire au-dessus du blason du rang, son nom et sa division dessous. */
@Composable
private fun RankGroup(badge: GameBannerBadge) {
    val locale = LocalConfiguration.current.locales[0]
    val rankName = gameString(badge.rankLabel)
    val glory = badge.glory?.let { amount(GLORY_GLYPH, GameNumberFormat.formatCount(it, locale)) }
    val label = listOfNotNull(
        rankName,
        badge.glory?.let { gameString(GameCopyLaws.gloryAmount(GameTextArg.Count(it))) },
    ).joinToString(SEPARATOR)
    BannerGroup(startFacing = false, label = label) {
        glory?.let { Text(it, style = banner(MeeshyFontSize.body, FontWeight.Bold), color = Color.White, maxLines = 1) }
        RankBlason(
            rank = badge.rank,
            division5 = badge.division5,
            mythic = badge.mythic,
            level = badge.level,
            figures = null,
            modifier = Modifier.height(EMBLEM * 1.1f * 0.93f),
        )
        Text(rankName, style = banner(MeeshyFontSize.footnote, FontWeight.SemiBold), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * Le cadre d'un groupe : collé à son bord de la bannière, il n'a d'arrondi QU'au coin haut tourné vers le milieu (le
 * niveau est au DÉBUT : son coin haut de FIN ; le rang à la FIN : son coin haut de DÉBUT) ; ses coins bas sont carrés. Un
 * voile léger, sans matière floutée — la bannière se voit au travers. Le doigt le traverse : ce n'est pas un bouton.
 */
@Composable
private fun BannerGroup(startFacing: Boolean, label: String, content: @Composable () -> Unit) {
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val radius = MeeshyRadius.md
    val shape = if (startFacing != rtl) {
        RoundedCornerShape(topStart = 0.dp, topEnd = radius, bottomEnd = 0.dp, bottomStart = 0.dp)
    } else {
        RoundedCornerShape(topStart = radius, topEnd = 0.dp, bottomEnd = 0.dp, bottomStart = 0.dp)
    }
    Column(
        Modifier
            .defaultMinSize(minWidth = GROUP_MIN_WIDTH)
            .clip(shape)
            .background(Color.Black.copy(alpha = VEIL_ALPHA))
            .padding(horizontal = MeeshySpacing.xs, vertical = MeeshySpacing.xs)
            .clearAndSetSemantics { contentDescription = label },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        content()
    }
}

/** « ✦ 18 347 » : le glyphe de la monnaie, une espace insécable, le nombre groupé. */
private fun amount(glyph: String, formatted: String): String = "$glyph $formatted"

private fun banner(size: androidx.compose.ui.unit.TextUnit, weight: FontWeight): TextStyle =
    meeshyText(size, weight).copy(textAlign = TextAlign.Center, shadow = androidx.compose.ui.graphics.Shadow(Color.Black.copy(alpha = 0.7f), blurRadius = 3f))

private const val FADE_MILLIS = 200
