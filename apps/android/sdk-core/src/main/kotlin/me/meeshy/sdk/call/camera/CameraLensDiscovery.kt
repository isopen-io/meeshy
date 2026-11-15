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
 * pastille. Une caméra sans focale lisible (souvent une caméra branchée) garde une focale nulle : on peut la
 * CHOISIR, elle ne devient pas un objectif.
 */
internal object CameraLensDiscovery {
    private const val FULL_FRAME_DIAGONAL_MM = 43.27f

    fun probes(context: Context, ids: List<String>): List<CameraLensProbe> {
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager ?: return emptyList()
        return ids.mapNotNull { id -> runCatching { probe(manager.getCameraCharacteristics(id), id) }.getOrNull() }
    }

    private fun probe(c: CameraCharacteristics, id: String): CameraLensProbe? {
        val facing = c.get(CameraCharacteristics.LENS_FACING) ?: return null
        val focal = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull()
        val size = c.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
        val diagonal = size?.let { hypot(it.width, it.height) } ?: 0f
        return CameraLensProbe(
            id = id,
            isFront = facing == CameraCharacteristics.LENS_FACING_FRONT,
            equivalentFocalMm = if (focal != null && diagonal > 0f) focal * FULL_FRAME_DIAGONAL_MM / diagonal else 0f,
            maxDigitalZoom = c.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 1f,
            isExternal = facing == CameraCharacteristics.LENS_FACING_EXTERNAL,
        )
    }
}
