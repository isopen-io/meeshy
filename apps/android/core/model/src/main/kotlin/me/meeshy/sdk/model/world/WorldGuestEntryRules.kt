package me.meeshy.sdk.model.world

/** Une langue principale proposée à l'entrée World Wide — nommée dans sa propre langue (endonyme), jamais traduite. */
data class WorldGuestLanguage(val code: String, val endonym: String)

/** Les étapes de l'entrée sans compte ; la troisième, le fil, est la conversation elle-même. */
enum class WorldGuestStep { NAME, LANGUAGE }

/** Pourquoi l'entrée a échoué — l'écran en dit la raison, sans jamais laisser croire à une panne muette. */
sealed interface WorldEntryFailure {
    data object Offline : WorldEntryFailure
    data object EnterFailed : WorldEntryFailure

    /** Un refus 4xx de la passerelle avec sa raison (lien fermé, limite atteinte). */
    data class Refused(val reason: String) : WorldEntryFailure
}

/**
 * La loi de l'entrée SANS COMPTE dans World Wide (#10006) : nom → langue principale → fil. Mêmes étapes et
 * mêmes mots que le web et iOS (`WorldGuestEntryViewModel`). Pure : l'écran et le ViewModel la lisent.
 */
object WorldGuestEntryRules {

    /** Le plafond du nom côté passerelle (`firstName`, 50 caractères). */
    const val MAX_NAME_LENGTH: Int = 50

    /** Nombre de pastilles de progression : nom, langue, fil. */
    const val STEP_COUNT: Int = 3

    private const val FALLBACK_LANGUAGE = "fr"
    private const val NETWORK_CODE = "NETWORK"

    /** Les sept langues de l'interface, dans l'ordre de la planche. */
    val interfaceLanguages: List<WorldGuestLanguage> = listOf(
        WorldGuestLanguage("fr", "Français"),
        WorldGuestLanguage("en", "English"),
        WorldGuestLanguage("es", "Español"),
        WorldGuestLanguage("pt", "Português"),
        WorldGuestLanguage("de", "Deutsch"),
        WorldGuestLanguage("it", "Italiano"),
        WorldGuestLanguage("ar", "العربية"),
    )

    /**
     * « Proposée depuis votre appareil » : la langue de l'appareil quand elle est l'une des sept, sinon le
     * français (repli du Prisme). Accepte une étiquette BCP 47 (`pt-BR`, `en_US`) ou vide.
     */
    fun proposedLanguage(deviceTag: String?): String {
        val base = deviceTag.orEmpty().split('-', '_').firstOrNull().orEmpty().lowercase()
        return interfaceLanguages.firstOrNull { it.code == base }?.code ?: FALLBACK_LANGUAGE
    }

    fun trimmedName(name: String): String = name.trim()

    fun canContinue(name: String): Boolean = trimmedName(name).let { it.isNotEmpty() && it.length <= MAX_NAME_LENGTH }

    /** Le nom saisi, borné au plafond de la passerelle : la saisie ne dépasse jamais ce que le serveur refuserait. */
    fun boundedName(typed: String): String = typed.take(MAX_NAME_LENGTH)

    /** Un 404 de `GET /world` (`WORLD_UNAVAILABLE`) ferme la porte ; hors ligne ou lent, l'entrée déjà servie reste valable. */
    fun closesTheDoor(httpStatus: Int?): Boolean = httpStatus == 404

    /** Pour que `GET /world` en échec ne ferme la porte que s'il n'y a rien déjà servi. */
    fun failure(code: String?, httpStatus: Int?, message: String?): WorldEntryFailure {
        if (code?.trim()?.uppercase() == NETWORK_CODE) return WorldEntryFailure.Offline
        val reason = message?.trim().orEmpty()
        return if (httpStatus != null && httpStatus in 400..499 && reason.isNotEmpty()) {
            WorldEntryFailure.Refused(reason)
        } else {
            WorldEntryFailure.EnterFailed
        }
    }
}
