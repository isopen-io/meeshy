package me.meeshy.sdk.talkie

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.relation.TalkieEvent
import me.meeshy.sdk.playback.RecordingSessionController
import me.meeshy.sdk.socket.RelationSocketEventsManager

/**
 * Fabrique un [TalkieSender] par écran (fiche, en-tête de conversation), sur la portée de son ViewModel : le vrai micro,
 * la socket et la copie vocale de l'app.
 */
@Singleton
class TalkieSenderFactory @Inject constructor(
    @ApplicationContext private val context: Context,
    private val recordingSession: RecordingSessionController,
    private val emitter: TalkieSocketEmitter,
    private val copies: TalkieVoiceCopyFactory,
    private val sockets: RelationSocketEventsManager,
    private val toasts: FeedbackToastCenter,
) {
    /** La portée qui survit aux écrans : une prise de parole se termine même quand son écran s'en va. */
    private val detached = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /** L'émetteur d'un écran et ce qu'il partage avec les autres (retrait, bandeaux, arrêt). */
    fun control(scope: CoroutineScope): TalkieSendControl = TalkieSendControl(create(scope), toasts, scope, detached)

    fun create(scope: CoroutineScope): TalkieSender = TalkieSender(
        emitter = emitter,
        capture = TalkieMicCapture(context, recordingSession),
        copier = copies.create(),
        endedEvents = sockets.talkie.filterIsInstance<TalkieEvent.Closed>().map { it.ended },
        scope = scope,
    )
}

/**
 * Qui me parle en talkie EN CE MOMENT (#17315) : les émetteurs des prises de parole qui sortent chez moi. Le centre de
 * réception de l'app l'écrit ; l'en-tête d'un direct le lit pour donner la barre à la voix du pair.
 */
@Singleton
class TalkieSpeakingPeers @Inject constructor() {
    private val _speaking = MutableStateFlow<Set<String>>(emptySet())
    val speaking: StateFlow<Set<String>> = _speaking.asStateFlow()

    fun update(userIds: Set<String>) {
        _speaking.value = userIds
    }
}
