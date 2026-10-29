package me.meeshy.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.app.chat.IncomingShareScreen
import me.meeshy.app.chat.IncomingShareSelection
import me.meeshy.app.push.MeeshyFcmService
import me.meeshy.app.composer.inbound.ComposerSeedLaunch
import me.meeshy.app.composer.inbound.InboundShareIntake
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.theme.MeeshyTheme
import javax.inject.Inject

/**
 * `ACTION_SEND` / `ACTION_SEND_MULTIPLE` receiver — Android's share-sheet counterpart to iOS's
 * `MeeshyShareExtension` (feature-parity §O). `text/plain` (a shared URL arrives as
 * [Intent.EXTRA_TEXT] too — lot 1) plus images/video (lot 2, MIME `image/` and `video/`
 * wildcards, bytes read from [Intent.EXTRA_STREAM]).
 *
 * Unlike iOS's extension, this runs in the SAME process as the rest of Meeshy — no separate
 * App Group session read, no dedicated offline relay: la feuille de partage unique
 * ([me.meeshy.app.chat.IncomingShareScreen], #13476) reuses the app's own session and the existing outbox for durability on a failed send, and a
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
        val sharedText = intent?.getStringExtra(Intent.EXTRA_TEXT)
        // Le flux d'une autre app est du contenu NON FIABLE (#13527) : seule une URI `content://` d'une autre app est lue,
        // jamais un `file://` (lu avec NOS droits) ni un de nos propres fournisseurs — pour l'envoi comme pour le studio.
        // Le filtre accepte tout type (#13585) : seuls les flux d'EXTRA_STREAM sont lus, au plus 100, et ce qui est écarté est dit.
        val selection = intent?.let { IncomingShareSelection.of(it, inboundIntake::admitsSource) } ?: IncomingShareSelection(emptyList(), 0, 0)
        val sharedUris: List<Uri> = selection.admitted
        val sharedMimeType = intent?.type
        setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalMediaBaseUrl provides config.apiBaseUrl) {
                    IncomingShareScreen(
                        sharedText = sharedText,
                        selection = selection,
                        sharedMimeType = sharedMimeType,
                        onFinished = ::finish,
                        onOpenConversation = ::openConversation,
                        onEditInStudio = { openInStudio(sharedUris, sharedMimeType) },
                    )
                }
            }
        }
    }

    /** « Envoyé à X · Ouvrir » : Meeshy s'ouvre sur la conversation servie, la feuille se ferme. */
    private fun openConversation(conversationId: String) {
        startActivity(
            Intent(this, MainActivity::class.java)
                .putExtra(MeeshyFcmService.EXTRA_CONVERSATION_ID, conversationId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        )
        finish()
    }

    /**
     * « Modifier dans le studio » : la pièce est copiée dans le cache privé (jugée sur ses octets), puis l'hôte du
     * composeur s'ouvre dessus. Un geste explicite de l'auteur ; rien n'est publié ici, et une pièce refusée ferme le partage.
     */
    private fun openInStudio(uris: List<Uri>, mimeType: String?) {
        if (uris.isEmpty() || openingStudio) return
        openingStudio = true
        lifecycleScope.launch {
            val token = inboundIntake.stash(uris, mimeType)
            if (token != null) startActivity(ComposerSeedLaunch.intent(this@ShareTargetActivity, token))
            finish()
        }
    }

    /** Un second toucher pendant la copie ne lance pas une seconde copie. */
    private var openingStudio = false
}
