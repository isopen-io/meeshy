package me.meeshy.ui.component.media

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import me.meeshy.sdk.model.ComposerMode
import me.meeshy.sdk.model.media.MediaKindLabel.Kind
import me.meeshy.sdk.model.media.MediaKindStrings
import me.meeshy.sdk.model.media.spokenMediaDuration
import me.meeshy.ui.R

/** Table de ressources de [MediaKindStrings] : la langue vit dans `strings_media_kinds.xml`. */
public class ResourceMediaKindStrings(private val context: Context) : MediaKindStrings {
    override fun name(kind: Kind): String = context.getString(
        when (kind) {
            Kind.PHOTO -> R.string.media_label_photo
            Kind.VIDEO -> R.string.media_label_video
            Kind.AUDIO -> R.string.media_label_audio
            Kind.FILE -> R.string.media_label_file
            Kind.LOCATION -> R.string.media_label_location
        },
    )

    override fun summary(kind: Kind): String = context.getString(
        when (kind) {
            Kind.PHOTO -> R.string.media_summary_photo
            Kind.VIDEO -> R.string.media_summary_video
            Kind.AUDIO -> R.string.media_summary_voice
            Kind.FILE -> R.string.media_summary_file
            Kind.LOCATION -> R.string.media_summary_location
        },
    )

    override val voiceMessage: String get() = context.getString(R.string.media_voice_message)

    override fun voiceRecording(formattedDuration: String): String =
        context.getString(R.string.media_voice_recording, formattedDuration)

    /** Durée annoncée par TalkBack (« 12 secondes »). */
    public fun spokenDuration(seconds: Double?): String? = spokenMediaDuration(
        seconds,
        minutesLabel = { context.resources.getQuantityString(R.plurals.media_duration_minutes, it, it) },
        secondsLabel = { context.resources.getQuantityString(R.plurals.media_duration_seconds, it, it) },
    )
}

@Composable
public fun rememberMediaKindStrings(): ResourceMediaKindStrings {
    val context = LocalContext.current
    return remember(context) { ResourceMediaKindStrings(context) }
}

/** Placeholder d'un mode de composeur, depuis une ressource. */
@StringRes
public fun ComposerMode.placeholderRes(): Int = when (this) {
    ComposerMode.MESSAGE -> R.string.media_composer_placeholder_message
    ComposerMode.POST -> R.string.media_composer_placeholder_post
    ComposerMode.STATUS -> R.string.media_composer_placeholder_status
    ComposerMode.STORY -> R.string.media_composer_placeholder_story
    ComposerMode.COMMENT -> R.string.media_composer_placeholder_comment
    ComposerMode.CAPTION -> R.string.media_composer_placeholder_caption
}

