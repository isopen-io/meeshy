package me.meeshy.sdk.model.net

/**
 * Le nom LISIBLE d'un appareil Android, déduit de `Build.MODEL` / `Build.MANUFACTURER`
 * (`SM-S918B` → « Samsung Galaxy S23 Ultra ») — ce que `X-Meeshy-Device` déclare au
 * serveur, comme `DeviceModelName` côté iOS.
 *
 * Jamais le nom que l'utilisateur a choisi pour son appareil (`Settings.Global.DEVICE_NAME`) :
 * c'est une donnée personnelle qui n'a rien à faire dans un relevé de session. Un modèle
 * absent de la table se replie sur « FABRICANT MODÈLE ».
 */
public object DeviceModelName {

    public fun readable(model: String, manufacturer: String): String {
        val cleanModel = model.trim()
        val cleanMaker = manufacturer.trim()
        table[cleanModel.uppercase()]?.let { return it }
        val maker = cleanMaker.replaceFirstChar { it.uppercase() }
        return when {
            cleanModel.isEmpty() && maker.isEmpty() -> UNKNOWN
            cleanModel.isEmpty() -> maker
            maker.isEmpty() -> cleanModel
            cleanModel.startsWith(maker, ignoreCase = true) -> cleanModel
            else -> "$maker $cleanModel"
        }
    }

    private const val UNKNOWN = "unknown"

    private val table: Map<String, String> = mapOf(
        "SM-S938B" to "Samsung Galaxy S25 Ultra",
        "SM-S936B" to "Samsung Galaxy S25+",
        "SM-S931B" to "Samsung Galaxy S25",
        "SM-S928B" to "Samsung Galaxy S24 Ultra",
        "SM-S926B" to "Samsung Galaxy S24+",
        "SM-S921B" to "Samsung Galaxy S24",
        "SM-S918B" to "Samsung Galaxy S23 Ultra",
        "SM-S916B" to "Samsung Galaxy S23+",
        "SM-S911B" to "Samsung Galaxy S23",
        "SM-S908B" to "Samsung Galaxy S22 Ultra",
        "SM-S906B" to "Samsung Galaxy S22+",
        "SM-S901B" to "Samsung Galaxy S22",
        "SM-G998B" to "Samsung Galaxy S21 Ultra",
        "SM-G996B" to "Samsung Galaxy S21+",
        "SM-G991B" to "Samsung Galaxy S21",
        "SM-F956B" to "Samsung Galaxy Z Fold6",
        "SM-F741B" to "Samsung Galaxy Z Flip6",
        "SM-F946B" to "Samsung Galaxy Z Fold5",
        "SM-F731B" to "Samsung Galaxy Z Flip5",
        "SM-A556B" to "Samsung Galaxy A55",
        "SM-A546B" to "Samsung Galaxy A54",
        "SM-A536B" to "Samsung Galaxy A53",
        "SM-A346B" to "Samsung Galaxy A34",
        "SM-A145F" to "Samsung Galaxy A14",
    )
}
