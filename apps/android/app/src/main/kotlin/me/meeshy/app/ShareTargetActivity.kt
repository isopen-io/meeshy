package me.meeshy.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.app.chat.ShareTargetScreen
import me.meeshy.ui.theme.MeeshyTheme

/**
 * `ACTION_SEND` receiver — Android's share-sheet counterpart to iOS's
 * `MeeshyShareExtension` (feature-parity §O). Lot 1 scope, matching iOS's own phased rollout:
 * `text/plain` only (covers both plain text and a shared URL, which arrives as
 * [Intent.EXTRA_TEXT] either way) — images/video are a later lot, their activation rule the
 * same one iOS names for its own extension.
 *
 * Unlike iOS's extension, this runs in the SAME process as the rest of Meeshy — no separate
 * App Group session read, no dedicated offline relay: [me.meeshy.app.chat.ShareTargetViewModel]
 * reuses the app's own session and the existing outbox for durability on a failed send.
 */
@AndroidEntryPoint
class ShareTargetActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val sharedText = intent?.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
        setContent {
            MeeshyTheme {
                ShareTargetScreen(sharedText = sharedText, onFinished = ::finish)
            }
        }
    }
}
