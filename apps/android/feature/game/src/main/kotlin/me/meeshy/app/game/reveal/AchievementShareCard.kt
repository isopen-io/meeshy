package me.meeshy.app.game.reveal

import android.content.Context
import android.content.Intent
import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.compose.ui.graphics.toArgb
import androidx.core.content.FileProvider
import java.io.File
import java.util.Locale
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.engagement.RarityBorder
import me.meeshy.sdk.model.game.engagement.RevealPhotoMoment
import me.meeshy.ui.component.game.GamePalette
import me.meeshy.ui.theme.MeeshyPalette

/**
 * **Ce que la carte 9:16 d'un succès DIT** (miroir de `GamePhotoMoments.achievement` + `GamePhotoAuthorPlate`, iOS #7742,
 * #10816) : l'étiquette, le titre que la révélation affiche, la rareté seulement quand elle a le droit de se montrer
 * (fail-closed) et le pseudo PUBLIC de l'auteur. Rien d'autre ne part : ni identifiant, ni e-mail, ni numéro, ni lien de
 * parrainage — une carte se partage hors de Meeshy, à des inconnus.
 */
internal data class AchievementShareCardSpec(
    val kicker: String,
    val title: String,
    val rarityLine: String?,
    val authorLine: String?,
    val border: RarityBorder?,
) {
    companion object {
        fun of(res: Resources, locale: Locale, moment: RevealPhotoMoment, authorHandle: String?): AchievementShareCardSpec {
            val handle = authorHandle?.trim()?.removePrefix("@")?.takeIf { it.isNotEmpty() }
            val visible = moment.rarity
            return AchievementShareCardSpec(
                kicker = res.getString(R.string.game_photo_kicker_achievement),
                title = moment.title,
                rarityLine = visible?.let { RevealCopy.rarityName(res, it) },
                authorLine = handle?.let { res.getString(R.string.game_photo_author_label_achievement, "@$it") },
                border = visible?.let(RarityBorder::of),
            )
        }
    }
}

/** Dessine la carte 9:16 (1080 × 1920) avec le canevas natif : aucune vue à monter, aucune capture d'écran. */
internal object AchievementShareCardRenderer {
    const val WIDTH = 1080
    const val HEIGHT = 1920
    private const val CENTER_X = WIDTH / 2f
    private const val EMBLEM_Y = 760f
    private const val RAYS = 12

    fun render(spec: AchievementShareCardSpec): Bitmap {
        val bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val tint = MeeshyPalette.Purple500.toArgb()
        drawBackdrop(canvas, tint)
        drawRays(canvas, tint)
        drawEmblem(canvas, tint, spec.border)
        var y = 1130f
        y = drawCentered(canvas, spec.kicker.uppercase(), y, size = 40f, color = MeeshyPalette.Indigo200.toArgb(), bold = true, letterSpacing = 0.12f)
        y = drawCentered(canvas, spec.title, y + 36f, size = 84f, color = MeeshyPalette.White.toArgb(), bold = true)
        spec.rarityLine?.let { y = drawCentered(canvas, it, y + 40f, size = 46f, color = MeeshyPalette.Indigo200.toArgb(), bold = false) }
        spec.authorLine?.let { drawCentered(canvas, it, 1640f, size = 48f, color = MeeshyPalette.White.toArgb(), bold = true) }
        drawCentered(canvas, "Meeshy", 1760f, size = 56f, color = MeeshyPalette.Indigo200.toArgb(), bold = true, letterSpacing = 0.08f)
        return bitmap
    }

