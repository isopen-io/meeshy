package me.meeshy.app.chat.export

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Le FORMAT de l'image : `auto` garde la carte adaptative, les quatre autres FIXENT la toile. */
enum class CardAspect(val key: String, val width: Double, val fixedHeight: Double?) {
    AUTO("auto", 1080.0, null),
    STORY("story", 1080.0, 1920.0),
    PORTRAIT("portrait", 1080.0, 1350.0),
    SQUARE("square", 1080.0, 1080.0),
    LANDSCAPE("landscape", 1920.0, 1080.0),
}

/** Où se lit le nom de l'auteur : au-dessus de son texte, ou en signature à la fin. */
enum class CardAuthorPlacement(val key: String) { ABOVE("above"), AFTER("after") }

/** L'inclinaison du message sur la carte — l'en-tête et le filigrane restent droits. */
enum class CardTilt(val key: String, val degrees: Double) {
    NONE("none", 0.0), LEFT("left", -4.0), RIGHT("right", 4.0);

    val radians: Double get() = Math.toRadians(degrees)
}

enum class CardToggle {
    SHOW_CONVERSATION_TITLE, SHOW_AUTHORS, SHOW_DATE, ANONYMIZE_QUOTED, ANONYMIZE_REPLY, SHOW_TIMES, USE_HANDLES,
}

/** Le stockage des préférences de présentation — aucun contenu n'y entre. */
interface CardPreferenceStore {
    fun string(key: String): String?
    fun putString(key: String, value: String)
}

/**
 * LE FORMAT D'UNE CARTE D'EXPORT — ce que l'exportateur choisit de MONTRER parmi ce qui existe :
 * template, titre, noms (ou anonymat), date, heures, pseudo, format, place des noms, inclinaison.
 * Miroir (texte) de `MessageCardFormat.swift`. Relu et VALIDÉ à chaque lecture : une valeur abîmée
 * retombe sur « aucun défaut », jamais sur une exception.
 */
