package me.meeshy.app.chat.export

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.core.graphics.drawable.toBitmap
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** La peinture d'une tuile de média : l'image rognée au centre, ou l'attente ; le triangle d'une vidéo ; « +n » des visuels cachés. */
internal object CardPicturePainter {

    fun paint(canvas: Canvas, op: CardOp.Picture, bitmap: Bitmap?, palette: CardPalette, fonts: CardRenderer.Fonts) {
        val frame = RectF(op.x.toFloat(), op.y.toFloat(), (op.x + op.width).toFloat(), (op.y + op.height).toFloat())
        val radius = minOf(op.radius, op.width / 2, op.height / 2).toFloat()
        canvas.save()
        canvas.clipPath(Path().apply { addRoundRect(frame, radius, radius, Path.Direction.CW) })
        canvas.drawRect(frame, Paint().apply { color = palette.replyPanel.toArgb() })
        bitmap?.let { canvas.drawBitmap(it, centerCrop(it.width, it.height, frame), frame, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)) }
        if (op.overflow > 0) paintOverflow(canvas, frame, op.overflow, fonts)
        canvas.restore()
        if (op.media.kind == CardMediaKind.VIDEO && op.overflow == 0) paintPlay(canvas, frame)
    }

    /** La part de l'image qui remplit [frame] sans la déformer : son centre. */
    fun centerCrop(width: Int, height: Int, frame: RectF): Rect {
        val target = frame.width() / frame.height()
        val source = width.toFloat() / height
        return if (source > target) {
            val kept = (height * target).toInt()
            Rect((width - kept) / 2, 0, (width + kept) / 2, height)
        } else {
            val kept = (width / target).toInt()
            Rect(0, (height - kept) / 2, width, (height + kept) / 2)
        }
    }

    private fun paintPlay(canvas: Canvas, frame: RectF) {
        val size = minOf(frame.width(), frame.height()) * PLAY_SHARE
        val cx = frame.centerX()
        val cy = frame.centerY()
        canvas.drawCircle(cx, cy, size / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = SCRIM })
        val side = size * 0.42f
        val triangle = Path().apply {
            moveTo(cx - side * 0.38f, cy - side / 2)
            lineTo(cx + side * 0.62f, cy)
            lineTo(cx - side * 0.38f, cy + side / 2)
            close()
        }
        canvas.drawPath(triangle, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = WHITE })
    }

    private fun paintOverflow(canvas: Canvas, frame: RectF, hidden: Int, fonts: CardRenderer.Fonts) {
        canvas.drawRect(frame, Paint().apply { color = SCRIM })
        val paint = Paint(fonts.paint(CardFont(CardFace.system(800), minOf(frame.height() * 0.3f, 96f).toDouble()))).apply {
            color = WHITE
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText("+$hidden", frame.centerX(), frame.centerY() - (paint.descent() + paint.ascent()) / 2, paint)
    }

    private const val PLAY_SHARE = 0.28f
    private const val SCRIM = 0x8C000000.toInt()
    private const val WHITE = -0x1
}

/**
 * Le chargement des images d'une carte, une fois à l'ouverture de l'atelier : la photo, l'image d'attente d'une vidéo, sinon sa
 * première image lue sur le fichier. Une image absente laisse sa tuile en attente — la carte ne se refuse pas pour autant.
 */
internal object CardPictureLoader {

    suspend fun load(context: Context, media: List<CardMedia>): Map<String, Bitmap> =
        media.mapNotNull { item -> picture(context, item)?.let { item.id to it } }.toMap()

    private suspend fun picture(context: Context, item: CardMedia): Bitmap? {
        val still = if (item.kind == CardMediaKind.IMAGE) item.url else item.posterUrl
        return still?.let { fetch(context, it) } ?: if (item.kind == CardMediaKind.VIDEO) firstFrame(context, item.url) else null
    }

    private suspend fun fetch(context: Context, url: String): Bitmap? = runCatching {
        val request = ImageRequest.Builder(context).data(url).size(MAX_SIDE).allowHardware(false).build()
        (context.imageLoader.execute(request) as? SuccessResult)?.drawable?.toBitmap()
    }.getOrNull()

    private suspend fun firstFrame(context: Context, url: String): Bitmap? = withContext(Dispatchers.IO) {
        val retriever = MediaMetadataRetriever()
        try {
            runCatching {
                if (url.startsWith("http")) retriever.setDataSource(url, emptyMap()) else retriever.setDataSource(context, Uri.parse(url))
                retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.let(::bounded)
            }.getOrNull()
        } finally {
            runCatching { retriever.release() }
        }
    }

    /** Une image de film plus grande que la carte ne peint rien de plus : elle se réduit à [MAX_SIDE]. */
    private fun bounded(frame: Bitmap): Bitmap {
        val side = maxOf(frame.width, frame.height)
        if (side <= MAX_SIDE) return frame
        val ratio = MAX_SIDE.toFloat() / side
        return Bitmap.createScaledBitmap(frame, (frame.width * ratio).toInt().coerceAtLeast(1), (frame.height * ratio).toInt().coerceAtLeast(1), true)
            .also { if (it !== frame) frame.recycle() }
    }

    private const val MAX_SIDE = 1080
}
