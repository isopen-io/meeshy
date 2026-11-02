package me.meeshy.app.game.photo

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import com.airbnb.lottie.LottieComposition
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.rememberLottieComposition
import java.util.Calendar
import kotlin.math.roundToInt
import me.meeshy.app.game.progression.CupEmblem
import me.meeshy.app.game.progression.FlameEmblem
import me.meeshy.sdk.model.game.GameMint
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.photo.GamePhotoLayout
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.PhotoFormat
import me.meeshy.sdk.model.game.photo.PhotoLayout
import me.meeshy.sdk.model.game.photo.PhotoRect
import me.meeshy.sdk.model.game.photo.PhotoTextLine
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.LevelRing
import me.meeshy.ui.component.game.MeeFilmCatalog
import me.meeshy.ui.component.game.MeeshCoin
import me.meeshy.ui.component.game.RankBlason
import me.meeshy.ui.component.game.SignatureMark
import me.meeshy.ui.component.game.SignatureStyle
import me.meeshy.ui.theme.MeeshyPalette

/** Ce qui se peint sous le cadre : rien (la caméra est dessous), une photo, ou la carte aux couleurs de la marque. */
sealed interface PhotoBackground {
    data object Clear : PhotoBackground
    /** Un selfie se retourne comme dans l'aperçu ; une photo de la galerie, non. */
    data class Photo(val image: Bitmap, val mirrored: Boolean) : PhotoBackground
    data object Card : PhotoBackground
}

/** Ce que le cadre écrit : les deux lignes du moment et sa date, déjà dites dans la langue de l'interface. */
data class PhotoCanvasText(val kicker: String, val title: String, val date: String)

/**
 * LE CADRE DU MOMENT (iOS `GamePhotoCanvasView`) — emblème en haut, titre et date, Mee et Meo en bas, la Signature au
 * pied. UNE seule vue sert l'aperçu en direct (sur la caméra), la frappe, et l'image finale ([GamePhotoCanvasCapture]) :
 * le cadre qu'on voit au moment de déclencher est celui qu'on obtient.
 *
 * Elle se dessine dans l'espace en PIXELS de l'image finale (1 080 de large, densité 1) ; l'aperçu la met à l'échelle
 * ([ScaledPhotoCanvas]). **Un cadre FIXE** : la taille du texte est celle de l'image, jamais celle des réglages de
 * l'appareil — deux appareils produisent la même photo. Le cadre se dessine toujours de gauche à droite.
 *
 * [onBirdsReady] : Mee et Meo sont chargés (leur film est lu de façon asynchrone) — la capture les attend.
 */
@Composable
fun GamePhotoCanvas(
    moment: GamePhotoMoment,
    text: PhotoCanvasText,
    format: PhotoFormat,
    background: PhotoBackground,
    modifier: Modifier = Modifier,
    strike: Float = 1f,
    onBirdsReady: (Boolean) -> Unit = {},
) {
    val layout = remember(format) { GamePhotoLayout.layout(format) }
    CompositionLocalProvider(LocalDensity provides PIXELS, LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(modifier.requiredSize(layout.width.dp, layout.height.dp).clipToBounds().clearAndSetSemantics {}) {
            BackgroundLayer(background, layout)
            Box(
                Modifier
                    .place(layout.emblem)
                    .graphicsLayer {
                        val scale = EMBLEM_REST + (1f - EMBLEM_REST) * strike
                        scaleX = scale
                        scaleY = scale
                        alpha = EMBLEM_FADE + (1f - EMBLEM_FADE) * strike
                    },
                contentAlignment = Alignment.Center,
            ) { PhotoEmblem(moment.emblem) }
            CanvasLine(layout, layout.kicker, text.kicker.uppercase(), FontWeight.SemiBold, MeeshyPalette.Indigo200)
            CanvasLine(layout, layout.title, text.title, FontWeight.Bold, Color.White)
            CanvasLine(layout, layout.date, text.date, FontWeight.Medium, MeeshyPalette.Indigo200)
            val mee = bird(MEE_FILM)
            val meo = bird(MEO_FILM)
            val birdsReady = mee != null && meo != null
            SideEffect { onBirdsReady(birdsReady) }
            mee?.let { Bird(it, layout.mee, mirrored = false) }
            meo?.let { Bird(it, layout.meo, mirrored = true) }
            SignatureMark(color = Color.White, modifier = Modifier.place(layout.signature), style = SignatureStyle.Flat)
        }
    }
}

/** Le cadre mis à l'échelle de la place offerte, son coin haut-gauche ancré : l'aperçu, la frappe, la case du cadre. */
@Composable
fun ScaledPhotoCanvas(
    moment: GamePhotoMoment,
    text: PhotoCanvasText,
    format: PhotoFormat,
    background: PhotoBackground,
    modifier: Modifier = Modifier,
    strike: Float = 1f,
) {
    BoxWithConstraints(modifier.clipToBounds()) {
        val scale = constraints.maxWidth.toFloat() / format.width
        GamePhotoCanvas(
            moment, text, format, background,
            modifier = Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    transformOrigin = TransformOrigin(0f, 0f)
                },
            strike = strike,
        )
    }
}

