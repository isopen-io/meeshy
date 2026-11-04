package me.meeshy.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.app.chat.IncomingShareSheetHost
import me.meeshy.app.share.ShareIntakeReader
import me.meeshy.app.share.ShareIntakeUiState
import me.meeshy.app.share.ShareIntakeViewModel
import me.meeshy.app.share.ShareSignInSheet
import me.meeshy.app.share.canEditInStudio
import me.meeshy.app.share.shortfallMessages
import me.meeshy.app.share.tooLargeMessages
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

    private val intake: ShareIntakeViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Le flux d'une autre app est du contenu NON FIABLE (#13527) : seule une URI `content://` d'une autre app est lue,
        // jamais un `file://` ni un de nos propres fournisseurs. Avec une session, chaque flux admis est copié EN FLUX (64 Kio)
        // dans le cache, sous plafonds (50 Mo par pièce, 512 Mio pour toutes les copies vivantes) ; ce qui est écarté est dit,
        // et les copies ne survivent pas au partage (#15729).
        intake.prepare(intent)
        setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalMediaBaseUrl provides config.apiBaseUrl) {
                    val state by intake.state.collectAsStateWithLifecycle()
                    ShareIntakeContent(state)
                }
            }
        }
    }

    @Composable
    private fun ShareIntakeContent(state: ShareIntakeUiState) {
        when (state) {
            ShareIntakeUiState.Preparing -> Unit
            ShareIntakeUiState.Empty -> LaunchedEffect(Unit) { finish() }
            is ShareIntakeUiState.Ready -> ShareIntakeReady(state)
        }
    }

    @Composable
    private fun ShareIntakeReady(ready: ShareIntakeUiState.Ready) {
        if (!ready.signedIn) {
            ShareSignInSheet(onOpenApp = ::openApp, onDismiss = ::closeShare)
            return
        }
        val notices = shortfallMessages(this, ready.shortfalls) + tooLargeMessages(this, ready.tooLarge)
        if (ready.items.isEmpty() && ready.text.isNullOrBlank()) {
            LaunchedEffect(Unit) {
                notices.forEach { Toast.makeText(this@ShareTargetActivity, it, Toast.LENGTH_LONG).show() }
                closeShare()
            }
            return
        }
        IncomingShareSheetHost(
            text = ready.text,
            items = ready.items,
            notices = notices,
            onDismiss = ::closeShare,
            onOpenConversation = ::openConversation,
            onEditInStudio = { openInStudio(ShareIntakeReader(inboundIntake::admitsSource).read(intent).admitted, intent?.type) }.takeIf { canEditInStudio(ready.items) },
            onSendAttempted = intake::onSendAttempted,
        )
    }

    /** La feuille se ferme ; les copies partent avec le partage ([ShareIntakeViewModel.onCleared]) ou après l'envoi. */
    private fun closeShare() {
        finish()
    }

    /** Sans session, « Ouvrir Meeshy » mène à la connexion ; rien n'a été copié, l'utilisateur partagera à nouveau. */
    private fun openApp() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
        finish()
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
