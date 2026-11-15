package me.meeshy.ui.component.fullscreen

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.media.MediaRouter2
import android.os.Build
import android.provider.Settings
import androidx.annotation.RequiresApi
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.fullscreen.AudioOutputRoute
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.R

/** Ouvre la route de sortie audio choisie. Rend vrai si une fenêtre du système s'est ouverte. */
public fun interface AudioOutputLauncher {
    public fun open(context: Context, route: AudioOutputRoute): Boolean
}

/**
 * Le lanceur du système : le sélecteur de sortie multimédia dès l'API 34, les réglages Bluetooth
 * avant (et quand le sélecteur refuse de s'ouvrir). Aucune dépendance : que des API de la
 * plateforme, et jamais d'exception vers l'appelant.
 */
public object SystemAudioOutputLauncher : AudioOutputLauncher {

    override fun open(context: Context, route: AudioOutputRoute): Boolean = when (route) {
        AudioOutputRoute.SystemOutputSwitcher -> showOutputSwitcher(context) || openBluetoothSettings(context)
        AudioOutputRoute.BluetoothSettings -> openBluetoothSettings(context)
    }

    private fun showOutputSwitcher(context: Context): Boolean =
        Build.VERSION.SDK_INT >= AudioOutputRoute.SYSTEM_SWITCHER_MIN_SDK && showSystemSwitcherApi34(context)

    @RequiresApi(AudioOutputRoute.SYSTEM_SWITCHER_MIN_SDK)
    private fun showSystemSwitcherApi34(context: Context): Boolean =
        try {
            MediaRouter2.getInstance(context).showSystemOutputSwitcher()
        } catch (_: RuntimeException) {
            false
        }

    private fun openBluetoothSettings(context: Context): Boolean {
        val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
        if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
    }
}

/**
 * **« Sortie audio » — la place d'AirPlay sur Android** (`AirPlayRoutePicker`, iOS). Un bouton du
 * chrome qui ouvre le sélecteur de sortie du système : l'enceinte Bluetooth, le casque, la
 * télévision. La route dépend de la version du système ([AudioOutputRoute.forSdk]).
 *
 * **Sous le bouclier de capture ([isCaptureShielded]) le bouton n'existe pas** : diffuser un média
 * protégé (vue unique, flou, éphémère) vers un autre appareil le sortirait de l'écran que le
 * bouclier garde. Sa place reste réservée — le chrome ne se réorganise pas quand un média
 * protégé arrive.
 *
 * [sdkInt] et [launcher] sont des coutures : l'écran passe les valeurs par défaut.
 */
@Composable
public fun AudioOutputPicker(
    modifier: Modifier = Modifier,
    tone: FullscreenChromeTone = FullscreenChromeTone.OnMedia,
    isCaptureShielded: Boolean = false,
    sdkInt: Int = Build.VERSION.SDK_INT,
    launcher: AudioOutputLauncher = SystemAudioOutputLauncher,
) {
    if (isCaptureShielded) {
        Spacer(modifier.size(FullscreenChromeDimens.tapTarget))
        return
    }
    val context = LocalContext.current
    val route = AudioOutputRoute.forSdk(sdkInt)
    FullscreenChromeButton(
        icon = FullscreenChromeSymbol.AudioOutput.icon,
        label = stringResource(R.string.fullscreen_audio_output),
        onClick = { launcher.open(context, route) },
        modifier = modifier,
        tone = tone,
    )
}