/** L'emblème d'un moment (iOS `GamePhotoEmblem`) : les dessins du jeu, sans tenants. */
@Composable
internal fun PhotoEmblem(emblem: PhotoStepEmblem, modifier: Modifier = Modifier.fillMaxSize()) {
    when (emblem) {
        PhotoStepEmblem.Start -> SignatureMark(color = Color.White, modifier = modifier, style = SignatureStyle.Struck)
        is PhotoStepEmblem.Rank -> RankBlason(emblem.rank, emblem.division, modifier, figures = null)
        is PhotoStepEmblem.Tier -> LevelRing(emblem.level, 1f, emblem.tier, modifier)
        PhotoStepEmblem.LevelHundred -> LevelRing(LEVEL_SUMMIT, 1f, LevelTierKey.Galaxie, modifier)
        is PhotoStepEmblem.Prestige -> CupEmblem(GameMaterial.PRISM, modifier)
        is PhotoStepEmblem.Meesh -> MeeshCoin(
            modifier,
            face = MeeshCoinFace.Reverse(emblem.number, Calendar.getInstance().get(Calendar.YEAR)),
            edition = GameMint.displayEdition(emblem.number),
        )
        is PhotoStepEmblem.Treasury -> MeeshCoin(modifier, face = MeeshCoinFace.Obverse, edition = MeeshEdition.Silver)
        is PhotoStepEmblem.Flame -> FlameEmblem(emblem.form, modifier)
    }
}

@Composable
private fun BackgroundLayer(background: PhotoBackground, layout: PhotoLayout) {
    when (background) {
        PhotoBackground.Clear -> Scrims(layout)
        is PhotoBackground.Photo -> {
            val image = remember(background.image) { background.image.asImageBitmap() }
            Image(
                image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = if (background.mirrored) -1f else 1f },
            )
            Scrims(layout)
        }
        PhotoBackground.Card -> Box(
            Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(MeeshyPalette.Indigo700, MeeshyPalette.Indigo950))),
        )
    }
}

/** Les voiles qui gardent le texte lisible sur une photo : jamais opaques. */
@Composable
private fun Scrims(layout: PhotoLayout) {
    Box(
        Modifier
            .size(layout.width.dp, (layout.height * TOP_SCRIM).dp)
            .background(Brush.verticalGradient(listOf(MeeshyPalette.Indigo950.copy(alpha = 0.55f), Color.Transparent))),
    )
    Box(
        Modifier
            .offset { IntOffset(0, (layout.height * BOTTOM_SCRIM_TOP).roundToInt()) }
            .size(layout.width.dp, (layout.height * (1f - BOTTOM_SCRIM_TOP)).dp)
            .background(Brush.verticalGradient(listOf(Color.Transparent, MeeshyPalette.Indigo950.copy(alpha = 0.7f)))),
    )
}

/** Une ligne centrée sur sa base, qui rétrécit (jusqu'à moitié) plutôt que de sortir du cadre. */
@Composable
private fun CanvasLine(layout: PhotoLayout, line: PhotoTextLine, value: String, weight: FontWeight, color: Color) {
    val width = layout.width * TEXT_WIDTH
    val height = line.size * LINE_HEIGHT
    val measurer = rememberTextMeasurer()
    val base = TextStyle(
        fontSize = line.size.sp,
        fontWeight = weight,
        color = color,
        textAlign = TextAlign.Center,
        shadow = Shadow(MeeshyPalette.Indigo950.copy(alpha = 0.6f), Offset.Zero, layout.width * SHADOW_RADIUS),
    )
    val natural = remember(value, base) { measurer.measure(value, base, softWrap = false).size.width.toFloat() }
    val shrink = if (natural > width) maxOf(MIN_SCALE, width / natural) else 1f
    Box(
        Modifier.place(PhotoRect((layout.width - width) / 2, line.y - line.size * BASELINE_LIFT - height / 2, width, height)),
        contentAlignment = Alignment.Center,
    ) {
        Text(value, style = base.copy(fontSize = (line.size * shrink).sp), maxLines = 1, softWrap = false)
    }
}

@Composable
private fun bird(filmId: String): LottieComposition? {
    val path = MeeFilmCatalog.assetPath(filmId) ?: return null
    val composition by rememberLottieComposition(LottieCompositionSpec.Asset(path))
    return composition
}

@Composable
private fun Bird(composition: LottieComposition, rect: PhotoRect, mirrored: Boolean) {
    LottieAnimation(
        composition,
        progress = { 0f },
        modifier = Modifier.place(rect).graphicsLayer { scaleX = if (mirrored) -1f else 1f },
    )
}

private fun Modifier.place(rect: PhotoRect): Modifier =
    offset { IntOffset(rect.x.roundToInt(), rect.y.roundToInt()) }.size(rect.width.dp, rect.height.dp)

/** Le cadre se dessine en pixels : 1 dp = 1 px, 1 sp = 1 px. */
private val PIXELS = Density(1f, 1f)
private const val EMBLEM_REST = 0.82f
private const val EMBLEM_FADE = 0.25f
private const val TEXT_WIDTH = 0.9f
private const val LINE_HEIGHT = 1.3f
private const val BASELINE_LIFT = 0.3f
private const val SHADOW_RADIUS = 0.012f
private const val MIN_SCALE = 0.5f
private const val TOP_SCRIM = 0.4f
private const val BOTTOM_SCRIM_TOP = 0.35f
private const val LEVEL_SUMMIT = 100
private const val MEE_FILM = MeeFilmCatalog.MEE_SOURIRE
private const val MEO_FILM = MeeFilmCatalog.MEO_SALUT
