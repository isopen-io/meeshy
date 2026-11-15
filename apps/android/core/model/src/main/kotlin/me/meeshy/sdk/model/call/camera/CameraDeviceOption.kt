package me.meeshy.sdk.model.call.camera

/** La face d'une caméra qu'on CHOISIT (miroir de iOS `CameraFacing`) : une caméra branchée n'est ni l'avant ni l'arrière. */
enum class CameraFacing { Front, Back, External }

/**
 * Une caméra du choix « Choisir la caméra » (miroir de iOS `CameraDeviceOption`). [externalNumber] distingue
 * plusieurs caméras branchées (« Caméra externe 2 ») ; une seule n'en porte pas.
 */
data class CameraDeviceOption(val id: String, val facing: CameraFacing, val externalNumber: Int? = null)

/**
 * Le choix de caméra, qui remplace la simple bascule avant / arrière quand une caméra est BRANCHÉE (tablette,
 * Chromebook — iOS : Mac, iPad avec caméra Continuity ou USB). Il propose l'avant, l'arrière principal (ses
 * autres objectifs passent par le zoom, jamais par ce choix), puis chaque caméra branchée dans l'ordre du système.
 */
object CameraPickerLaw {
    fun options(probes: List<CameraLensProbe>): List<CameraDeviceOption> {
        val front = mainId(probes, isFront = true)?.let { CameraDeviceOption(it, CameraFacing.Front) }
        val back = mainId(probes, isFront = false)?.let { CameraDeviceOption(it, CameraFacing.Back) }
        val externals = probes.filter { it.isExternal }.map { it.id }.distinct()
        val numbered = externals.mapIndexed { index, id ->
            CameraDeviceOption(id, CameraFacing.External, externalNumber = if (externals.size > 1) index + 1 else null)
        }
        return listOfNotNull(front, back) + numbered
    }

    /** iOS : plus d'une caméra ET au moins une branchée. Sans caméra branchée, la bascule avant / arrière suffit. */
    fun hasSelectableCameras(options: List<CameraDeviceOption>): Boolean =
        options.size > 1 && options.any { it.facing == CameraFacing.External }

    /** La caméra cochée : celle qui est ouverte ; un objectif arrière ouvert par le zoom coche « Caméra arrière ». */
    fun selectedId(options: List<CameraDeviceOption>, probes: List<CameraLensProbe>, openId: String?): String? {
        openId ?: return null
        options.firstOrNull { it.id == openId }?.let { return it.id }
        val probe = probes.firstOrNull { it.id == openId } ?: return null
        val facing = when {
            probe.isExternal -> CameraFacing.External
            probe.isFront -> CameraFacing.Front
            else -> CameraFacing.Back
        }
        return options.firstOrNull { it.facing == facing }?.id
    }

    private fun mainId(probes: List<CameraLensProbe>, isFront: Boolean): String? =
        CameraLensClassifier.profile(probes, isFront)?.lenses?.firstOrNull { it.ratio == 1f }?.id
            ?: probes.firstOrNull { !it.isExternal && it.isFront == isFront }?.id
}
