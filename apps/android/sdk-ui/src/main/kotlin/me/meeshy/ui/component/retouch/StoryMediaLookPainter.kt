package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import coil.request.ImageRequest
import coil.size.Size
import coil.transform.Transformation
import java.text.DateFormat
import java.util.Date
import kotlin.math.max
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.composer.look.ComposerLookPerson
import me.meeshy.sdk.model.composer.look.StoryMediaLookMapping

/**
 * **LE LOOK D'UN MÉDIA DE LA SCÈNE, PAR LE PEINTRE DE LA RETOUCHE** (#13841, miroir de `ComposerLookPainterAdapter`
 * iOS) : le filtre de l'appel, l'effet de visage, le cadrage puis le cadre, dans l'étendue du média — ses proportions ne
 * changent jamais. La scène le peint en direct ([StoryMediaLookTransformation]) et la publication le cuit ([paint]) par
 * le MÊME graphe ([ComposerLookPainter]) : ce qu'on voit est ce qui part.
 */
public object StoryMediaLookPainter {

    /**
     * Le média réglé, au plus [longSide] de grand côté ; la source telle quelle quand le look ne peint rien (identifiant
     * inconnu compris). `null` si la toile est impossible ou si le cadre choisi ne se peint pas.
     */
    public fun paint(source: Bitmap, look: StoryMediaLook, author: ComposerLookAuthor, longSide: Int = max(source.width, source.height)): Bitmap? {
        val photo = StoryMediaLookMapping.photoLook(look)
        val framing = StoryMediaLookMapping.framingCrop(look.framing)
        if (photo.isUntouched && framing == null) return source
        val face = if (photo.effect.needsFace) RetouchFaceDetector.detect(source) else null
        return ComposerLookPainter.paint(source, photo, author, longSide, framing, face)
    }
}

/** Le look d'un média posé sur l'image que Coil décode pour la scène — hors du fil principal, mis en cache par look et auteur. */
public class StoryMediaLookTransformation(private val look: StoryMediaLook, private val author: ComposerLookAuthor) : Transformation {
    override val cacheKey: String =
        listOf("story-media-look", look.signature, author.id, author.name, author.handle.orEmpty(), author.date).joinToString("|")

    override suspend fun transform(input: Bitmap, size: Size): Bitmap = StoryMediaLookPainter.paint(input, look, author) ?: input
}

/** La requête qui peint [look] sur l'image chargée ; inchangée quand le look ne peint rien. */
public fun ImageRequest.Builder.storyMediaLook(look: StoryMediaLook?, author: ComposerLookAuthor): ImageRequest.Builder =
    if (look != null && StoryMediaLookMapping.paints(look)) transformations(StoryMediaLookTransformation(look, author)) else this

/** Le modèle d'image d'un média dont la scène peint le [look] : le modèle tel quel s'il ne peint rien. */
@Composable
public fun rememberStoryMediaLookModel(model: Any?, look: StoryMediaLook?): Any? {
    val context = LocalContext.current
    val author = LocalComposerLookAuthor.current
    return remember(model, look, author) {
        if (model == null || look == null || !StoryMediaLookMapping.paints(look)) model
        else ImageRequest.Builder(context).data(model).storyMediaLook(look, author).build()
    }
}

/** L'auteur et la séance que les cadres écrivent : son nom, la marque, la date et l'heure. */
public fun composerLookAuthor(person: ComposerLookPerson, now: Date = Date()): ComposerLookAuthor {
    val date = DateFormat.getDateInstance(DateFormat.MEDIUM).format(now)
    val clock = DateFormat.getTimeInstance(DateFormat.SHORT).format(now)
    return ComposerLookAuthor(person.id, person.name, person.handle, CallMontageCaption(CallMontageCaption.BRAND_TITLE, date, clock), date)
}

/** L'auteur que la scène écrit dans les cadres de ses médias réglés ; sans auteur fourni, un auteur anonyme. */
public val LocalComposerLookAuthor: ProvidableCompositionLocal<ComposerLookAuthor> =
    staticCompositionLocalOf { composerLookAuthor(ComposerLookPerson.author(null, null, null)) }

/** L'auteur d'une séance de composition, gardé tant que la personne ne change pas. */
@Composable
public fun rememberComposerLookAuthor(person: ComposerLookPerson): ComposerLookAuthor = remember(person) { composerLookAuthor(person) }
