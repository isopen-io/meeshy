package me.meeshy.app.bring

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.sdk.model.relation.BringRingTexts
import me.meeshy.ui.theme.MeeshyTheme
import javax.inject.Inject

/**
 * L'écran plein du Bring (#13936), iso `BringRingView.swift` : 🔔, « X vous fait sonner », l'explication, et UN bouton
 * « Arrêter » de 56 dp. S'ouvre par-dessus l'écran verrouillé (intent plein écran de la notification) et se ferme
 * de lui-même dès que le Bring ne sonne plus — arrêté ici, sur un autre appareil, par l'expéditeur, ou expiré.
 */
@AndroidEntryPoint
class BringRingActivity : ComponentActivity() {

    @Inject
    lateinit var state: BringRingState

    @Inject
    lateinit var stopper: BringStopper

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        setContent {
            MeeshyTheme {
                val ringing by state.current.collectAsStateWithLifecycle()
                val push = ringing
                if (push == null) {
                    LaunchedEffect(Unit) { finish() }
                } else {
                    BringRingScreen(
                        texts = BringRingNotification.texts(this, push),
                        onStop = { stopper.stopByUser(push.bringId) },
                    )
                }
            }
        }
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
    }
}

@Composable
internal fun BringRingScreen(texts: BringRingTexts, onStop: () -> Unit) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = 24.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = "🔔", style = MaterialTheme.typography.displayMedium)
            Text(
                text = texts.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = texts.body,
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                onClick = onStop,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(top = 16.dp),
            ) {
                Text(text = texts.stopLabel, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}
