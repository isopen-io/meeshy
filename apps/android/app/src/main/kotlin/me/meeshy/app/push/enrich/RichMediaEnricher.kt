package me.meeshy.app.push.enrich

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import me.meeshy.app.push.media.CircularAvatar
import me.meeshy.app.push.media.PushMediaFetcher
import me.meeshy.app.push.pipeline.EnrichmentPhase
import me.meeshy.app.push.pipeline.EnrichmentRequest
import me.meeshy.app.push.pipeline.NotificationEnricher
import me.meeshy.sdk.model.push.PushMediaBudget
import me.meeshy.sdk.model.push.PushRichMedia
import javax.inject.Inject

/**
 * MEDIA : ce que la bannière d'un message montre de son média, comme la NSE iOS. UNE décision,
 * [PushRichMedia.of], prise sur la charge servie :
 *  - image (ou vignette de vidéo servie par la passerelle, jamais le fichier vidéo) : grande image
 *    en `BigPictureStyle` et photo ronde de l'expéditeur en grande icône ;
 *  - vocal : « Message vocal · durée » quand la passerelle n'a servi aucun texte ; la piste et sa
 *    langue sont celles que le serveur a élues pour le texte servi, le client ne descend aucun Prisme ;
 *  - message protégé (`notificationLocKey`, éphémère, vue unique, flouté, chiffré) : RIEN, ni image,
 *    ni vignette, ni photo de l'expéditeur, ni libellé de durée.
 * Tout téléchargement passe par [PushMediaFetcher] (origine de confiance, flux borné, budget FCM).
 */
class RichMediaEnricher @Inject constructor(
    @ApplicationContext private val context: Context,
    private val fetcher: PushMediaFetcher,
) : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.MEDIA

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        when (val media = PushRichMedia.of(request.push.payload)) {
            PushRichMedia.None -> Unit
            is PushRichMedia.Voice -> labelVoice(builder, request, media)
            is PushRichMedia.Picture -> if (request.preferences.showPreview) showPicture(builder, request, media.url, media.mimeType)
            is PushRichMedia.VideoThumbnail -> if (request.preferences.showPreview) showPicture(builder, request, media.url, media.mimeType)
        }
    }

    private fun labelVoice(builder: NotificationCompat.Builder, request: EnrichmentRequest, voice: PushRichMedia.Voice) {
        val payload = request.push.payload
        if (!(request.push.notificationBody ?: payload.body).isNullOrBlank()) return
        builder.setContentText(voiceLabel(voice.durationMs))
    }

    private fun voiceLabel(durationMs: Long?): String {
        val title = context.getString(R.string.voice_playback_voice_message)
        val duration = PushRichMedia.formatDuration(durationMs) ?: return title
        return "$title · $duration"
    }

    private suspend fun showPicture(builder: NotificationCompat.Builder, request: EnrichmentRequest, url: String, mimeType: String) {
        val remaining = request.deadlineMillis - System.currentTimeMillis()
        val pictureBudget = remaining - PushMediaBudget.avatarMillis(remaining, pictureWanted = true)
        val picture = download(url, mimeType, request, pictureBudget) ?: return
        val style = NotificationCompat.BigPictureStyle().bigPicture(picture)
        (request.push.notificationBody ?: request.push.payload.body)?.let { style.setSummaryText(it) }
        builder.setStyle(style)
        senderIcon(request)?.let { builder.setLargeIcon(it) }
    }

    private suspend fun senderIcon(request: EnrichmentRequest): Bitmap? {
        if (!request.preferences.showSenderName) return null
        val url = request.push.payload.senderAvatar ?: return null
        val budget = PushMediaBudget.avatarMillis(request.deadlineMillis - System.currentTimeMillis(), pictureWanted = false)
        if (budget <= 0) return null
        val file = fetcher.fetch(url = url, mimeType = AVATAR_MIME, declaredSize = null, data = emptyMap(), budgetMillis = budget) ?: return null
        return try {
            CircularAvatar.decode(file)
        } finally {
            file.delete()
        }
    }

    private suspend fun download(url: String, mimeType: String, request: EnrichmentRequest, budget: Long): Bitmap? {
        val file = fetcher.fetch(
            url = url,
            mimeType = mimeType,
            declaredSize = request.push.payload.attachmentFileSize,
            data = request.push.data,
            budgetMillis = budget,
        ) ?: return null
        return try {
            BitmapFactory.decodeFile(file.absolutePath)
        } finally {
            file.delete()
        }
    }

    private companion object {
        const val AVATAR_MIME = "image/jpeg"
    }
}