data class CardFormat(
    val template: CardTemplateId,
    val showConversationTitle: Boolean = false,
    val showAuthors: Boolean = true,
    val showDate: Boolean = false,
    val anonymizeQuoted: Boolean = false,
    val anonymizeReply: Boolean = false,
    val showTimes: Boolean = false,
    val useHandles: Boolean = false,
    val aspect: CardAspect = CardAspect.AUTO,
    val authorPlacement: CardAuthorPlacement = CardAuthorPlacement.ABOVE,
    val tilt: CardTilt = CardTilt.NONE,
) {
    operator fun get(toggle: CardToggle): Boolean = when (toggle) {
        CardToggle.SHOW_CONVERSATION_TITLE -> showConversationTitle
        CardToggle.SHOW_AUTHORS -> showAuthors
        CardToggle.SHOW_DATE -> showDate
        CardToggle.ANONYMIZE_QUOTED -> anonymizeQuoted
        CardToggle.ANONYMIZE_REPLY -> anonymizeReply
        CardToggle.SHOW_TIMES -> showTimes
        CardToggle.USE_HANDLES -> useHandles
    }

    fun with(toggle: CardToggle, value: Boolean): CardFormat = when (toggle) {
        CardToggle.SHOW_CONVERSATION_TITLE -> copy(showConversationTitle = value)
        CardToggle.SHOW_AUTHORS -> copy(showAuthors = value)
        CardToggle.SHOW_DATE -> copy(showDate = value)
        CardToggle.ANONYMIZE_QUOTED -> copy(anonymizeQuoted = value)
        CardToggle.ANONYMIZE_REPLY -> copy(anonymizeReply = value)
        CardToggle.SHOW_TIMES -> copy(showTimes = value)
        CardToggle.USE_HANDLES -> copy(useHandles = value)
    }

    /** Les options de « Détails » : le titre s'il existe, l'anonymat seulement pour un nom PEINT. */
    fun offeredToggles(hasConversationTitle: Boolean, hasQuote: Boolean): List<CardToggle> = buildList {
        if (hasConversationTitle) add(CardToggle.SHOW_CONVERSATION_TITLE)
        add(CardToggle.SHOW_AUTHORS)
        if (showAuthors && hasQuote) add(CardToggle.ANONYMIZE_QUOTED)
        if (showAuthors) add(CardToggle.ANONYMIZE_REPLY)
    }

    /** Les options de « Frame » : la date, les heures, et le pseudo quand un nom est peint et connu. */
    fun frameToggles(hasHandles: Boolean): List<CardToggle> = buildList {
        add(CardToggle.SHOW_DATE)
        add(CardToggle.SHOW_TIMES)
        if (showAuthors && hasHandles) add(CardToggle.USE_HANDLES)
    }

    val serialized: String
        get() = buildJsonObject {
            put("template", template.rawValue)
            put("showConversationTitle", showConversationTitle)
            put("showAuthors", showAuthors)
            put("showDate", showDate)
            put("anonymizeQuoted", anonymizeQuoted)
            put("anonymizeReply", anonymizeReply)
            put("showTimes", showTimes)
            put("useHandles", useHandles)
            put("aspect", aspect.key)
            put("authorPlacement", authorPlacement.key)
            put("tilt", tilt.key)
        }.toString()

    companion object {
        const val STORAGE_KEY = "meeshy.export.message-card.default-format"

        val initial = CardFormat(template = CardTemplates.defaultId)

        fun parse(raw: String?): CardFormat? {
            if (raw.isNullOrBlank()) return null
            val stored = runCatching { Json.parseToJsonElement(raw).jsonObject }.getOrNull() ?: return null
            fun flag(key: String, default: Boolean? = null): Boolean? =
                (stored[key] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: default
            fun text(key: String): String? = (stored[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
            val template = CardTemplateId.parse(text("template")) ?: return null
            return CardFormat(
                template = template,
                showConversationTitle = flag("showConversationTitle") ?: return null,
                showAuthors = flag("showAuthors") ?: return null,
                showDate = flag("showDate") ?: return null,
                anonymizeQuoted = flag("anonymizeQuoted") ?: return null,
                anonymizeReply = flag("anonymizeReply") ?: return null,
                showTimes = flag("showTimes", false) ?: false,
                useHandles = flag("useHandles", false) ?: false,
                aspect = CardAspect.entries.firstOrNull { it.key == text("aspect") } ?: CardAspect.AUTO,
                authorPlacement = CardAuthorPlacement.entries.firstOrNull { it.key == text("authorPlacement") } ?: CardAuthorPlacement.ABOVE,
                tilt = CardTilt.entries.firstOrNull { it.key == text("tilt") } ?: CardTilt.NONE,
            )
        }

        fun readDefault(store: CardPreferenceStore): CardFormat? = parse(store.string(STORAGE_KEY))

        fun writeDefault(format: CardFormat, store: CardPreferenceStore) = store.putString(STORAGE_KEY, format.serialized)
    }
}

/** LE COMPTEUR D'USAGE DES TEMPLATES — chaque carte ENREGISTRÉE compte une fois pour son template. */
object CardUsage {
    const val STORAGE_KEY = "meeshy.export.message-card.usage"

    fun read(store: CardPreferenceStore): Map<CardTemplateId, Int> {
        val raw = store.string(STORAGE_KEY) ?: return emptyMap()
        val entries = runCatching { Json.parseToJsonElement(raw).jsonObject }.getOrNull() ?: return emptyMap()
        return entries.mapNotNull { (key, value) ->
            val count = (value as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            CardTemplateId.parse(key)?.takeIf { count > 0 }?.let { it to count }
        }.toMap()
    }

    fun record(id: CardTemplateId, store: CardPreferenceStore) {
        val entries = read(store).mapKeys { it.key.rawValue }.toSortedMap()
        entries[id.rawValue] = (entries[id.rawValue] ?: 0) + 1
        store.putString(STORAGE_KEY, buildJsonObject { entries.forEach { (key, count) -> put(key, count) } }.toString())
    }

    /** Les [count] templates à montrer d'abord : les plus utilisés, puis la vitrine. */
    fun popular(usage: Map<CardTemplateId, Int>, count: Int): List<CardTemplateId> {
        val used = usage.entries.sortedWith(compareByDescending<Map.Entry<CardTemplateId, Int>> { it.value }.thenBy { it.key.rawValue }).map { it.key }
        return (used + CardTemplates.featured).distinct().take(count)
    }
}
