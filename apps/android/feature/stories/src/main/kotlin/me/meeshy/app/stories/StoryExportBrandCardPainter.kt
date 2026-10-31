package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import androidx.compose.ui.graphics.toArgb
import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportIdentity
import me.meeshy.sdk.model.scene.export.StoryExportIdentityLayout
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import me.meeshy.ui.component.avatarInitials
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.theme.hexColor

/**
 * Ce que la peinture de marque reçoit : l'identité opaque ([StoryExportIdentity]), ses deux images déjà rapatriées (une image
 * absente ou illisible se remplace par l'aplat d'accent et les initiales), et ce qu'elle doit écrire dans [directory], à la
 * taille du format de la vidéo.
 */
data class StoryExportBrandPaintRequest(
    val identity: StoryExportIdentity,
    val avatar: File?,
    val banner: File?,
    val withIntro: Boolean,
    val withAuthorCard: Boolean,
    val directory: File,
    val format: StoryExportVideoFormat,
)

/** Les cartes peintes : l'intro d'identité, la carte de fin (logo) et la carte d'auteur qui s'y fond ; chacune opaque, au format. */
data class StoryExportBrandCards(val intro: File?, val outro: File, val author: File?)

/**
 * **Peint l'intro et la carte de fin d'un export de story** (#13509, #13997 ; miroir de `StoryExportIntro.render` et
 * `StoryExportOutro` iOS) en Bitmap / Canvas, hors écran. Les nombres viennent de [StoryExportIdentityLayout] (testé) : cette
 * peinture ne décide ni où va le point de présence ni où va le logo de cercle. Les cartes de fin sont fixes — le logo y est
 * tracé en entier —, l'animation de tracé d'iOS n'a pas de contrepartie ici.
 */
internal object StoryExportBrandCardPainter {

    fun write(request: StoryExportBrandPaintRequest): StoryExportBrandCards {
        val width = request.format.width
        val height = request.format.height
        val avatar = request.avatar?.let { decode(it, MAX_IMAGE_SIDE) }
        val banner = request.banner?.let { decode(it, MAX_IMAGE_SIDE) }
        try {
            request.directory.mkdirs()
            return StoryExportBrandCards(
                intro = File(request.directory, "intro.png").takeIf { request.withIntro }?.also {
                    save(it, width, height) { canvas -> identityCard(canvas, request.identity, avatar, banner, width, height) }
                },
                outro = File(request.directory, "fin.png").also {
                    save(it, width, height) { canvas -> logoCard(canvas, width, height) }
                },
                author = File(request.directory, "auteur.png").takeIf { request.withAuthorCard }?.also {
                    save(it, width, height) { canvas -> authorCard(canvas, request.identity, avatar, width, height) }
                },
            )
        } finally {
            avatar?.recycle()
            banner?.recycle()
        }
    }

