package me.meeshy.ui.component.game

import me.meeshy.ui.accessibility.LocalReduceMotion
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.platform.LocalContext
import me.meeshy.sdk.model.game.GameEffectsLaw
import me.meeshy.sdk.model.game.GamePrismTilt

/**
 * L'inclinaison du téléphone : le roulis en tours, borné à ±0,5, ~30 Hz ; 0 au repos. Les mesures ne
 * tournent QUE tant que la vue est à l'écran et en mouvement : le capteur s'arrête avec elle.
 */
public class GameTiltSource(context: Context) : SensorEventListener {

    private val manager = context.applicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val sensor: Sensor? = manager?.let {
        it.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR) ?: it.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    }
    private val rotation = FloatArray(9)
    private val orientation = FloatArray(3)
    private var running = false

    /** En tours, borné à ±0,5 ; 0 au repos. */
    public var onTilt: (Double) -> Unit = {}

    public fun start() {
        val sm = manager ?: return
        val s = sensor ?: return
        if (running) return
        running = sm.registerListener(this, s, GamePrismTilt.SENSOR_INTERVAL_MICROS)
    }

    public fun stop() {
        if (!running) return
        manager?.unregisterListener(this)
        running = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        SensorManager.getRotationMatrixFromVector(rotation, event.values)
        SensorManager.getOrientation(rotation, orientation)
        onTilt(GamePrismTilt.turns(fromRoll = orientation[2].toDouble()))
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}

/**
 * Pose l'irisation du prisme sur une vue et la fait suivre le téléphone — sans capteur (émulateur) elle reste
 * au repos, jamais cassée. Inactive, elle ne peint RIEN. Figée sous mouvement réduit.
 */
public fun Modifier.gamePrismTilt(active: Boolean = true): Modifier = composed {
    val context = LocalContext.current
    val reduceMotion = LocalReduceMotion.current
    var visible by remember { mutableStateOf(true) }
    var tilt by remember { mutableDoubleStateOf(0.0) }
    val runs = GamePrismTilt.sensorRuns(active = active, visible = visible, reduceMotion = reduceMotion)

    DisposableEffect(runs, context) {
        val source = GameTiltSource(context)
        source.onTilt = { tilt = it }
        if (runs) source.start()
        onDispose { source.stop() }
    }

    this
        .gameOnScreen { visible = it }
        .gamePrismIridescence(tilt = if (active) GameEffectsLaw.effectiveTilt(tilt, reduceMotion) else 0.0, intensity = GamePrismTilt.intensity(active))
}

