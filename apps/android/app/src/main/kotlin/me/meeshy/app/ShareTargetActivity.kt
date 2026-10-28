package me.meeshy.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.core.content.IntentCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.app.chat.ShareTargetScreen
import me.meeshy.app.composer.inbound.ComposerSeedLaunch
import me.meeshy.app.composer.inbound.InboundShareIntake
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.theme.MeeshyTheme
import javax.inject.Inject

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

    @Inject
    lateinit var config: MeeshyConfig

    @Inject
    lateinit var inboundIntake: InboundShareIntake

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val sharedText = intent?.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
        // Le flux d'une autre app est du contenu NON FIABLE (#13527) : seule une URI `content://` d'une autre app est lue,
        // jamais un `file://` (lu avec NOS droits) ni un de nos propres fournisseurs — pour l'envoi comme pour le studio.
        val sharedAttachmentUri: Uri? = intent?.let {
            runCatching { IntentCompat.getParcelableExtra(it, Intent.EXTRA_STREAM, Uri::class.java) }.getOrNull()
        }?.takeIf { inboundIntake.admitsSource(it, grantedBySender = grantsRead(intent)) }
        val sharedAttachmentMimeType = intent?.type
        setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalMediaBaseUrl provides config.apiBaseUrl) {
                    ShareTargetScreen(
                        sharedText = sharedText,
                        onFinished = ::finish,
                        sharedAttachmentUri = sharedAttachmentUri,
                        sharedAttachmentMimeType = sharedAttachmentMimeType,
                        onEditInStudio = { openInStudio(sharedAttachmentUri, sharedAttachmentMimeType) },
                    )
                }
            }
        }
    }

    /**
     * « Modifier dans le studio » : la pièce est copiée dans le cache privé (jugée sur ses octets), puis l'hôte du
     * composeur s'ouvre dessus. Un geste explicite de l'auteur ; rien n'est publié ici, et une pièce refusée ferme le partage.
     */
    private fun openInStudio(uri: Uri?, mimeType: String?) {
        if (uri == null || openingStudio) return
        openingStudio = true
        lifecycleScope.launch {
            val token = inboundIntake.stash(listOf(uri), mimeType, grantedBySender = grantsRead(intent))
            if (token != null) startActivity(ComposerSeedLaunch.intent(this@ShareTargetActivity, token))
            finish()
        }
    }

    /** Un second toucher pendant la copie ne lance pas une seconde copie. */
    private var openingStudio = false

    /** L'expéditeur a-t-il accordé la lecture de l'URI ? Sans cela, Meeshy la lirait avec ses propres permissions. */
    private fun grantsRead(intent: Intent?): Boolean = intent != null && (intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0
}
