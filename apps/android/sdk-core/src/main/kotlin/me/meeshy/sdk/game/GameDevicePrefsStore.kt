package me.meeshy.sdk.game

import android.content.Context
import android.content.SharedPreferences
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.model.game.pages.GameDevicePrefs
import me.meeshy.sdk.session.SessionRepository

/**
 * LES RÉGLAGES DU JEU SUR L'APPAREIL (iOS `GameDevicePrefsStore`) — « Jeu masqué » et « Célébrations », par appareil
 * ET par compte : les clés portent l'identifiant du compte, donc un second compte sur le même appareil ne lit pas les
 * choix du premier. Aucune donnée de jeu ne vit ici ; une valeur absente vaut le défaut (le jeu visible, les
 * célébrations permises). [GameDevicePrefs.friendsLeagueOptOut] est l'opposition telle que le serveur l'a CONFIRMÉE.
 */
interface GameDevicePrefsStore {
    /** Les réglages du compte courant ; ceux d'un compte absent sont les défauts. */
    val prefs: Flow<GameDevicePrefs>

    fun current(): GameDevicePrefs

    fun set(hidden: Boolean? = null, celebrations: Boolean? = null, friendsLeagueOptOut: Boolean? = null)
}

/** Magasin volatil — tests et aperçus. */
class InMemoryGameDevicePrefsStore(initial: GameDevicePrefs = GameDevicePrefs()) : GameDevicePrefsStore {
    private val state = MutableStateFlow(initial)
    override val prefs: Flow<GameDevicePrefs> = state
    override fun current(): GameDevicePrefs = state.value
    override fun set(hidden: Boolean?, celebrations: Boolean?, friendsLeagueOptOut: Boolean?) {
        state.value = state.value.merged(hidden, celebrations, friendsLeagueOptOut)
    }
}

internal fun GameDevicePrefs.merged(hidden: Boolean?, celebrations: Boolean?, friendsLeagueOptOut: Boolean?): GameDevicePrefs =
    copy(
        hidden = hidden ?: this.hidden,
        celebrations = celebrations ?: this.celebrations,
        friendsLeagueOptOut = friendsLeagueOptOut ?: this.friendsLeagueOptOut,
    )

@Singleton
class SharedPreferencesGameDevicePrefsStore @Inject constructor(
    @ApplicationContext context: Context,
    private val session: SessionRepository,
) : GameDevicePrefsStore {

    private val file: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    /** Un compteur de version : chaque écriture relit le fichier, le flux n'a pas de second état à garder juste. */
    private val version = MutableStateFlow(0)

    override val prefs: Flow<GameDevicePrefs> =
        combine(session.currentUser.map { it?.id }.distinctUntilChanged(), version) { userId, _ -> read(userId) }
            .distinctUntilChanged()

    override fun current(): GameDevicePrefs = read(session.currentUserId)

    override fun set(hidden: Boolean?, celebrations: Boolean?, friendsLeagueOptOut: Boolean?) {
        val userId = session.currentUserId ?: return
        val next = read(userId).merged(hidden, celebrations, friendsLeagueOptOut)
        file.edit()
            .putBoolean(key(userId, HIDDEN), next.hidden)
            .putBoolean(key(userId, CELEBRATIONS), next.celebrations)
            .putBoolean(key(userId, OPT_OUT), next.friendsLeagueOptOut)
            .apply()
        version.value += 1
    }

    private fun read(userId: String?): GameDevicePrefs {
        if (userId == null) return GameDevicePrefs()
        val defaults = GameDevicePrefs()
        return GameDevicePrefs(
            hidden = file.getBoolean(key(userId, HIDDEN), defaults.hidden),
            celebrations = file.getBoolean(key(userId, CELEBRATIONS), defaults.celebrations),
            friendsLeagueOptOut = file.getBoolean(key(userId, OPT_OUT), defaults.friendsLeagueOptOut),
        )
    }

    private fun key(userId: String, name: String) = "$userId.$name"

    private companion object {
        const val FILE_NAME = "meeshy.game.prefs"
        const val HIDDEN = "hidden"
        const val CELEBRATIONS = "celebrations"
        const val OPT_OUT = "friendsLeagueOptOut"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface GameDevicePrefsModule {
    @Binds
    fun bindsGameDevicePrefsStore(store: SharedPreferencesGameDevicePrefsStore): GameDevicePrefsStore
}
