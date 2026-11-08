package me.meeshy.app.game.photo

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.photo.AuthorPlate
import me.meeshy.sdk.model.game.photo.GamePhotoAuthorPlateMotion
import me.meeshy.sdk.model.game.photo.PlateFamily
import java.util.Optional
import java.util.concurrent.ConcurrentHashMap
import me.meeshy.sdk.model.game.photo.PlateFinish
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.lottie.LottieFilm
import me.meeshy.ui.component.lottie.LottieLayerSource
import me.meeshy.ui.component.lottie.LottieLayerView
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

internal const val AUTHOR_CARD_TAG = "game.photo.author.card"

/** La formule de la famille, au-dessus du pseudo : « Haut fait de ». */
@Composable
internal fun authorPlateCaption(family: PlateFamily): String = stringResource(
    when (family) {
        PlateFamily.Achievement -> R.string.game_photo_author_caption_achievement
        PlateFamily.Rank -> R.string.game_photo_author_caption_rank
        PlateFamily.Mission -> R.string.game_photo_author_caption_mission
    },
)

/** La phrase que lit TalkBack : « Haut fait de @atabeth ». */
@Composable
internal fun authorPlateLabel(plate: AuthorPlate): String = stringResource(
    when (plate.family) {
        PlateFamily.Achievement -> R.string.game_photo_author_label_achievement
        PlateFamily.Rank -> R.string.game_photo_author_label_rank
        PlateFamily.Mission -> R.string.game_photo_author_label_mission
    },
    plate.name,
)

/**
 * LA PLAQUE VIVANTE (#10816, iOS `GameAuthorPlateLive`) — la plaque fixe, et par-dessus l'animation Lottie de son
 * fini ([GamePhotoAuthorPlateMotion]), jouée UNE fois. Sous « Réduire les animations », ou si le film ne se lit pas,
 * rien ne monte : la plaque fixe est l'état final, jamais un nom caché.
 */
@Composable
internal fun GameAuthorPlateLive(
    plate: AuthorPlate,
    width: Dp,
    modifier: Modifier = Modifier,
    showsAvatar: Boolean = true,
) {
    val reduceMotion = LocalReduceMotion.current
    Box(modifier) {
        GameAuthorPlateView(plate, authorPlateCaption(plate.family), width, showsAvatar = showsAvatar)
        if (!reduceMotion) PlateFilm(plate, width)
    }
}

@Composable
private fun PlateFilm(plate: AuthorPlate, width: Dp) {
    val film = remember(plate.finish) { GameAuthorPlateFilms.film(plate.finish) } ?: return
    val height = width * GamePhotoAuthorPlateMotion.HEIGHT / GamePhotoAuthorPlateMotion.WIDTH
    LottieLayerView(film, Modifier.size(width, height), contentScale = ContentScale.Fit, loops = false)
}

/** Les films des trois finis, générés et décodés UNE fois chacun ; `null` si le film ne se lit pas. */
internal object GameAuthorPlateFilms {
    private val films = ConcurrentHashMap<PlateFinish, Optional<LottieFilm>>()

    fun film(finish: PlateFinish): LottieFilm? = films.getOrPut(finish) {
        Optional.ofNullable(LottieLayerSource.decodeFilm(GamePhotoAuthorPlateMotion.json(finish).toByteArray(Charsets.UTF_8)))
    }.orElse(null)
}

/**
 * LA CARTE POSÉE (#10816, iOS `GameAuthorCardView`) — la proposition de photo d'un succès, d'un rang ou d'une fin de
 * mission est une CARTE bornée (300 dp), inclinée d'un degré et demi, une ombre de table : l'emblème au métal de
 * l'étape ([emblem]), le moment, la date, et la plaque gravée au pseudo de l'auteur, sa photo de profil dans le
 * médaillon. Elle se dit en UNE phrase ; les dessins dessous sont décoratifs.
 */
@Composable
internal fun GameAuthorCard(
    text: PhotoCanvasText,
    plate: AuthorPlate,
    modifier: Modifier = Modifier,
    emblem: @Composable () -> Unit,
) {
    val label = authorPlateLabel(plate)
    val spoken = "${text.kicker} : ${text.title} — $label"
    val shape = RoundedCornerShape(MeeshyRadius.xl)
    Column(
        modifier
            .widthIn(max = AUTHOR_CARD_WIDTH)
            .graphicsLayer { rotationZ = AUTHOR_CARD_TILT }
            .shadow(20.dp, shape, ambientColor = MeeshyPalette.Indigo950.copy(alpha = 0.55f), spotColor = MeeshyPalette.Indigo950.copy(alpha = 0.55f))
            .background(Brush.verticalGradient(listOf(MeeshyPalette.Indigo950, MeeshyPalette.Indigo500)), shape)
            .padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg, top = MeeshySpacing.lg, bottom = MeeshySpacing.md)
            .testTag(AUTHOR_CARD_TAG)
            .clearAndSetSemantics {
                contentDescription = spoken
                role = Role.Image
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Box(Modifier.size(96.dp)) { emblem() }
        Text(
            text.kicker.uppercase(),
            color = MeeshyPalette.Indigo200,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.2.sp,
        )
        Text(
            text.title,
            color = Color.White,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(text.date, color = MeeshyPalette.Indigo200, fontSize = 13.sp)
        GameAuthorPlateLive(plate, AUTHOR_CARD_WIDTH - MeeshySpacing.lg * 2, Modifier.padding(top = MeeshySpacing.xs))
    }
}

internal val AUTHOR_CARD_WIDTH: Dp = 300.dp
internal const val AUTHOR_CARD_TILT = -1.5f
