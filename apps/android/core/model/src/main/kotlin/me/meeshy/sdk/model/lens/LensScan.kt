package me.meeshy.sdk.model.lens

/** Ce qui se mesure sans rien interpréter : la profondeur, les interdits, les URL, les dates. */
internal object LensScan {

    fun exceedsDepth(value: LensJsonValue, levelsLeft: Int): Boolean = when (value) {
        is LensJsonValue.Arr -> levelsLeft <= 0 || value.items.any { exceedsDepth(it, levelsLeft - 1) }
        is LensJsonValue.Obj -> levelsLeft <= 0 || value.fields.values.any { exceedsDepth(it, levelsLeft - 1) }
        else -> false
    }

    fun forbiddenReasons(value: LensJsonValue): List<String> = when (value) {
        is LensJsonValue.Str -> if (containsUrl(value.value)) listOf("url") else emptyList()
        is LensJsonValue.Arr -> value.items.flatMap(::forbiddenReasons)
        is LensJsonValue.Obj -> value.fields.flatMap { (key, child) ->
            (if (key in LensVocabulary.forbiddenKeys) listOf("key:$key") else emptyList()) + forbiddenReasons(child)
        }
        else -> emptyList()
    }

    fun forbiddenLayerReasons(layers: LensJsonValue?): List<String> {
        val items = (layers as? LensJsonValue.Arr)?.items ?: return emptyList()
        return items.mapNotNull { item ->
            val kind = ((item as? LensJsonValue.Obj)?.fields?.get("kind") as? LensJsonValue.Str)?.value
            kind?.takeIf { it in LensVocabulary.forbiddenLayerKinds }?.let { "layer:$it" }
        }
    }

    private fun isAsciiWord(unit: Char): Boolean = unit in '0'..'9' || unit in 'A'..'Z' || unit in 'a'..'z' || unit == '_'

    /** `data:` ne compte que s'il ouvre un mot : « metadata: » n'est pas une URL. Positions en unités UTF-16. */
    private fun hasBareScheme(value: String, scheme: String): Boolean =
        value.indices.any { index -> value.startsWith(scheme, index) && (index == 0 || !isAsciiWord(value[index - 1])) }

    fun containsUrl(raw: String): Boolean {
        val value = raw.lowercase()
        return value.startsWith("//") || value.contains("://") || LensVocabulary.bareUrlSchemes.any { hasBareScheme(value, it) }
    }

    private fun digits(value: String, start: Int, count: Int): Int? {
        val slice = value.substring(start, start + count)
        return if (slice.all { it in '0'..'9' }) slice.toInt() else null
    }

    private fun isCalendarDay(year: Int, month: Int, day: Int): Boolean {
        if (month !in 1..12 || day < 1) return false
        val leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
        val length = when (month) {
            2 -> if (leap) 29 else 28
            4, 6, 9, 11 -> 30
            else -> 31
        }
        return day <= length
    }

    fun isIsoDate(value: String): Boolean {
        if (value.length != 10 || value[4] != '-' || value[7] != '-') return false
        val year = digits(value, 0, 4) ?: return false
        val month = digits(value, 5, 2) ?: return false
        val day = digits(value, 8, 2) ?: return false
        return isCalendarDay(year, month, day)
    }

    fun isIsoDateTime(value: String): Boolean {
        if (value.length != 20 || value[4] != '-' || value[7] != '-' || value[10] != 'T' ||
            value[13] != ':' || value[16] != ':' || value[19] != 'Z'
        ) return false
        val year = digits(value, 0, 4) ?: return false
        val month = digits(value, 5, 2) ?: return false
        val day = digits(value, 8, 2) ?: return false
        val hour = digits(value, 11, 2) ?: return false
        val minute = digits(value, 14, 2) ?: return false
        val second = digits(value, 17, 2) ?: return false
        return isCalendarDay(year, month, day) && hour < 24 && minute < 60 && second < 60
    }
}
