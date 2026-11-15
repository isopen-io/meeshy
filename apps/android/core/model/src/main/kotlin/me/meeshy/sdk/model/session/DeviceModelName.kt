package me.meeshy.sdk.model.session

/**
 * Le nom commercial d'un identifiant d'appareil Apple servi par une session (`iPhone15,2` →
 * « iPhone 14 Pro »), miroir de `DeviceModelName.readable(forIdentifier:)` du SDK iOS.
 *
 * Un identifiant inconnu se replie sur sa famille (`iPhone`, `iPad`…) ; une architecture hôte
 * (`arm64`) ou tout autre texte ne se nomme pas : `null`.
 */
public object ServedDeviceModelName {

    public fun readable(identifier: String): String? {
        if (identifier in hostArchitectures) return null
        table[identifier]?.let { return it }
        return families.firstOrNull { identifier.startsWith(it.first) }?.second
    }

    private val hostArchitectures: Set<String> = setOf("arm64", "x86_64", "i386")

    private val families: List<Pair<String, String>> = listOf(
        "iPhone" to "iPhone",
        "iPad" to "iPad",
        "iPod" to "iPod touch",
        "RealityDevice" to "Apple Vision Pro",
        "Mac" to "Mac",
    )

    private val table: Map<String, String> = mapOf(
        "iPhone10,1" to "iPhone 8",
        "iPhone10,4" to "iPhone 8",
        "iPhone10,2" to "iPhone 8 Plus",
        "iPhone10,5" to "iPhone 8 Plus",
        "iPhone10,3" to "iPhone X",
        "iPhone10,6" to "iPhone X",
        "iPhone11,2" to "iPhone XS",
        "iPhone11,4" to "iPhone XS Max",
        "iPhone11,6" to "iPhone XS Max",
        "iPhone11,8" to "iPhone XR",
        "iPhone12,1" to "iPhone 11",
        "iPhone12,3" to "iPhone 11 Pro",
        "iPhone12,5" to "iPhone 11 Pro Max",
        "iPhone12,8" to "iPhone SE (2nd generation)",
        "iPhone13,1" to "iPhone 12 mini",
        "iPhone13,2" to "iPhone 12",
        "iPhone13,3" to "iPhone 12 Pro",
        "iPhone13,4" to "iPhone 12 Pro Max",
        "iPhone14,4" to "iPhone 13 mini",
        "iPhone14,5" to "iPhone 13",
        "iPhone14,2" to "iPhone 13 Pro",
        "iPhone14,3" to "iPhone 13 Pro Max",
        "iPhone14,6" to "iPhone SE (3rd generation)",
        "iPhone14,7" to "iPhone 14",
        "iPhone14,8" to "iPhone 14 Plus",
        "iPhone15,2" to "iPhone 14 Pro",
        "iPhone15,3" to "iPhone 14 Pro Max",
        "iPhone15,4" to "iPhone 15",
        "iPhone15,5" to "iPhone 15 Plus",
        "iPhone16,1" to "iPhone 15 Pro",
        "iPhone16,2" to "iPhone 15 Pro Max",
        "iPhone17,3" to "iPhone 16",
        "iPhone17,4" to "iPhone 16 Plus",
        "iPhone17,1" to "iPhone 16 Pro",
        "iPhone17,2" to "iPhone 16 Pro Max",
        "iPhone17,5" to "iPhone 16e",
        "iPhone18,3" to "iPhone 17",
        "iPhone18,4" to "iPhone Air",
        "iPhone18,1" to "iPhone 17 Pro",
        "iPhone18,2" to "iPhone 17 Pro Max",
        "iPad12,1" to "iPad (9th generation)",
        "iPad12,2" to "iPad (9th generation)",
        "iPad13,18" to "iPad (10th generation)",
        "iPad13,19" to "iPad (10th generation)",
        "iPad15,7" to "iPad (A16)",
        "iPad15,8" to "iPad (A16)",
        "iPad14,1" to "iPad mini (6th generation)",
        "iPad14,2" to "iPad mini (6th generation)",
        "iPad16,1" to "iPad mini (A17 Pro)",
        "iPad16,2" to "iPad mini (A17 Pro)",
        "iPad13,1" to "iPad Air (4th generation)",
        "iPad13,2" to "iPad Air (4th generation)",
        "iPad13,16" to "iPad Air (5th generation)",
        "iPad13,17" to "iPad Air (5th generation)",
        "iPad14,8" to "iPad Air 11-inch (M2)",
        "iPad14,9" to "iPad Air 11-inch (M2)",
        "iPad14,10" to "iPad Air 13-inch (M2)",
        "iPad14,11" to "iPad Air 13-inch (M2)",
        "iPad15,3" to "iPad Air 11-inch (M3)",
        "iPad15,4" to "iPad Air 11-inch (M3)",
        "iPad15,5" to "iPad Air 13-inch (M3)",
        "iPad15,6" to "iPad Air 13-inch (M3)",
        "iPad13,4" to "iPad Pro 11-inch (3rd generation)",
        "iPad13,5" to "iPad Pro 11-inch (3rd generation)",
        "iPad13,6" to "iPad Pro 11-inch (3rd generation)",
        "iPad13,7" to "iPad Pro 11-inch (3rd generation)",
        "iPad13,8" to "iPad Pro 12.9-inch (5th generation)",
        "iPad13,9" to "iPad Pro 12.9-inch (5th generation)",
        "iPad13,10" to "iPad Pro 12.9-inch (5th generation)",
        "iPad13,11" to "iPad Pro 12.9-inch (5th generation)",
        "iPad14,3" to "iPad Pro 11-inch (4th generation)",
        "iPad14,4" to "iPad Pro 11-inch (4th generation)",
        "iPad14,5" to "iPad Pro 12.9-inch (6th generation)",
        "iPad14,6" to "iPad Pro 12.9-inch (6th generation)",
        "iPad16,3" to "iPad Pro 11-inch (M4)",
        "iPad16,4" to "iPad Pro 11-inch (M4)",
        "iPad16,5" to "iPad Pro 13-inch (M4)",
        "iPad16,6" to "iPad Pro 13-inch (M4)",
        "iPod9,1" to "iPod touch (7th generation)",
    )
}
