package me.meeshy.app.battery

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.PowerManager
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import me.meeshy.sdk.battery.DeviceBatteryReader
import me.meeshy.sdk.model.battery.BatteryReading

/**
 * MA batterie, lue sur `BatteryManager` (#14147) : le pourcentage et la charge viennent de l'intention collante
 * `ACTION_BATTERY_CHANGED`, le mode économie de `PowerManager.isPowerSaveMode`. Aucun nom d'appareil ne part : les Proches
 * lisent un niveau, pas un modèle de téléphone.
 */
class AndroidDeviceBattery @Inject constructor(
    @ApplicationContext private val context: Context,
) : DeviceBatteryReader {

    override val deviceLabel: String? = null

    override fun read(): BatteryReading? {
        val sticky = runCatching { context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) }.getOrNull()
        return sticky?.let(::readingOf)
    }

    internal fun readingOf(intent: Intent): BatteryReading? {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) return null
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val percent = (level * PERCENT / scale).coerceIn(0, PERCENT)
        return BatteryReading(percent, charging, lowPower = power?.isPowerSaveMode == true)
    }

    private companion object {
        const val PERCENT = 100
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface DeviceBatteryModule {
    @Binds
    fun bindReader(reader: AndroidDeviceBattery): DeviceBatteryReader
}
