package me.meeshy.sdk.story

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.model.ObjectIdGuard
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.MarkStoryViewedPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.SendFailureClassifier
import me.meeshy.sdk.outbox.SendResult

/** Le « vu » d'une story, sans savoir comment il part : en ligne, ou mis en file ([StoryViewReporter]). */
fun interface StoryViewReporting {
    suspend fun report(storyId: String)
}

/**
 * Marque la story vue (iOS `markStoryViewed`) : le cache de la barre se grise d'abord (hors ligne comprise), puis la
 * requête part. Sans réponse du serveur, le « vu » entre dans la file — une ligne par story, quel que soit le nombre de
 * vues — et part au retour du réseau. Un refus définitif (story disparue) ne se rejoue pas.
 */
@Singleton
class StoryViewReporter internal constructor(
    private val stories: StoryRepository,
    private val outbox: OutboxRepository,
    private val flush: OutboxFlushScheduler,
    private val ledger: StoryViewedLedger,
    private val nowMillis: () -> Long,
) : StoryViewReporting {

    @Inject
    constructor(
        stories: StoryRepository,
        outbox: OutboxRepository,
        flush: OutboxFlushScheduler,
        ledger: StoryViewedLedger,
    ) : this(stories, outbox, flush, ledger, System::currentTimeMillis)

    /**
     * Le registre durable passe EN PREMIER (iOS #9804) : la vue est sur disque avant que l'app puisse être tuée, et
     * aucun réécrivain du cache du plateau ne peut l'effacer. Un identifiant local (`pending_…`) ne part jamais : le
     * serveur ne sait pas l'adresser, la ligne pourrirait en 500 — sa vue reste locale.
     */
    override suspend fun report(storyId: String) {
        ledger.record(storyId, nowMillis())
        if (!ObjectIdGuard.isValid(storyId)) return
        val failure = (stories.markViewed(storyId) as? NetworkResult.Failure) ?: return
        if (SendFailureClassifier.classify(failure.error) is SendResult.PermanentFailure) return
        outbox.enqueue(
            OutboxMutation(
                kind = OutboxKind.MARK_STORY_VIEWED,
                lane = OutboxLanes.STORY_VIEW,
                targetId = storyId,
                payload = MeeshyApi.json.encodeToString(MarkStoryViewedPayload.serializer(), MarkStoryViewedPayload()),
            ),
        )
        flush.schedule()
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface StoryViewReportingModule {
    @Binds
    fun viewReporting(impl: StoryViewReporter): StoryViewReporting
}
