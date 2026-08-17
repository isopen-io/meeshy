package me.meeshy.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.content.IntentCompat
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.app.chat.ShareTargetScreen
import me.meeshy.ui.theme.MeeshyTheme

/**
 * `ACTION_SEND` receiver — Android's share-sheet counterpart to iOS's
 * `MeeshyShareExtension` (feature-parity §O). `text/plain` (a shared URL arrives as
 * [Intent.EXTRA_TEXT] too — lot 1) plus images/video (lot 2, MIME `image/` and `video/`
 * wildcards, bytes read from [Intent.EXTRA_STREAM]).
 *
 * Unlike iOS's extension, this runs in the SAME process as the rest of Meeshy — no separate
 * App Group session read, no dedicated offline relay: [me.meeshy.app.chat.ShareTargetViewModel]
 * reuses the app's own session and the existing outbox for durability on a failed send, and a
 * shared image/video enqueues through the same [me.meeshy.sdk.media.MediaUploadQueue] the chat
 * composer's own attachment picker uses.
 */
@AndroidEntryPoint
class ShareTargetActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val sharedText = intent?.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
        val sharedAttachmentUri: Uri? = intent?.let {
            IntentCompat.getParcelableExtra(it, Intent.EXTRA_STREAM, Uri::class.java)
        }
        val sharedAttachmentMimeType = intent?.type
        setContent {
            MeeshyTheme {
                ShareTargetScreen(
                    sharedText = sharedText,
                    onFinished = ::finish,
                    sharedAttachmentUri = sharedAttachmentUri,
                    sharedAttachmentMimeType = sharedAttachmentMimeType,
                )
            }
        }
    }
}
