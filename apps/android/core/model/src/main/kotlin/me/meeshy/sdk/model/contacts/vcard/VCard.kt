package me.meeshy.sdk.model.contacts.vcard

/**
 * Une carte de visite partagée : la projection LISIBLE d'un fichier vCard 2.1 / 3.0 / 4.0
 * (miroir de `VCard.swift`, iOS). Le nom est celui que l'auteur a donné au contact.
 */
data class VCard(
    val formattedName: String? = null,
    val name: VCardName? = null,
    val phones: List<VCardEntry> = emptyList(),
    val emails: List<VCardEntry> = emptyList(),
    val addresses: List<VCardAddress> = emptyList(),
    val organization: String? = null,
    val title: String? = null,
    val urls: List<VCardEntry> = emptyList(),
    val birthday: String? = null,
    val note: String? = null,
) {
    /** `FN`, sinon `N` recomposé, sinon l'organisation, sinon le premier numéro ou e-mail. */
    val displayName: String
        get() = listOf(formattedName, name?.composed, organization, phones.firstOrNull()?.value, emails.firstOrNull()?.value)
            .asSequence()
            .mapNotNull { it?.trim() }
            .firstOrNull { it.isNotEmpty() }
            .orEmpty()

    /** Le numéro préféré s'il est marqué, sinon le premier. */
    val primaryPhone: VCardEntry?
        get() = phones.firstOrNull { it.isPreferred } ?: phones.firstOrNull()

    val isEmpty: Boolean
        get() = displayName.isEmpty() && addresses.isEmpty() && urls.isEmpty() && note == null && birthday == null

    /**
     * `BDAY` interprété : `1990-05-12`, `19900512`, `--05-12`, `--0512` ou un horodatage.
     * `null` si le format est inconnu : l'appelant affiche alors la valeur brute.
     */
    val birthdayComponents: BirthdayComponents?
        get() {
            val raw = birthday?.trim().orEmpty()
            if (raw.isEmpty()) return null
            val datePart = raw.substringBefore('T')
            if (datePart.startsWith("--")) {
                val digits = datePart.drop(2).filter { it.isDigit() }
                if (digits.length != 4) return null
                return BirthdayComponents.validated(null, digits.take(2).toInt(), digits.takeLast(2).toInt())
            }
            val digits = datePart.filter { it.isDigit() }
            if (digits.length != 8) return null
            return BirthdayComponents.validated(digits.take(4).toInt(), digits.substring(4, 6).toInt(), digits.takeLast(2).toInt())
        }
}

/** Un anniversaire avec ou sans année. */
data class BirthdayComponents(val year: Int?, val month: Int, val day: Int) {
    companion object {
        internal fun validated(year: Int?, month: Int, day: Int): BirthdayComponents? =
            if (month in 1..12 && day in 1..31) BirthdayComponents(year, month, day) else null
    }
}

/** `N` : famille ; prénom ; autres ; préfixe ; suffixe. */
data class VCardName(
    val family: String = "",
    val given: String = "",
    val additional: String = "",
    val prefix: String = "",
    val suffix: String = "",
) {
    val composed: String
        get() = listOf(prefix, given, additional, family, suffix)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .joinToString(" ")
}

/** Un numéro, un e-mail ou une URL, avec ses types en minuscules et l'éventuel libellé libre. */
data class VCardEntry(
    val value: String,
    val types: List<String> = emptyList(),
    val label: String? = null,
) {
    val isPreferred: Boolean get() = "pref" in types

    /** Le libellé de l'auteur s'il existe, sinon la clé déduite des types (`cell` donne `mobile`). */
    val labelKey: String?
        get() = label ?: LABEL_PRIORITY.firstOrNull { it.first in types }?.second

    companion object {
        /** Mêmes clés que `VCARD_KNOWN_LABELS` (`packages/shared/types/contact-card.ts`). */
        val knownLabels: List<String> = listOf("mobile", "home", "work", "main", "iphone", "fax", "pager", "other")

        private val LABEL_PRIORITY = listOf(
            "fax" to "fax", "pager" to "pager", "iphone" to "iphone", "cell" to "mobile",
            "main" to "main", "home" to "home", "work" to "work", "other" to "other",
        )

        internal fun knownLabelForAppleSystemLabel(system: String): String? = when (system.lowercase()) {
            "mobile" -> "mobile"
            "home" -> "home"
            "work" -> "work"
            "main" -> "main"
            "iphone" -> "iphone"
            "homefax", "workfax", "otherfax" -> "fax"
            "pager" -> "pager"
            "other" -> "other"
            else -> null
        }
    }
}

/** `ADR` : boîte postale ; complément ; rue ; ville ; région ; code postal ; pays. */
data class VCardAddress(
    val poBox: String = "",
    val extended: String = "",
    val street: String = "",
    val locality: String = "",
    val region: String = "",
    val postalCode: String = "",
    val country: String = "",
    val types: List<String> = emptyList(),
    val label: String? = null,
) {
    /** Rue (et compléments), puis « code postal ville », puis région, puis pays. */
    val formatted: String
        get() {
            val cityLine = listOf(postalCode, locality).map { it.trim() }.filter { it.isNotEmpty() }.joinToString(" ")
            return listOf(poBox, street, extended, cityLine, region, country)
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .joinToString("\n")
        }
}
