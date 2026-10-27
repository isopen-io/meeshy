package me.meeshy.sdk.call.camera

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import kotlin.math.hypot
import me.meeshy.sdk.model.call.camera.CameraLensProbe

/**
 * Lit au système ce que chaque caméra OUVRABLE de l'appareil est : sa face, sa focale ramenée au
 * plein format (focale × 43,27 mm ÷ diagonale du capteur) et le zoom numérique que son capteur
 * porte. Une caméra dont les caractéristiques se refusent est ignorée : elle ne devient jamais une
 * pastille.
 */
internal object CameraLensDiscovery {
    private const val FULL_FRAME_DIAGONAL_MM = 43.27f

    fun probes(context: Context, ids: List<String>): List<CameraLensProbe> {
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager ?: return emptyList()
        return ids.mapNotNull { id -> runCatching { probe(manager.getCameraCharacteristics(id), id) }.getOrNull() }
    }

    private fun probe(c: CameraCharacteristics, id: String): CameraLensProbe? {
        val facing = c.get(CameraCharacteristics.LENS_FACING) ?: return null
        val focal = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull() ?: return null
        val size = c.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE) ?: return null
        val diagonal = hypot(size.width, size.height)
        if (diagonal <= 0f) return null
        return CameraLensProbe(
            id = id,
            isFront = facing == CameraCharacteristics.LENS_FACING_FRONT,
            equivalentFocalMm = focal * FULL_FRAME_DIAGONAL_MM / diagonal,
            maxDigitalZoom = c.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 1f,
        )
    }
}
