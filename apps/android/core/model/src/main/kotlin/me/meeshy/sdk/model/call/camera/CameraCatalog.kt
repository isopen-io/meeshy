package me.meeshy.sdk.model.call.camera

/** Une caméra telle que le système la décrit (miroir de iOS `CameraCatalog.Descriptor`). */
data class CameraDescriptor(val id: String, val name: String, val facing: CameraFacing)

/** Une caméra du choix, avec son libellé désambiguïsé. */
data class CameraCatalogEntry(val id: String, val displayName: String, val facing: CameraFacing)

/**
 * Le tri et le libellé de la liste des caméras (miroir de iOS `CameraCatalog`), sans rien de la plateforme :
 * avant, arrière, branchées, puis par nom ; deux caméras de même nom (deux modèles identiques) se distinguent
 * par « (2) ».
 */
object CameraCatalog {
    fun options(descriptors: List<CameraDescriptor>): List<CameraCatalogEntry> {
        val sorted = descriptors.distinctBy { it.id }
            .sortedWith(compareBy<CameraDescriptor>({ rank(it.facing) }, { it.name.lowercase() }, { it.id }))
        val seen = HashMap<String, Int>()
        return sorted.map { camera ->
            val count = (seen[camera.name] ?: 0) + 1
            seen[camera.name] = count
            CameraCatalogEntry(camera.id, if (count > 1) "${camera.name} ($count)" else camera.name, camera.facing)
        }
    }

    private fun rank(facing: CameraFacing): Int = when (facing) {
        CameraFacing.Front -> 0
        CameraFacing.Back -> 1
        CameraFacing.External -> 2
    }
}
