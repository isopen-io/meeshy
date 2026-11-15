package me.meeshy.app.chat.export

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.util.TimeZone
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/**
 * LA VIDÉO QUI DÉFILE (#18671, miroir de `MessageCardScrollExporter`) — la carte sans plafond, montrée sous la fenêtre
 * de son format et glissant à la vitesse choisie. Encodée sur l'appareil (H.264 dans un MP4), rien ne part au serveur.
 */
object CardVideoOutput {

    private const val MIME = "video/avc"
    private const val ALBUM = "Meeshy"
    private const val BITS_PER_PIXEL = 0.12
    private const val PROGRESS_STEP = 15

    /** Le plan de la carte telle que [input] la demande, ou `null` si elle tient dans son format. */
    fun plan(input: CardInput, speed: CardScrollSpeed): CardScrollPlan? {
        val layout = CardRenderer.layout(input.copy(unbounded = true))
        val viewport = layout.viewportHeight ?: return null
        return CardScrollPlan.of(layout.height, viewport, speed)
    }

    /** Encode la vidéo dans [target] ; [onProgress] reçoit la part faite, de 0 à 1. */
    suspend fun encode(
        input: CardInput,
        speed: CardScrollSpeed,
        pictures: Map<String, Bitmap>,
        target: File,
        onProgress: (Double) -> Unit = {},
    ): Unit = withContext(Dispatchers.Default) {
        val fonts = CardRenderer.Fonts()
        val tall = input.copy(unbounded = true)
        val layout = CardRenderer.layout(tall, fonts)
        val viewport = checkNotNull(layout.viewportHeight) { "viewport" }
        val plan = checkNotNull(CardScrollPlan.of(layout.height, viewport, speed)) { "fits" }
        val width = even(layout.width)
        val height = even(viewport)
        val format = MediaFormat.createVideoFormat(MIME, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, (width * height * CardScrollPlan.FPS * BITS_PER_PIXEL).toInt())
            setInteger(MediaFormat.KEY_FRAME_RATE, CardScrollPlan.FPS.toInt())
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
        }
        val codec = MediaCodec.createEncoderByType(MIME)
        val muxer = MediaMuxer(target.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        var track = -1
        var written = 0
        val info = MediaCodec.BufferInfo()
        val frameMicros = (1_000_000 / CardScrollPlan.FPS).toLong()

        fun drain(endOfStream: Boolean) {
            while (true) {
                val index = codec.dequeueOutputBuffer(info, if (endOfStream) 10_000 else 0)
                when {
                    index == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream) return
                    index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        track = muxer.addTrack(codec.outputFormat)
                        muxer.start()
                    }
                    index >= 0 -> {
                        val buffer = checkNotNull(codec.getOutputBuffer(index))
                        val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                        if (!config && info.size > 0 && track >= 0) {
                            info.presentationTimeUs = written * frameMicros
                            muxer.writeSampleData(track, buffer, info)
                            written += 1
                        }
                        codec.releaseOutputBuffer(index, false)
                        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                    }
                }
            }
        }

        try {
            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            val surface = codec.createInputSurface()
            codec.start()
            val scale = width / layout.width
            try {
                for (frame in 0 until plan.frameCount) {
                    ensureActive()
                    val canvas = surface.lockHardwareCanvas()
                    try {
                        canvas.scale(scale.toFloat(), scale.toFloat())
                        CardRenderer.paint(canvas, layout, tall, fonts, pictures, offset = plan.offset(plan.time(frame)))
                    } finally {
                        surface.unlockCanvasAndPost(canvas)
                    }
                    drain(endOfStream = false)
                    if (frame % PROGRESS_STEP == 0 || frame == plan.frameCount - 1) onProgress((frame + 1).toDouble() / plan.frameCount)
                }
                codec.signalEndOfInputStream()
                drain(endOfStream = true)
            } finally {
                surface.release()
            }
        } finally {
            runCatching { codec.stop() }
            codec.release()
            runCatching { if (track >= 0) muxer.stop() }
            muxer.release()
        }
    }

    /** Enregistre la vidéo dans l'album « Meeshy » des vidéos. */
    suspend fun saveToGallery(context: Context, input: CardInput, speed: CardScrollSpeed, pictures: Map<String, Bitmap>, onProgress: (Double) -> Unit = {}): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val file = encodeToCache(context, input, speed, pictures, onProgress)
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) saveScoped(context, file) else saveLegacy(context, file)
                } finally {
                    file.delete()
                }
            }
        }

    /** La VIDÉO, jamais un lien : la feuille de partage la reçoit comme un fichier MP4. */
    suspend fun share(context: Context, input: CardInput, speed: CardScrollSpeed, chooserTitle: String, pictures: Map<String, Bitmap>, onProgress: (Double) -> Unit = {}): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val file = encodeToCache(context, input, speed, pictures, onProgress)
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                val send = Intent(Intent.ACTION_SEND)
                    .setType("video/mp4")
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                val chooser = Intent.createChooser(send, chooserTitle)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                withContext(Dispatchers.Main) { context.startActivity(chooser) }
            }
        }

    private suspend fun encodeToCache(context: Context, input: CardInput, speed: CardScrollSpeed, pictures: Map<String, Bitmap>, onProgress: (Double) -> Unit): File {
        val directory = File(context.cacheDir, "shared-media").apply { mkdirs() }
        directory.listFiles()?.forEach { it.delete() }
        val file = File(directory, fileName())
        try {
            encode(input, speed, pictures, file, onProgress)
        } catch (t: Throwable) {
            file.delete()
            throw t
        }
        return file
    }

    private fun saveScoped(context: Context, file: File) {
        val resolver = context.contentResolver
        val pending = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
            put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/$ALBUM")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val item = checkNotNull(resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, pending)) { "insert" }
        try {
            checkNotNull(resolver.openOutputStream(item)) { "stream" }.use { out -> file.inputStream().use { it.copyTo(out) } }
            resolver.update(item, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        } catch (t: Throwable) {
            resolver.delete(item, null, null)
            throw t
        }
    }

    @Suppress("DEPRECATION")
    private fun saveLegacy(context: Context, file: File) {
        val album = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), ALBUM).apply { mkdirs() }
        val target = File(album, file.name)
        try {
            file.copyTo(target, overwrite = true)
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, target.name)
                put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
                put(MediaStore.MediaColumns.DATA, target.absolutePath)
            }
            checkNotNull(context.contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)) { "insert" }
        } catch (t: Throwable) {
            target.delete()
            throw t
        }
    }

    private fun fileName(): String {
        val now = System.currentTimeMillis()
        return CardSubjects.fileName(now, TimeZone.getDefault().getOffset(now) / 1000).removeSuffix(".png") + ".mp4"
    }

    private fun even(value: Double): Int = (value.toInt() / 2) * 2
}
