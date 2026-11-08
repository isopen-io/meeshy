package me.meeshy.ui.component.video

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * **La session de son partagée** du fil et des réels : le réel joue AVEC son par défaut (comme iOS) et le
 * bouton haut-parleur bascule le son de la session. La préférence est conservée d'un écran à l'autre.
 */
internal class VideoSoundSession(private val store: Store = Store.InMemory()) {

    interface Store {
        fun read(): Boolean?
        fun write(soundOn: Boolean)

        class InMemory(private var value: Boolean? = null) : Store {
            override fun read(): Boolean? = value
            override fun write(soundOn: Boolean) { value = soundOn }
        }
    }

    private val _soundOn = MutableStateFlow(store.read() ?: DEFAULT_SOUND_ON)
    val soundOn: StateFlow<Boolean> = _soundOn.asStateFlow()

    fun set(on: Boolean) {
        if (_soundOn.value == on) return
        _soundOn.value = on
        runCatching { store.write(on) }
    }

    fun toggle() = set(!_soundOn.value)

    companion object {
        const val DEFAULT_SOUND_ON: Boolean = true
        private const val PREFS = "meeshy_video_sound_session"
        private const val KEY = "sound_on"

        @Volatile
        private var shared: VideoSoundSession? = null

        fun get(context: Context): VideoSoundSession = shared ?: synchronized(this) {
            shared ?: VideoSoundSession(PreferencesStore(context.applicationContext)).also { shared = it }
        }
    }

    private class PreferencesStore(context: Context) : Store {
        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        override fun read(): Boolean? = runCatching { if (prefs.contains(KEY)) prefs.getBoolean(KEY, true) else null }.getOrNull()
        override fun write(soundOn: Boolean) { prefs.edit().putBoolean(KEY, soundOn).apply() }
    }
}
