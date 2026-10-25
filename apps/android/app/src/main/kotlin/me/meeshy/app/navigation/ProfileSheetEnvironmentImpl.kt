package me.meeshy.app.navigation

import androidx.navigation.NavHostController
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.transform
import me.meeshy.app.conversations.ConversationStoryRing
import me.meeshy.app.profile.ProfileLiveSigns
import me.meeshy.app.profile.ProfileSheetEnvironment
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.status.statusForUser
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.toStoryGroups
import me.meeshy.ui.component.StoryRingState

/**
 * Les sources en direct que la fiche lit, découplées des singletons pour les tests : les entrées de
 * présence temps réel (mêmes flux que la liste de conversations), les groupes de stories, les
 * humeurs en cache et l'horloge.
 */
internal class ProfileLiveSources(
    val presence: Flow<UserStatusEvent>,
    val storyGroups: Flow<List<StoryGroup>>,
    val moods: () -> List<StatusEntry>,
    val nowMillis: () -> Long,
)

/**
 * Le [ProfileSheetEnvironment] réel, construit par `:app` (miroir des closures `presenceProvider`,
 * `storyRingState`, `moodEmoji` et `onViewStory` que la racine iOS passe à `UserProfileSheet`) :
 * les sorties de la feuille deviennent des navigations différées, et ses signes en direct viennent
 * des MÊMES sources que la liste de conversations — `user:status`, `presence:snapshot` et
 * `typing:start` forcé au vert pour la présence, le plateau de stories pour l'anneau, la barre
 * d'humeurs pour l'humeur. Aucune présence n'est fabriquée : sans entrée, la fiche retombe sur le
 * cliché REST du profil.
 */
class ProfileSheetEnvironmentImpl internal constructor(private val sources: ProfileLiveSources) {

    @Inject
    constructor(
        messageSocketManager: MessageSocketManager,
        typingPresenceRelay: TypingPresenceRelay,
        storyRepository: StoryRepository,
        statusBarCache: StatusBarCache,
        sessionRepository: SessionRepository,
        clock: CacheClock,
    ) : this(
        ProfileLiveSources(
            presence = merge(
                messageSocketManager.userStatus,
                typingPresenceRelay.forcedOnline,
                messageSocketManager.presenceSnapshot.transform { snapshot -> snapshot.users.forEach { emit(it) } },
            ),
            storyGroups = storyRepository.storiesStream()
                .mapNotNull { it.valueOrNull }
                .map { posts -> posts.toStoryGroups(currentUserId = sessionRepository.currentUserId, nowMillis = clock.nowMillis()) },
            moods = { statusBarCache.load(StatusFeedMode.FRIENDS).valueOrNull.orEmpty() },
            nowMillis = clock::nowMillis,
        ),
    )

    /**
     * Les signes en direct de [userId] : la dernière entrée de présence temps réel le concernant
     * (`null` tant qu'aucune n'est arrivée), l'anneau de SA story (aucun sans story active) et SON
     * humeur. Une source en panne n'éteint pas les autres.
     */
    fun signsFor(userId: String): Flow<ProfileLiveSigns> {
        val presence: Flow<UserStatusEvent?> = sources.presence
            .filter { it.userId == userId }
            .map<UserStatusEvent, UserStatusEvent?> { it }
            .onStart { emit(null) }
            .catch { emit(null) }
        val ring: Flow<StoryRingState> = sources.storyGroups
            .map { groups -> ConversationStoryRing.ringFor(userId, groups, sources.nowMillis()) }
            .onStart { emit(StoryRingState.None) }
            .catch { emit(StoryRingState.None) }
        return combine(presence, ring) { live, storyRing ->
            val mood = runCatching { sources.moods().statusForUser(userId) }.getOrNull()
            ProfileLiveSigns(
                livePresence = live,
                storyRing = storyRing,
                moodEmoji = mood?.moodEmoji?.takeIf { it.isNotBlank() },
                moodText = mood?.content?.takeIf { it.isNotBlank() },
            )
        }.distinctUntilChanged()
    }

    /** Les sorties de la fiche, chacune après fermeture et délai, plus ses signes en direct. */
    fun environment(
        host: ProfileSheetHostState,
        scope: CoroutineScope,
        navController: NavHostController,
    ): ProfileSheetEnvironment {
        val after: (() -> Unit) -> Unit = { navigate -> host.dismissThen(scope, navigate) }
        return ProfileSheetEnvironment(
            onOpenConversation = { id -> after { navController.navigate(Routes.chat(id)) } },
            onReport = { id, username -> after { navController.navigate(Routes.reportUser(id, username)) } },
            onViewPosts = { id -> after { navController.navigate(Routes.userPosts(id)) } },
            onCall = { request ->
                request.conversationId?.let { conversationId ->
                    after { navController.navigate(CallRoute.path(conversationId, request.displayName, request.isVideo)) }
                }
            },
            onViewStory = { id -> after { navController.navigate(Routes.story(id)) } },
            liveSigns = ::signsFor,
        )
    }
}