    private fun save(target: File, width: Int, height: Int, paint: (Canvas) -> Unit) {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        try {
            paint(Canvas(bitmap))
            target.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, it) }
        } finally {
            bitmap.recycle()
        }
    }

    private fun decode(file: File, maxSide: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
        return BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
    }

    // MARK: cartes

    private fun identityCard(canvas: Canvas, identity: StoryExportIdentity, avatar: Bitmap?, banner: Bitmap?, width: Int, height: Int) {
        backdrop(canvas, banner, identity.accentHex, width, height)
        scrim(canvas, width, height)
        drawIdentity(canvas, identity, avatar, width, height)
    }

    private fun authorCard(canvas: Canvas, identity: StoryExportIdentity, avatar: Bitmap?, width: Int, height: Int) {
        brandBackground(canvas, width, height)
        logo(canvas, width, height, WATERMARK_ALPHA)
        scrim(canvas, width, height)
        drawIdentity(canvas, identity, avatar, width, height)
    }

    private fun logoCard(canvas: Canvas, width: Int, height: Int) {
        brandBackground(canvas, width, height)
        logo(canvas, width, height, 1f)
        val wordmark = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            alpha = WORDMARK_ALPHA
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textSize = width * WORDMARK_FRACTION
        }
        val side = width * LOGO_FRACTION
        centred(canvas, "Meeshy", wordmark, width, height * LOGO_CENTER_Y + side / 2f + width * WORDMARK_GAP_FRACTION)
    }

    // MARK: fonds

    private fun backdrop(canvas: Canvas, banner: Bitmap?, accentHex: String, width: Int, height: Int) {
        if (banner == null) {
            val accent = accentArgb(accentHex)
            val paint = Paint().apply { shader = LinearGradient(0f, 0f, width.toFloat(), height.toFloat(), accent, Color.BLACK, Shader.TileMode.CLAMP) }
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
            return
        }
        val scale = maxOf(width / banner.width.toFloat(), height / banner.height.toFloat())
        val drawnWidth = banner.width * scale
        val drawnHeight = banner.height * scale
        val target = RectF((width - drawnWidth) / 2f, (height - drawnHeight) / 2f, (width + drawnWidth) / 2f, (height + drawnHeight) / 2f)
        canvas.drawBitmap(banner, null, target, Paint(Paint.FILTER_BITMAP_FLAG))
    }

    private fun scrim(canvas: Canvas, width: Int, height: Int) {
        val colors = intArrayOf(Color.argb(SCRIM_TOP, 0, 0, 0), Color.argb(SCRIM_MID, 0, 0, 0), Color.argb(SCRIM_BOTTOM, 0, 0, 0))
        val paint = Paint().apply {
            shader = LinearGradient(width / 2f, 0f, width / 2f, height.toFloat(), colors, floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
        }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
    }

    private fun brandBackground(canvas: Canvas, width: Int, height: Int) {
        val paint = Paint().apply {
            shader = LinearGradient(width / 2f, 0f, width / 2f, height.toFloat(), INDIGO_950, Color.BLACK, Shader.TileMode.CLAMP)
        }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
    }

    // MARK: logo

    private fun logo(canvas: Canvas, width: Int, height: Int, opacity: Float) {
        val side = width * LOGO_FRACTION
        val left = (width - side) / 2f
        val top = height * LOGO_CENTER_Y - side / 2f
        val scale = side / LOGO_VIEWBOX
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeWidth = LOGO_DASH_WIDTH * scale
            color = INDIGO_500
            alpha = (opacity * ALPHA_MAX).toInt()
        }
        LOGO_DASHES.forEach { (x1, y1, x2, y2) ->
            canvas.drawLine(left + x1 * scale, top + y1 * scale, left + x2 * scale, top + y2 * scale, paint)
        }
    }

    // MARK: identité

    private fun drawIdentity(canvas: Canvas, identity: StoryExportIdentity, avatar: Bitmap?, width: Int, height: Int) {
        val layout = StoryExportIdentityLayout.of(identity, width.toFloat(), height.toFloat())
        val disc = RectF(layout.avatarLeft, layout.avatarTop, layout.avatarLeft + layout.avatarSide, layout.avatarTop + layout.avatarSide)
        avatarDisc(canvas, identity, avatar, disc, layout.avatarSide)
        layout.presenceDot?.let { dot ->
            val color = meeshyPresenceDotColor(dot.state)?.toArgb() ?: return@let
            val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = DOT_RING }
            val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
            canvas.drawCircle(dot.centerX, dot.centerY, dot.diameter / 2f + dot.ringWidth, ring)
            canvas.drawCircle(dot.centerX, dot.centerY, dot.diameter / 2f, fill)
        }
        nameLine(canvas, identity, layout, width)
        layout.handleText?.let { handle ->
            val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; alpha = HANDLE_ALPHA; textSize = layout.handleTextSize }
            centred(canvas, handle, paint, width, layout.handleTop)
        }
        layout.moodCenterY?.let { mood(canvas, identity, layout, width, it) }
    }

    /** Le nom puis le logo de cercle sur UNE ligne et UNE taille : seul le nom s'abrège, le logo reste toujours entier. */
    private fun nameLine(canvas: Canvas, identity: StoryExportIdentity, layout: StoryExportIdentityLayout, width: Int) {
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textSize = layout.nameTextSize
        }
        val suffix = layout.nameSuffix
        val room = width * NAME_ROOM_FRACTION - paint.measureText(suffix)
        val name = TextUtils.ellipsize(identity.displayName, paint, room.coerceAtLeast(0f), TextUtils.TruncateAt.END)
        centred(canvas, "$name$suffix", paint, width, layout.nameTop)
    }

    private fun avatarDisc(canvas: Canvas, identity: StoryExportIdentity, avatar: Bitmap?, disc: RectF, side: Float) {
        val saved = canvas.save()
        val clip = Path().apply { addOval(disc, Path.Direction.CW) }
        canvas.clipPath(clip)
        if (avatar != null) {
            canvas.drawBitmap(avatar, Rect(0, 0, avatar.width, avatar.height), disc, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        } else {
            canvas.drawRect(disc, Paint().apply { color = accentArgb(identity.accentHex) })
        }
        canvas.restoreToCount(saved)
        if (avatar != null) return
        val initials = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textSize = side * INITIALS_FRACTION
        }
        val baseline = disc.centerY() - (initials.ascent() + initials.descent()) / 2f
        val letters = avatarInitials(identity.displayName)
        canvas.drawText(letters, disc.centerX() - initials.measureText(letters) / 2f, baseline, initials)
    }

    private fun mood(canvas: Canvas, identity: StoryExportIdentity, layout: StoryExportIdentityLayout, width: Int, centerY: Float) {
        val emoji = identity.moodEmoji ?: return
        val emojiPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = layout.moodEmojiSize }
        val messagePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; alpha = MOOD_MESSAGE_ALPHA; textSize = layout.moodMessageSize }
        val padH = width * MOOD_PAD_H_FRACTION
        val gap = if (identity.moodMessage != null) width * MOOD_GAP_FRACTION else 0f
        val room = width * NAME_ROOM_FRACTION - padH * 2f - emojiPaint.measureText(emoji) - gap
        val message = identity.moodMessage?.let { TextUtils.ellipsize(it, messagePaint, room.coerceAtLeast(0f), TextUtils.TruncateAt.END).toString() }
        val messageWidth = message?.let { messagePaint.measureText(it) } ?: 0f
        val content = emojiPaint.measureText(emoji) + gap + messageWidth
        val padV = width * MOOD_PAD_V_FRACTION
        val height = maxOf(emojiPaint.descent() - emojiPaint.ascent(), messagePaint.descent() - messagePaint.ascent()) + padV * 2f
        val capsule = RectF((width - content - padH * 2f) / 2f, centerY - height / 2f, (width + content + padH * 2f) / 2f, centerY + height / 2f)
        canvas.drawRoundRect(capsule, height / 2f, height / 2f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; alpha = CAPSULE_ALPHA })
        val x = capsule.left + padH
        canvas.drawText(emoji, x, centerY - (emojiPaint.ascent() + emojiPaint.descent()) / 2f, emojiPaint)
        message?.let { canvas.drawText(it, x + emojiPaint.measureText(emoji) + gap, centerY - (messagePaint.ascent() + messagePaint.descent()) / 2f, messagePaint) }
    }

    private fun centred(canvas: Canvas, text: String, paint: TextPaint, width: Int, top: Float) {
        canvas.drawText(text, (width - paint.measureText(text)) / 2f, top - paint.ascent(), paint)
    }

    /** L'accent de l'auteur ; une teinte illisible retombe sur l'indigo de la marque, jamais sur un aplat transparent. */
    private fun accentArgb(accentHex: String): Int =
        hexColor(accentHex, androidx.compose.ui.graphics.Color(INDIGO_500)).toArgb()

    private const val MAX_IMAGE_SIDE = 2048
    private const val PNG_QUALITY = 100
    private const val ALPHA_MAX = 255
    private const val SCRIM_TOP = 158
    private const val SCRIM_MID = 71
    private const val SCRIM_BOTTOM = 184
    private const val WATERMARK_ALPHA = 0.22f
    private const val WORDMARK_ALPHA = 230
    private const val WORDMARK_FRACTION = 0.07f
    private const val WORDMARK_GAP_FRACTION = 0.1f
    private const val HANDLE_ALPHA = 191
    private const val MOOD_MESSAGE_ALPHA = 230
    private const val CAPSULE_ALPHA = 41
    private const val MOOD_GAP_FRACTION = 0.02f
    private const val MOOD_PAD_H_FRACTION = 0.03f
    private const val MOOD_PAD_V_FRACTION = 0.016f
    private const val INITIALS_FRACTION = 0.38f
    private const val NAME_ROOM_FRACTION = 0.9f
    private const val LOGO_FRACTION = 0.44f
    private const val LOGO_CENTER_Y = 0.40f
    private const val LOGO_VIEWBOX = 1024f
    private const val LOGO_DASH_WIDTH = 112f
    private val INDIGO_950 = Color.rgb(30, 27, 75)
    private val INDIGO_500 = Color.rgb(99, 102, 241)
    private val DOT_RING = Color.rgb(11, 11, 20)

    /** Trois traits en espace 1024 (`MeeshyDashesShape`) : longueurs décroissantes, alignés à gauche. */
    private val LOGO_DASHES = listOf(
        listOf(262f, 384f, 762f, 384f),
        listOf(262f, 512f, 662f, 512f),
        listOf(262f, 640f, 562f, 640f),
    )
}
