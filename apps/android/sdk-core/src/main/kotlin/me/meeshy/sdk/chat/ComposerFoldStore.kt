package me.meeshy.sdk.chat

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.session.PerAccountCache

/**
 * L'état replié ou déplié de la barre de composition, retenu PAR conversation et d'un lancement à l'autre (#16341).
 * Une conversation jamais touchée garde le défaut : dépliée.
 */
public interface ComposerFoldStoring {
    public fun isMinimized(conversationId: String): Boolean
    public fun setMinimized(conversationId: String, minimized: Boolean)
}

/** La mémoire volatile, pour les tests et les aperçus. */
public class InMemoryComposerFoldStore : ComposerFoldStoring {
    private var folded: Set<String> = emptySet()

    override fun isMinimized(conversationId: String): Boolean = conversationId in folded

    override fun setMinimized(conversationId: String, minimized: Boolean) {
        folded = if (minimized) folded + conversationId else folded - conversationId
    }
}

/**
 * Le stockage `SharedPreferences` : une clé par conversation REPLIÉE, retirée au dépliage — le défaut ne coûte rien.
 * Lu de façon synchrone à l'ouverture, pour que la barre apparaisse d'emblée dans son état retenu ; vidé au
 * changement de compte ([PerAccountCache]).
 */
@Singleton
public class SharedPreferencesComposerFoldStore @Inject constructor(
    @ApplicationContext context: Context,
) : ComposerFoldStoring, PerAccountCache {

    private val prefs = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun isMinimized(conversationId: String): Boolean = prefs.getBoolean(keyOf(conversationId), false)

    override fun setMinimized(conversationId: String, minimized: Boolean) {
        if (conversationId.isEmpty()) return
        prefs.edit().apply { if (minimized) putBoolean(keyOf(conversationId), true) else remove(keyOf(conversationId)) }.apply()
    }

    override suspend fun clear() {
        prefs.edit().clear().apply()
    }

    private fun keyOf(conversationId: String) = "$KEY_PREFIX$conversationId"

    internal companion object {
        const val FILE_NAME = "meeshy.composerFold"
        private const val KEY_PREFIX = "folded_"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ComposerFoldModule {

    @Binds
    abstract fun store(impl: SharedPreferencesComposerFoldStore): ComposerFoldStoring

    @Binds
    @IntoSet
    abstract fun perAccount(impl: SharedPreferencesComposerFoldStore): PerAccountCache
}
