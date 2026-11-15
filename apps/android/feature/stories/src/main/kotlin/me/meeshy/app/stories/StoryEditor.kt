package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Le composeur est-il en train d'ÉDITER une story publiée ? Tant que la story n'est pas là, rien ne part (jamais une story neuve). */
internal sealed interface StoryEditMode {
    data object Loading : StoryEditMode

    class Active(private val opening: StoryEditOpening, private val editor: StoryEditor) : StoryEditMode {
        /** Enregistre : une erreur reste dans le composeur, qui garde la composition entière à portée d'un nouvel essai. */
        fun save(scope: CoroutineScope, state: MutableStateFlow<StoryComposerUiState>, saved: MutableSharedFlow<Unit>, language: String) {
            val current = state.value
            if (!current.canPublish) return
            state.update { it.copy(isPublishing = true, errorMessage = null) }
            scope.launch {
                val failure = try {
                    editor.save(opening, current, language)
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Throwable) {
                    StoryEditErrors.FAILED
                }
                if (failure == null) {
                    state.value = StoryComposerUiState()
                    saved.tryEmit(Unit)
                } else {
                    state.update { it.copy(isPublishing = false, errorMessage = failure) }
                }
            }
        }
    }
}

/**
 * La porte d'ÉDITION d'une story publiée (#13632) — miroir de `StoryEditComposer` / `StoryViewModel.updateStoryInBackground`
 * d'iOS, sur la même route (`PUT /posts/:id`, qui remet vues et réactions à zéro et garde la date de publication).
 *
 * **Optimiste, avec retour arrière** : la barre montre la story éditée dès que l'enregistrement part ; la réponse du serveur
 * la remplace, un refus rend la ligne d'avant. En ligne seulement, comme iOS : hors ligne l'enregistrement est refusé (le
 * composeur reste ouvert, rien n'est perdu) au lieu d'être mis en file derrière une édition que personne ne verrait partir.
 */
@Singleton
internal class StoryEditor @Inject constructor(
    private val reader: StoryServedReader,
    private val posts: PostRepository,
    private val stories: StoryRepository,
    private val session: SessionRepository,
    private val lookOven: StoryLookOven? = null,
) {
    /** La story à rouvrir, ou `null` : elle n'existe plus, n'est pas une story de l'utilisateur, ou n'est joignable nulle part. */
    suspend fun open(storyId: String): StoryEditOpening? {
        val served = reader.read(storyId)
        val post = served?.post ?: stories.cachedStories().firstOrNull { it.id == storyId }
        return post?.takeIf { it.type == STORY && it.isMine() }
            ?.let { StoryEditOpening.open(it, mentionsKnown = served != null, served = served?.effects) }
    }

    /**
     * `null` : enregistrée. Sinon le repère de l'échec, que le composeur dit à l'auteur. Une story rouverte du cache relit
     * d'abord son blob servi : sans lui l'écriture rabattrait la story sur ce qu'Android en sait, et rien ne part.
     */
    suspend fun save(opening: StoryEditOpening, state: StoryComposerUiState, language: String): String? {
        if (!opening.post.isMine()) return StoryEditErrors.UNAVAILABLE
        val unbaked = StoryEditMerge.plan(opening, state, language)
        if (unbaked is StoryEditPlan.Refused && unbaked.reason != StoryEditErrors.BASE_UNKNOWN) return unbaked.reason
        val sent = baked(state) ?: return StoryEditErrors.FAILED
        val first = if (sent === state) unbaked else StoryEditMerge.plan(opening, sent, language)
        val plan = if (first == StoryEditPlan.Refused(StoryEditErrors.BASE_UNKNOWN)) rebased(opening, sent, language) else first
        if (plan !is StoryEditPlan.Ready) return (plan as StoryEditPlan.Refused).reason
        val before = stories.cachedStories().firstOrNull { it.id == opening.postId }
        if (before != null) stories.adoptPublished(plan.optimistic)
        return when (val result = posts.update(opening.postId, plan.request)) {
            is NetworkResult.Success -> {
                stories.adoptPublished(result.data.copy(isViewedByMe = true))
                null
            }
            is NetworkResult.Failure -> {
                before?.let { stories.adoptPublished(it) }
                StoryEditErrors.FAILED
            }
        }
    }

    /** Les images réglées pendant l'édition partent cuites, avant l'écriture (#13841) ; `null` si une copie ne part pas. */
    private suspend fun baked(state: StoryComposerUiState): StoryComposerUiState? = lookOven?.uploaded(state) ?: state.takeIf { lookOven == null }

    private suspend fun rebased(opening: StoryEditOpening, state: StoryComposerUiState, language: String): StoryEditPlan {
        val served = reader.read(opening.postId)?.takeIf { it.post.type == STORY && it.post.isMine() }
            ?: return StoryEditPlan.Refused(StoryEditErrors.OFFLINE)
        return StoryEditMerge.plan(opening.copy(served = served.effects), state, language)
    }

    private fun ApiPost.isMine(): Boolean = author?.id != null && author?.id == session.currentUserId

    private companion object {
        const val STORY = "STORY"
    }
}
