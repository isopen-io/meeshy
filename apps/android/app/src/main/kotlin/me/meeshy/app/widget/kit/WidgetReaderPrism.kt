package me.meeshy.app.widget.kit

import android.content.Context
import android.content.SharedPreferences

/**
 * Le prisme du lecteur tel que les widgets le relisent. Un `GlanceAppWidget` se met à jour dans un
 * processus à froid où la session n'est pas hydratée (même raison que `TokenStore.userId`) : l'app
 * en grave donc ici la descente ORDONNÉE, produite par la source unique
 * `LanguageResolver.preferredContentLanguages`, et le widget la rend à `resolveLastMessagePreview`
 * — jamais une seconde loi de langue. Vide ⇒ l'original, comme une rangée de liste sans préférences.
 */
internal object WidgetReaderPrismCodec {
    private const val SEPARATOR = ","

    fun encode(prism: List<String>): String =
        prism.map(String::trim).filter { it.isNotEmpty() }.joinToString(SEPARATOR)

    fun decode(raw: String?): List<String> =
        raw.orEmpty().split(SEPARATOR).map(String::trim).filter { it.isNotEmpty() }
}

internal class WidgetReaderPrismStore(private val prefs: SharedPreferences) {

    constructor(context: Context) : this(
        context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE),
    )

    fun load(): List<String> = WidgetReaderPrismCodec.decode(prefs.getString(KEY, null))

    /** `true` quand la descente gravée a changé : les widgets déjà posés doivent se repeindre. */
    fun save(prism: List<String>): Boolean {
        val encoded = WidgetReaderPrismCodec.encode(prism)
        if (encoded == WidgetReaderPrismCodec.encode(load())) return false
        prefs.edit().putString(KEY, encoded).apply()
        return true
    }

    private companion object {
        const val FILE = "widget_reader_prism"
        const val KEY = "languages"
    }
}
