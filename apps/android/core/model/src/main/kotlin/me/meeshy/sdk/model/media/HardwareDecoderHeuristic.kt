package me.meeshy.sdk.model.media

/**
 * Un décodeur vidéo compte pour le tier média seulement s'il est MATÉRIEL : le
 * décodeur logiciel HEVC ou AV1 existe sur tout Android et ne dit rien de la
 * puissance de l'appareil.
 *
 * Depuis Android 10 le système tranche (`MediaCodecInfo.isHardwareAccelerated` /
 * `isSoftwareOnly`) et le nom est ignoré. Avant, il ne reste que le nom : les
 * décodeurs de référence d'AOSP et les décodeurs logiciels des constructeurs sont
 * reconnus, tout le reste est tenu pour matériel.
 */
public object HardwareDecoderHeuristic {

    private val softwarePrefixes = listOf(
        "omx.google.",
        "c2.android.",
        "c2.google.",
        "omx.ffmpeg.",
        "c2.ffmpeg.",
    )

    private const val SOFTWARE_MARKER = ".sw."

    public fun isHardware(name: String, hardwareAccelerated: Boolean?, softwareOnly: Boolean?): Boolean {
        if (softwareOnly == true) return false
        if (hardwareAccelerated != null) return hardwareAccelerated
        val normalized = name.lowercase()
        return softwarePrefixes.none(normalized::startsWith) && !normalized.contains(SOFTWARE_MARKER)
    }
}
