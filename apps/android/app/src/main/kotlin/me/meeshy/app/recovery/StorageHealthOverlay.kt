package me.meeshy.app.recovery

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.maintenance.StorageStatus
import me.meeshy.sdk.maintenance.StorageStatusSource
import me.meeshy.ui.component.chrome.StorageUnavailableBanner

/** Le bandeau « Stockage indisponible » quand la base est éphémère ; son tap ouvre l'écran Mode dégradé. */
class StorageHealthOverlay @Inject constructor(
    private val source: StorageStatusSource,
) : AppOverlay {
    override val order: Int = 90

    @Composable
    override fun Content(navController: NavHostController) {
        val status by source.status.collectAsState(initial = source.initialStatus)
        var showScreen by rememberSaveable { mutableStateOf(false) }
        val context = LocalContext.current
        if (status == StorageStatus.EPHEMERAL) {
            Box(Modifier.fillMaxWidth().statusBarsPadding(), contentAlignment = Alignment.TopCenter) {
                StorageUnavailableBanner(onClick = { showScreen = true })
            }
        }
        if (showScreen && status != StorageStatus.NORMAL) {
            DatabaseRecoveryScreen(
                report = source.report(),
                onRetry = { relaunch(context) },
                onExport = { share(context, source.report()) },
                onDismiss = { showScreen = false },
            )
        }
    }

    private fun relaunch(context: Context) {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        context.startActivity(intent)
        Runtime.getRuntime().exit(0)
    }

    private fun share(context: Context, report: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, report)
        context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface StorageHealthOverlayModule {
    @Binds
    @IntoSet
    fun bind(overlay: StorageHealthOverlay): AppOverlay
}
