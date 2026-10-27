package me.meeshy.app.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.sdk.model.playback.VoicePlaybackCardRules
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState

/** En lecture ou en attente du réseau : la carte reste au premier plan. */
private val VoicePlaybackTransportState.isActive: Boolean get() = isPlaying || isBuffering

/** Ce que la session demande au service qui l'héberge : le premier plan, jamais sa propre vie. */
internal interface VoicePlaybackForeground {
    fun enter(notificationId: Int, notification: Notification)

    /** En pause : la notification quitte le premier plan, donc se balaie. */
    fun park()

    fun leave()
}

/**
 * La session média et la notification de lecture d'un vocal — port de `PlaybackForegroundService`
 * et `PlaybackRules` de la coque `apps/web/android` (#9257, #9367, #10624) : une `MediaSession`
 * active (boutons de casque, carte de l'écran verrouillé), une notification `MediaStyle` avec ±15 s
 * et lecture/pause, la position extrapolée depuis l'ancrage publié, la pause qui GARE la carte au
 * lieu de la retirer.
 */
internal class VoicePlaybackSessionController(
    private val context: Context,
    private val bridge: VoicePlaybackSessionBridge,
    private val foreground: VoicePlaybackForeground,
    private val scope: CoroutineScope,
    private val loadArtwork: suspend (String) -> Bitmap?,
) {
    private val session = MediaSession(context, TAG)
    private val artwork = HashMap<String, Bitmap>()
    private var observing: Job? = null
    private var artworkJob: Job? = null

    /** La session reçoit les boutons de casque et alimente la carte de l'écran verrouillé tant qu'elle est active. */
    val isSessionActive: Boolean get() = session.isActive

    fun start() {
        session.setCallback(
            object : MediaSession.Callback() {
                override fun onPlay() = bridge.dispatch(VoicePlaybackCommand.Play)

                override fun onPause() = bridge.dispatch(VoicePlaybackCommand.Pause)

                override fun onStop() = bridge.dispatch(VoicePlaybackCommand.Stop)

                override fun onSeekTo(pos: Long) = bridge.dispatch(VoicePlaybackCommand.SeekTo(pos))

                override fun onCustomAction(action: String, extras: android.os.Bundle?) {
                    command(action)?.let(bridge::dispatch)
                }
            },
        )
        session.isActive = true
        observing = scope.launch { bridge.snapshot.collect(::render) }
    }

    /** Un bouton de la notification (intent de service) : la même voie que la carte du système. */
    fun onAction(action: String?) {
        command(action)?.let(bridge::dispatch)
    }

    fun stop() {
        observing?.cancel()
        artworkJob?.cancel()
        session.isActive = false
        session.release()
        context.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
    }

    private fun command(action: String?): VoicePlaybackCommand? = when (action) {
        ACTION_PLAY -> VoicePlaybackCommand.Play
        ACTION_PAUSE -> VoicePlaybackCommand.Pause
        ACTION_STOP -> VoicePlaybackCommand.Stop
        ACTION_BACK -> VoicePlaybackCommand.Skip(-VoicePlaybackCardRules.SKIP_MS)
        ACTION_FORWARD -> VoicePlaybackCommand.Skip(VoicePlaybackCardRules.SKIP_MS)
        else -> null
    }

    private fun render(snapshot: VoicePlaybackSnapshot?) {
        if (snapshot == null) {
            foreground.leave()
            return
        }
        val url = snapshot.card.artworkUrl
        val cached = url?.let(artwork::get)
        session.setMetadata(metadata(snapshot, cached))
        session.setPlaybackState(playbackState(snapshot))
        val notification = notification(snapshot, cached)
        if (snapshot.transport.isActive) {
            foreground.enter(NOTIFICATION_ID, notification)
        } else {
            context.getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification)
            foreground.park()
        }
        if (url != null && cached == null) fetchArtwork(url, snapshot.card.attachmentId)
    }

    private fun fetchArtwork(url: String, attachmentId: String) {
        artworkJob?.cancel()
        artworkJob = scope.launch {
            val bitmap = loadArtwork(url) ?: return@launch
            artwork[url] = bitmap
            val latest = bridge.snapshot.value ?: return@launch
            if (latest.card.attachmentId == attachmentId) render(latest)
        }
    }

    private fun labels(snapshot: VoicePlaybackSnapshot) = VoicePlaybackCardRules.labels(
        card = snapshot.card,
        voiceMessage = context.getString(R.string.voice_playback_voice_message),
        protectedMessage = context.getString(R.string.voice_playback_protected),
    )

    private fun metadata(snapshot: VoicePlaybackSnapshot, art: Bitmap?): MediaMetadata {
        val labels = labels(snapshot)
        val builder = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, labels.title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, labels.artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, labels.album)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, snapshot.card.durationMs)
        if (art != null) builder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art)
        return builder.build()
    }

    private fun playbackState(snapshot: VoicePlaybackSnapshot): PlaybackState {
        val transport = snapshot.transport
        val seekable = snapshot.card.durationMs > 0
        var actions = PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP or
            if (transport.isActive) PlaybackState.ACTION_PAUSE else PlaybackState.ACTION_PLAY
        if (seekable) actions = actions or PlaybackState.ACTION_SEEK_TO
        val state = when {
            transport.isBuffering -> PlaybackState.STATE_BUFFERING
            transport.isPlaying -> PlaybackState.STATE_PLAYING
            else -> PlaybackState.STATE_PAUSED
        }
        val position = VoicePlaybackCardRules.projected(
            state = transport,
            anchorMillis = snapshot.anchorMillis,
            nowMillis = SystemClock.elapsedRealtime(),
            durationMs = snapshot.card.durationMs,
        )
        val builder = PlaybackState.Builder()
            .setActions(actions)
            .setState(state, position, if (transport.isPlaying && !transport.isBuffering) 1f else 0f, SystemClock.elapsedRealtime())
        if (seekable) {
            builder.addCustomAction(
                PlaybackState.CustomAction.Builder(ACTION_BACK, context.getString(R.string.voice_playback_back), android.R.drawable.ic_media_rew).build(),
            )
            builder.addCustomAction(
                PlaybackState.CustomAction.Builder(ACTION_FORWARD, context.getString(R.string.voice_playback_forward), android.R.drawable.ic_media_ff).build(),
            )
        }
        return builder.build()
    }

    private fun notification(snapshot: VoicePlaybackSnapshot, art: Bitmap?): Notification {
        ensureChannel()
        val playing = snapshot.transport.isActive
        val seekable = snapshot.card.durationMs > 0
        val labels = labels(snapshot)
        val open = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(labels.title)
            .setContentText(labels.artist ?: context.getString(R.string.voice_playback_return))
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setOngoing(playing)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .setDeleteIntent(servicePending(ACTION_STOP, REQUEST_STOP))
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(*(if (seekable) intArrayOf(0, 1, 2) else intArrayOf(0))),
            )
        if (art != null) builder.setLargeIcon(art)
        if (seekable) builder.addAction(action(ACTION_BACK, android.R.drawable.ic_media_rew, R.string.voice_playback_back, REQUEST_BACK))
        builder.addAction(
            if (playing) {
                action(ACTION_PAUSE, android.R.drawable.ic_media_pause, R.string.voice_playback_pause, REQUEST_PAUSE)
            } else {
                action(ACTION_PLAY, android.R.drawable.ic_media_play, R.string.voice_playback_play, REQUEST_PLAY)
            },
        )
        if (seekable) builder.addAction(action(ACTION_FORWARD, android.R.drawable.ic_media_ff, R.string.voice_playback_forward, REQUEST_FORWARD))
        return builder.build()
    }

    private fun action(action: String, icon: Int, label: Int, request: Int): Notification.Action =
        Notification.Action.Builder(Icon.createWithResource(context, icon), context.getString(label), servicePending(action, request)).build()

    private fun servicePending(action: String, request: Int): PendingIntent = PendingIntent.getService(
        context,
        request,
        Intent(context, VoicePlaybackService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun ensureChannel() {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.voice_playback_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
    }

    internal companion object {
        const val NOTIFICATION_ID = 0x4d56
        const val CHANNEL_ID = "meeshy_voice_playback"
        const val TAG = "MeeshyVoicePlayback"
        const val ACTION_PLAY = "me.meeshy.app.voice.PLAY"
        const val ACTION_PAUSE = "me.meeshy.app.voice.PAUSE"
        const val ACTION_STOP = "me.meeshy.app.voice.STOP"
        const val ACTION_BACK = "me.meeshy.app.voice.BACK15"
        const val ACTION_FORWARD = "me.meeshy.app.voice.FORWARD15"
        private const val REQUEST_PLAY = NOTIFICATION_ID + 1
        private const val REQUEST_PAUSE = NOTIFICATION_ID + 2
        private const val REQUEST_STOP = NOTIFICATION_ID + 3
        private const val REQUEST_BACK = NOTIFICATION_ID + 4
        private const val REQUEST_FORWARD = NOTIFICATION_ID + 5
    }
}