    private fun drawBackdrop(canvas: Canvas, tint: Int) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = LinearGradient(0f, 0f, 0f, HEIGHT.toFloat(), MeeshyPalette.Indigo900.toArgb(), MeeshyPalette.Indigo950.toArgb(), Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, WIDTH.toFloat(), HEIGHT.toFloat(), paint)
        val glow = Paint(Paint.ANTI_ALIAS_FLAG)
        glow.shader = RadialGradient(CENTER_X, 0f, 1100f, withAlpha(tint, 0.32f), 0x00000000, Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, WIDTH.toFloat(), HEIGHT.toFloat(), glow)
    }

    private fun drawRays(canvas: Canvas, tint: Int) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = withAlpha(tint, 0.35f) }
        repeat(RAYS) { index ->
            val angle = Math.toRadians(index * (360.0 / RAYS))
            val cx = CENTER_X + (RAY_RADIUS * sin(angle)).toFloat()
            val cy = EMBLEM_Y - (RAY_RADIUS * cos(angle)).toFloat()
            canvas.save()
            canvas.rotate((index * (360f / RAYS)), cx, cy)
            canvas.drawRoundRect(RectF(cx - 6f, cy - 36f, cx + 6f, cy + 36f), 6f, 6f, paint)
            canvas.restore()
        }
    }

    private fun drawEmblem(canvas: Canvas, tint: Int, border: RarityBorder?) {
        if (border != null) {
            val plate = RectF(CENTER_X - 250f, EMBLEM_Y - 250f, CENTER_X + 250f, EMBLEM_Y + 250f)
            canvas.drawRoundRect(plate, 110f, 110f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = withAlpha(tint, 0.14f) })
            canvas.drawRoundRect(plate, 110f, 110f, rimPaint(border))
        }
        val disc = Paint(Paint.ANTI_ALIAS_FLAG)
        disc.shader = LinearGradient(CENTER_X - 190f, EMBLEM_Y - 190f, CENTER_X + 190f, EMBLEM_Y + 190f, tint, withAlpha(tint, 0.55f), Shader.TileMode.CLAMP)
        canvas.drawCircle(CENTER_X, EMBLEM_Y, 190f, disc)
        canvas.drawPath(star(CENTER_X, EMBLEM_Y, 96f, 40f), Paint(Paint.ANTI_ALIAS_FLAG).apply { color = MeeshyPalette.White.toArgb() })
    }

    private fun rimPaint(border: RarityBorder): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 8f
        val solid = border.solidColor()
        if (solid != null) {
            color = solid.toArgb()
        } else {
            val stops = GamePalette.prismStops
            shader = SweepGradient(CENTER_X, EMBLEM_Y, stops.map { it.second.toArgb() }.toIntArray(), stops.map { it.first }.toFloatArray())
        }
    }

    private fun star(cx: Float, cy: Float, outer: Float, inner: Float): Path = Path().apply {
        repeat(10) { i ->
            val radius = if (i % 2 == 0) outer else inner
            val angle = Math.toRadians(-90.0 + i * 36.0)
            val x = cx + (radius * cos(angle)).toFloat()
            val y = cy + (radius * sin(angle)).toFloat()
            if (i == 0) moveTo(x, y) else lineTo(x, y)
        }
        close()
    }

    private fun drawCentered(canvas: Canvas, text: String, top: Float, size: Float, color: Int, bold: Boolean, letterSpacing: Float = 0f): Float {
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            textSize = size
            typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            this.letterSpacing = letterSpacing
        }
        val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, TEXT_WIDTH)
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .setMaxLines(3)
            .build()
        canvas.save()
        canvas.translate((WIDTH - TEXT_WIDTH) / 2f, top)
        layout.draw(canvas)
        canvas.restore()
        return top + layout.height
    }

    private fun withAlpha(color: Int, alpha: Float): Int = (color and 0x00FFFFFF) or ((alpha * 255).toInt() shl 24)

    private const val TEXT_WIDTH = 880
    private const val RAY_RADIUS = 330.0
}

/**
 * Compose la carte et la remet à la feuille de partage système, hors de Meeshy (miroir de « Partager » du déroulé photo,
 * iOS) : un PNG dans le cache `shared-media/` servi par le `FileProvider` de l'application. Le fichier précédent est
 * remplacé, jamais accumulé. Un échec est rendu à l'appelant, qui le dit.
 */
internal object AchievementCardSharer {
    suspend fun share(context: Context, spec: AchievementShareCardSpec, moment: RevealPhotoMoment, chooserTitle: String): Result<Unit> =
        try {
            val file = withContext(Dispatchers.Default) { write(context, spec, moment) }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val send = Intent(Intent.ACTION_SEND)
                .setType("image/png")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(
                Intent.createChooser(send, chooserTitle).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION),
            )
            Result.success(Unit)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Throwable) {
            Result.failure(failure)
        }

    internal fun write(context: Context, spec: AchievementShareCardSpec, moment: RevealPhotoMoment): File {
        val directory = File(context.cacheDir, "shared-media").apply { mkdirs() }
        directory.listFiles()?.forEach { it.delete() }
        val file = File(directory, moment.fileName)
        val bitmap = AchievementShareCardRenderer.render(spec)
        try {
            file.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) { "PNG non écrit" } }
        } finally {
            bitmap.recycle()
        }
        return file
    }
}

/**
 * « En faire une carte » de bout en bout : compose la carte du moment, l'offre à la feuille de partage système et dit
 * l'échec d'un toast (« La photo n'a pas pu être composée. ») plutôt que de se taire. [authorHandle] : le pseudo PUBLIC du
 * compte, `null` pour un invité.
 */
suspend fun shareAchievementCard(context: Context, moment: RevealPhotoMoment, authorHandle: String?) {
    val res = context.resources
    val spec = AchievementShareCardSpec.of(res, res.configuration.locales[0], moment, authorHandle)
    AchievementCardSharer.share(context, spec, moment, chooserTitle = res.getString(R.string.game_photo_share))
        .onFailure { android.widget.Toast.makeText(context, R.string.game_photo_failed, android.widget.Toast.LENGTH_LONG).show() }
}
