package me.meeshy.sdk.model.contacts.vcard

import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Le libellé d'un champ : clé connue (à localiser), libellé libre de l'auteur, ou nom du champ. */
sealed interface ContactCardLabel {
    data class Known(val key: String) : ContactCardLabel
    data class Custom(val text: String) : ContactCardLabel
    data class OfKind(val kind: ContactCardField.Kind) : ContactCardLabel
}

/**
 * Une ligne de la fiche : TOUS les champs lisibles de la vCard, dans l'ordre d'un carnet
 * (miroir de `ContactCardField`, iOS).
 */
data class ContactCardField(
    val id: String,
    val kind: Kind,
    val label: ContactCardLabel,
    val value: String,
) {
    enum class Kind(val iconName: String) {
        PHONE("phone"), EMAIL("email"), ADDRESS("place"), ORGANIZATION("business"),
        TITLE("work"), URL("link"), BIRTHDAY("cake"), NOTE("note"),
    }

    /** Texte du libellé ; `known` et `kindTitle` apportent les chaînes localisées. */
    fun labelText(known: (String) -> String?, kindTitle: (Kind) -> String): String = when (label) {
        is ContactCardLabel.Known -> known(label.key) ?: label.key
        is ContactCardLabel.Custom -> label.text
        is ContactCardLabel.OfKind -> kindTitle(label.kind)
    }

    companion object {
        fun fields(card: VCard, locale: Locale = Locale.getDefault()): List<ContactCardField> {
            fun labelOf(key: String?, kind: Kind): ContactCardLabel = when {
                key == null -> ContactCardLabel.OfKind(kind)
                key in VCardEntry.knownLabels -> ContactCardLabel.Known(key)
                else -> ContactCardLabel.Custom(key)
            }
            val fields = ArrayList<ContactCardField>()
            card.phones.forEachIndexed { i, e -> fields += ContactCardField("phone-$i", Kind.PHONE, labelOf(e.labelKey, Kind.PHONE), e.value) }
            card.emails.forEachIndexed { i, e -> fields += ContactCardField("email-$i", Kind.EMAIL, labelOf(e.labelKey, Kind.EMAIL), e.value) }
            card.addresses.forEachIndexed { i, a ->
                val key = a.label ?: VCardEntry("", a.types).labelKey
                fields += ContactCardField("address-$i", Kind.ADDRESS, labelOf(key, Kind.ADDRESS), a.formatted)
            }
            card.organization?.let { fields += ContactCardField("organization", Kind.ORGANIZATION, labelOf(null, Kind.ORGANIZATION), it) }
            card.title?.let { fields += ContactCardField("title", Kind.TITLE, labelOf(null, Kind.TITLE), it) }
            card.urls.forEachIndexed { i, e -> fields += ContactCardField("url-$i", Kind.URL, labelOf(e.labelKey, Kind.URL), e.value) }
            card.birthday?.let { raw ->
                val value = card.birthdayComponents?.let { formatBirthday(it, locale) }?.takeIf { it.isNotEmpty() } ?: raw
                fields += ContactCardField("birthday", Kind.BIRTHDAY, labelOf(null, Kind.BIRTHDAY), value)
            }
            card.note?.let { fields += ContactCardField("note", Kind.NOTE, labelOf(null, Kind.NOTE), it) }
            return fields
        }

        /** Sans année : jour + mois localisés (UTC) ; avec année : jour + mois + année. Vide si impossible. */
        fun formatBirthday(components: BirthdayComponents, locale: Locale = Locale.getDefault()): String {
            val date = runCatching { LocalDate.of(components.year ?: LEAP_YEAR, components.month, components.day) }
                .getOrNull() ?: return ""
            val pattern = if (components.year != null) "d MMMM yyyy" else "d MMMM"
            return DateTimeFormatter.ofPattern(pattern, locale).withZone(ZoneOffset.UTC).format(date)
        }

        private const val LEAP_YEAR = 2000
    }
}
