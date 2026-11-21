package me.meeshy.app.phonecall

import android.content.Context
import android.media.AudioManager
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import me.meeshy.sdk.model.phonecall.MeeshyCallRinging
import me.meeshy.sdk.model.phonecall.PhoneCallReportPolicy
import me.meeshy.sdk.phonecall.DeviceCallReader
import me.meeshy.sdk.phonecall.PhoneCallReporting
import timber.log.Timber

/**
 * MON téléphone est-il en appel (#18753) ? Le mode d'`AudioManager`, SANS AUCUNE permission : `MODE_IN_CALL` (appel
 * téléphonique) ou `MODE_IN_COMMUNICATION` (VoIP, Meeshy compris). Jamais `READ_PHONE_STATE`, jamais de numéro.
 */
class AndroidDeviceCall @Inject constructor(
    @ApplicationContext private val context: Context,
) : DeviceCallReader {
    override fun isInCall(): Boolean? {
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return null
        return PhoneCallReportPolicy.isInCall(audio.mode, meeshyCallRinging = MeeshyCallRinging.isRinging)
    }
}

/**
 * Le moteur des rapports « en appel » (#18753), tant que l'app a du temps d'exécution : sur API 31+, chaque changement
 * du mode audio (`addOnModeChangedListener`) ; sur toutes les versions, le passage au premier plan et à l'arrière-plan
 * (l'app suspendue n'a pas vu la fin d'un appel). Le rapporteur ne laisse partir que les CHANGEMENTS.
 */
@Singleton
class PhoneCallMonitor @Inject constructor(
    @ApplicationContext private val context: Context,
    private val reporter: PhoneCallReporting,
    @DefaultDispatcher dispatcher: CoroutineDispatcher,
) : AppLifecycleHook {

    override val name: String get() = "phone-call-monitor"

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    override suspend fun onAppCreate() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) listenToModeChanges()
    }

    override suspend fun onForeground() {
        report()
    }

    override suspend fun onBackground() {
        report()
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun listenToModeChanges() {
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audio.addOnModeChangedListener(ContextCompat.getMainExecutor(context)) { report() }
    }

    private fun report() {
        scope.launch {
            runCatching { reporter.report() }.onFailure { Timber.w(it, "Phone call report failed") }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneCallMonitorModule {
    @Binds
    @IntoSet
    fun hook(impl: PhoneCallMonitor): AppLifecycleHook

    @Binds
    fun bindReader(reader: AndroidDeviceCall): DeviceCallReader
}
