package me.meeshy.sdk.reading

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.ReadingModePreferenceScope

/**
 * Stockage local, scopé par lecteur, du mode de lecture — miroir de
 * `FocalReadingModePreferenceStoring` (iOS). `null` = rien de mémorisé = Automatique.
 */
public interface ReadingModePreferenceStoring {
    public fun mode(conversationId: String, scope: ReadingModePreferenceScope): ConversationReadingMode?
    public fun setMode(mode: ConversationReadingMode?, conversationId: String, scope: ReadingModePreferenceScope)
    public fun lastOpenedAtMs(conversationId: String, scope: ReadingModePreferenceScope): Long?
    public fun noteOpened(conversationId: String, scope: ReadingModePreferenceScope, atMs: Long)

    /** Efface toutes les préférences de lecture (changement de compte) ; les drapeaux restent. */
    public fun clearAll() {}
}

/** Les drapeaux des modes de lecture — miroir de `LentilleFeatureFlag` : actifs tant qu'aucune valeur n'est écrite. */
public interface ReadingModeFlags {
    public val isReadingModesEnabled: Boolean
    public val isRiviereModeEnabled: Boolean
}

/**
 * Le stockage `SharedPreferences` : clés `meeshy_readmode_<scope>_<id>` (valeur = mode rendu
 * `focal|script|summary|river|bubbles`) et `meeshy_lastopen_<scope>_<id>` (epoch en ms), et les
 * drapeaux `meeshy.flag.reading_modes` / `meeshy.flag.riviere_mode` (défaut : actifs).
 */
@Singleton
public class SharedPreferencesReadingModeStore @Inject constructor(
    @ApplicationContext context: Context,
) : ReadingModePreferenceStoring, ReadingModeFlags {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun mode(conversationId: String, scope: ReadingModePreferenceScope): ConversationReadingMode? =
        ConversationReadingMode.fromWire(prefs.getString(ReadingModePreferenceScope.modeKey(scope, conversationId), null))

    override fun setMode(mode: ConversationReadingMode?, conversationId: String, scope: ReadingModePreferenceScope) {
        if (conversationId.isEmpty()) return
        val key = ReadingModePreferenceScope.modeKey(scope, conversationId)
        prefs.edit().apply { if (mode == null) remove(key) else putString(key, mode.wire) }.apply()
    }

    override fun lastOpenedAtMs(conversationId: String, scope: ReadingModePreferenceScope): Long? {
        val key = ReadingModePreferenceScope.lastOpenedKey(scope, conversationId)
        return if (prefs.contains(key)) prefs.getLong(key, 0L) else null
    }

    override fun noteOpened(conversationId: String, scope: ReadingModePreferenceScope, atMs: Long) {
        if (conversationId.isEmpty()) return
        prefs.edit().putLong(ReadingModePreferenceScope.lastOpenedKey(scope, conversationId), atMs).apply()
    }

    override fun clearAll() {
        prefs.edit().apply {
            prefs.all.keys
                .filter { it.startsWith(MODE_KEY_PREFIX) || it.startsWith(LAST_OPEN_KEY_PREFIX) }
                .forEach { remove(it) }
        }.apply()
    }

    override val isReadingModesEnabled: Boolean get() = prefs.getBoolean(FLAG_READING_MODES, true)
    override val isRiviereModeEnabled: Boolean get() = prefs.getBoolean(FLAG_RIVIERE_MODE, true)

    private companion object {
        const val PREFS = "meeshy.readingModes"
        const val MODE_KEY_PREFIX = "meeshy_readmode_"
        const val LAST_OPEN_KEY_PREFIX = "meeshy_lastopen_"
        const val FLAG_READING_MODES = "meeshy.flag.reading_modes"
        const val FLAG_RIVIERE_MODE = "meeshy.flag.riviere_mode"
    }
}
