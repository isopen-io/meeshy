package me.meeshy.app.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDateTime
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationBannerFraming
import me.meeshy.sdk.model.NotificationBannerPresentation
import me.meeshy.sdk.model.NotificationToastDecision
import me.meeshy.sdk.model.NotificationToastPolicy
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.socket.MessageSocketManager

/** Une bannière prête à peindre, avec de quoi naviguer si on la touche. */
data class InAppBanner(
    val notificationId: String,
    val presentation: NotificationBannerPresentation,
    val avatarName: String,
    val avatarUrl: String?,
    val conversationId: String?,
    val postId: String?,
)

/**
 * **Le consommateur qui manquait à `NotificationToastPolicy` (#4457).**
 *
 * La politique portait la décision — dédoublonnage, écran actif, push + heures calmes — avec
 * ses tests, et n'avait AUCUN appelant de production : un `notification:new` reçu app ouverte
 * ne produisait rien de visible sur Android, pendant qu'iOS et le web affichaient les sept
 * cadrages. Une règle sans lecteur ne protège personne ; c'est la même forme que la garde
 * jamais montée ou le `Closes` qui ne ferme rien.
 *
 * Trois responsabilités, et une seule est à ce ViewModel :
 * - la DÉCISION appartient à [NotificationToastPolicy], qui est pure et testée ;
 * - le CADRAGE appartient à [NotificationBannerFraming], pure aussi, miroir des deux autres
 *   clients ;
 * - ce qui reste ici est l'ÉTAT — la fenêtre de dédoublonnage (« déjà vu dans les 2 dernières
 *   secondes » compare ENTRE les appels, donc ne peut pas vivre dans une fonction pure), le
 *   contexte de l'écran courant, et l'effacement automatique.
 *
 * Le nom LOCAL du groupe est résolu ici et nulle part ailleurs : renommage (`customName`) et
 * emoji favori n'existent que sur l'appareil, et c'est la seule pièce de la présentation que
 * le serveur ne peut pas composer.
 */
@HiltViewModel
class NotificationBannerViewModel @Inject constructor(
    private val messageSocketManager: MessageSocketManager,
    private val preferencesStore: NotificationPreferencesStore,
    private val conversationRepository: ConversationRepository,
) : ViewModel() {

    private val _banner = MutableStateFlow<InAppBanner?>(null)
    val banner: StateFlow<InAppBanner?> = _banner.asStateFlow()

    private var activeConversationId: String? = null
    private var activePostId: String? = null

    /**
     * Les identifiants déjà affichés, avec leur horodatage. Le socket et le push courent pour
     * le même événement : sans cette mémoire, la bannière s'afficherait deux fois.
     */
    private val shownAt = LinkedHashMap<String, Long>()

    init {
        viewModelScope.launch {
            messageSocketManager.notificationReceived.collect { notification ->
                handle(notification)
            }
        }
    }

    /**
     * L'écran courant. Une notification qui parle de la conversation OUVERTE se consomme en
     * silence — le lecteur la voit déjà arriver dans le fil.
     */
    fun setActiveContext(conversationId: String?, postId: String?) {
        activeConversationId = conversationId
        activePostId = postId
    }

    fun dismiss() {
        _banner.value = null
    }

    private suspend fun handle(notification: ApiNotification) {
        val now = System.currentTimeMillis()
        val decision = NotificationToastPolicy.decide(
            notification = notification,
            activeConversationId = activeConversationId,
            activePostId = activePostId,
            isDuplicateDelivery = isDuplicate(notification.id, now),
            preferences = preferencesStore.preferences.value,
            now = LocalDateTime.now(),
        )
        val shown = (decision as? NotificationToastDecision.Show)?.notification ?: return

        shownAt[shown.id] = now
        pruneDedupWindow(now)

        val conversationId = shown.context?.conversationId
        val conversation = conversationId?.let { id ->
            runCatching { conversationRepository.cachedConversations().first() }
                .getOrNull()
                ?.firstOrNull { it.id == id }
        }

        _banner.value = InAppBanner(
            notificationId = shown.id,
            presentation = NotificationBannerFraming.present(
                notification = shown,
                groupName = conversation?.preferences?.customName?.takeIf { it.isNotBlank() }
                    ?: conversation?.title,
                isDirect = (conversation?.type ?: shown.context?.conversationType)
                    .equals("direct", ignoreCase = true),
            ),
            avatarName = shown.actor?.displayName?.takeIf { it.isNotBlank() }
                ?: shown.actor?.username.orEmpty(),
            avatarUrl = shown.actor?.avatar ?: shown.context?.conversationAvatar,
            conversationId = conversationId,
            postId = shown.context?.postId ?: shown.metadata?.postId,
        )

        delay(VISIBLE_MS)
        if (_banner.value?.notificationId == shown.id) _banner.value = null
    }

    private fun isDuplicate(id: String, now: Long): Boolean {
        val previous = shownAt[id] ?: return false
        return now - previous < DEDUP_WINDOW_MS
    }

    /**
     * La carte est bornée dans le TEMPS et en TAILLE. Sans la seconde borne, une session
     * longue la ferait croître sans fin — une fuite lente qu'aucun écran ne révèle
     * (dimension 3 de la roadmap : « que reste-t-il en mémoire une fois l'écran quitté ? »).
     */
    private fun pruneDedupWindow(now: Long) {
        shownAt.entries.removeAll { now - it.value >= DEDUP_WINDOW_MS }
        while (shownAt.size > MAX_REMEMBERED) {
            val oldest = shownAt.keys.firstOrNull() ?: break
            shownAt.remove(oldest)
        }
    }

    private companion object {
        /** Même fenêtre qu'iOS : socket et push courent pour le même événement. */
        const val DEDUP_WINDOW_MS = 2_000L
        const val VISIBLE_MS = 4_000L
        const val MAX_REMEMBERED = 64
    }
}
