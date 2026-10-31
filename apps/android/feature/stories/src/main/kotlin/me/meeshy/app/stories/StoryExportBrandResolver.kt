package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.scene.export.StoryExportAuthorFacts
import me.meeshy.sdk.model.scene.export.StoryExportIdentity
import me.meeshy.sdk.model.scene.export.StoryExportMood
import me.meeshy.sdk.relation.RelationLevelProvider
import me.meeshy.sdk.status.statusForUser

/**
 * **Résout ce que l'intro d'un export doit dire de l'auteur** (#13997) : son mood et le niveau de son lien avec le lecteur, puis
 * la projection opaque [StoryExportIdentity]. La résolution est BORNÉE comme le reste du préambule : l'export n'attend jamais
 * le réseau au-delà de [budgetMillis], et ce qui n'est pas arrivé à temps manque (pas de mood, pas de logo) — jamais une
 * erreur. Sa propre story n'interroge pas le fournisseur de lien : elle ne porte jamais de logo.
 */
class StoryExportBrandResolver(
    private val relationLevel: RelationLevelProvider,
    private val moodOf: suspend (userId: String) -> StoryExportMood?,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val budgetMillis: Long = RESOLVE_BUDGET_MILLIS,
) {
    suspend fun identity(author: StoryExportAuthorFacts): StoryExportIdentity = coroutineScope {
        val level = async { if (author.isOwn) null else bounded { relationLevel.servedLevel(author.userId) } }
        val mood = async { bounded { moodOf(author.userId) } }
        StoryExportIdentity.of(author, mood.await(), level.await(), nowMillis())
    }

    private suspend fun <T> bounded(block: suspend () -> T?): T? = try {
        withTimeoutOrNull(budgetMillis) { block() }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        null
    }

    companion object {
        const val RESOLVE_BUDGET_MILLIS = 2_000L

        /** Le mood vivant de [userId] dans les statuts servis, ou `null`. */
        fun moodIn(statuses: List<StatusEntry>, userId: String): StoryExportMood? =
            statuses.statusForUser(userId)?.takeIf { it.moodEmoji.isNotBlank() }?.let { StoryExportMood(it.moodEmoji, it.content) }
    }
}
