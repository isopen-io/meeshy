package me.meeshy.sdk.game

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.game.GuideSeenRequest
import me.meeshy.sdk.model.game.guide.GuideSnapshot
import me.meeshy.sdk.model.game.guide.GuideSnapshotStore
import me.meeshy.sdk.model.game.guide.GuideVisitStore
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.GameApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.SessionRepository

/**
 * LE GUIDE DE MEE ET MEO, côté données (iOS `GameService.markGuideSeen`, `UserDefaultsGameVisitStore`,
 * `UserDefaultsGuideSnapshotStore`) : ce que le serveur garde — les clés vues, un envoi par carte montrée — et ce que
 * l'APPAREIL garde, par compte — le dernier passage et le dernier instantané. Rien d'autre : écarter une carte ne se
 * retient nulle part, comme sur iOS.
 */
@Singleton
class GameGuideRepository @Inject constructor(
    private val game: GameApi,
    @ApplicationContext context: Context,
    private val session: SessionRepository,
) : GuideVisitStore, GuideSnapshotStore {

    private val file: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    /** Un envoi refusé ne retire pas la carte : c'est le prix d'un hors-ligne, elle se redira. */
    suspend fun markSeen(keys: List<String>): Boolean {
        if (keys.isEmpty()) return true
        val request = GuideSeenRequest(UUID.randomUUID().toString(), keys.take(MAX_KEYS))
        return apiCall { game.markGuideSeen(request) } is NetworkResult.Success
    }

    override fun lastVisitDay(): String? = key(LAST_VISIT)?.let { file.getString(it, null) }

    override fun rememberVisit(day: String) {
        key(LAST_VISIT)?.let { file.edit().putString(it, day).apply() }
    }

    override fun load(): GuideSnapshot? = key(SNAPSHOT)?.let { file.getString(it, null) }
        ?.let { runCatching { json.decodeFromString(GuideSnapshot.serializer(), it) }.getOrNull() }

    override fun save(snapshot: GuideSnapshot) {
        val name = key(SNAPSHOT) ?: return
        file.edit().putString(name, json.encodeToString(GuideSnapshot.serializer(), snapshot)).apply()
    }

    private fun key(name: String): String? = session.currentUserId?.let { "$it.$name" }

    private companion object {
        const val FILE_NAME = "meeshy.game.guide"
        const val LAST_VISIT = "last-visit"
        const val SNAPSHOT = "snapshot"
        const val MAX_KEYS = 32
        val json = Json { ignoreUnknownKeys = true }
    }
}
