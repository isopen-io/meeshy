package me.meeshy.app.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ActiveContextMatch
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.ConversationBannerName
import me.meeshy.sdk.model.NotificationBannerAvatar
import me.meeshy.sdk.model.NotificationBannerFraming
import me.meeshy.sdk.model.NotificationBannerPresentation
import me.meeshy.sdk.model.NotificationReadScope
import me.meeshy.sdk.model.NotificationToastDecision
import me.meeshy.sdk.model.NotificationToastPolicy
import me.meeshy.sdk.model.ToastDedupWindow
import me.meeshy.sdk.model.isDirectConversationType
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.notification.NotificationConsumptionService
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
    /**
     * `UserNotificationPreferences.showPreview` coupé (#4818) : [presentation] a déjà son
     * contenu masqué ([NotificationBannerPresentation.appliedPreviewSetting]), et ce drapeau
     * dit à [NotificationBannerHost] de peindre le libellé générique à la place — un `body`
     * naturellement vide (headline de relation, contenu sans texte) ne doit PAS déclencher
     * le même libellé, d'où le drapeau explicite plutôt qu'une inférence sur `body == null`.
     */
    val previewHidden: Boolean = false,
    /**
     * La notification d'un palier ou d'un événement du JEU (succès, badge, série, niveau, ligue…) : la toucher ouvre
     * l'écran que la carte de navigation du jeu nomme, et un palier SE CÉLÈBRE d'abord (iOS `RootNotificationNavigator`,
     * `pendingEngagementReveal`). `null` pour tout autre contenu.
     */
    val game: ApiNotification? = null,
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
 * Quatre responsabilités, et une seule est à ce ViewModel :
 * - la DÉCISION appartient à [NotificationToastPolicy], qui est pure et testée ;
 * - le DÉDOUBLONNAGE appartient à [ToastDedupWindow], pure et testée aussi;
 * - le CADRAGE appartient à [NotificationBannerFraming], pure aussi, miroir des deux autres
 *   clients ;
 * - ce qui reste ici est l'ÉTAT qui vit ENTRE les appels — l'instance courante de la fenêtre de
 *   dédoublonnage (avancée à chaque réception), le contexte de l'écran courant, et l'effacement
 *   automatique ; l'horloge passe par le seam injecté [NotificationToastClock].
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
    private val clock: NotificationToastClock,
    private val activeConversationStore: ActiveConversationStore,
    private val consumption: NotificationConsumptionService,
) : ViewModel() {

    private val _banner = MutableStateFlow<InAppBanner?>(null)
    val banner: StateFlow<InAppBanner?> = _banner.asStateFlow()

    private var activeConversationId: String? = null
    private var activePostId: String? = null

    /**
     * Les conversations OUVERTES dans d'autres fenêtres que la principale (tablette, fenêtres détachées) :
     * l'ensemble complète [activeConversationId], qui n'en nomme qu'une.
     */
    private var otherOpenConversationIds: Set<String> = emptySet()

    /**
     * Les identifiants déjà admis dans la fenêtre de dédoublonnage. Le socket et le push courent
     * pour le même événement : sans cette mémoire, la bannière s'afficherait deux fois. La décision
     * « déjà vu ? » et l'éviction sont le cœur PUR partagé [ToastDedupWindow] — la MÊME source de
     * vérité que l'orchestrateur de toast, plutôt qu'une carte re-codée ici. Ne reste que l'état
     * qui vit entre les appels : cette variable, avancée à chaque notification reçue.
     */
    private var dedupWindow = ToastDedupWindow.empty()

    /**
     * L'effacement automatique de la bannière courante. Un travail SÉPARÉ (et non un `delay` en
     * queue de `handle`) pour deux raisons : une bannière qui arrive pendant la fenêtre d'une
     * autre n'attend plus la fin des 4 s de la première (le collecteur reste libre), et une
     * bannière plus récente annule le minuteur de l'ancienne au lieu d'en hériter.
     */
    private var dismissJob: Job? = null

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
        // Publish the on-screen thread process-wide so the FCM push service — which has no
        // ViewModel — can suppress a foreground banner for the conversation being read.
        activeConversationStore.setActive(conversationId)
        activeConversationStore.setActivePost(postId)
        // A banner already on screen for the thread the reader just opened has said its piece —
        // the reader now sees the content in the fil, so pull it down. Same predicate as the
        // policy's: only the OPEN CONVERSATION is an exception; a post/story on screen no longer
        // silences (nor pulls down) a banner.
        val shown = _banner.value ?: return
        if (ActiveContextMatch.matchesOpenConversation(shown.conversationId, openConversationIds())) dismiss()
    }

    /** Les conversations ouvertes dans les AUTRES fenêtres (ensemble complet, remplace le précédent). */
    fun setOpenConversations(conversationIds: Set<String>) {
        otherOpenConversationIds = conversationIds
        val shown = _banner.value ?: return
        if (ActiveContextMatch.matchesOpenConversation(shown.conversationId, openConversationIds())) dismiss()
    }

    private fun openConversationIds(): Set<String> =
        otherOpenConversationIds + listOfNotNull(activeConversationId)

    /**
     * Toucher la bannière OUVRE son contenu : la notification est consommée (lue en local puis côté
     * serveur, comme une ligne de la cloche — iOS `NotificationToastManager.consume`), la bannière
     * tombe, et la bannière touchée est rendue à l'hôte pour qu'il navigue. `null` : plus de bannière.
     */
    fun onTapped(): InAppBanner? {
        val tapped = _banner.value ?: return null
        dismiss()
        viewModelScope.launch {
            runCatching { consumption.consume(NotificationReadScope.Single(tapped.notificationId)) }
        }
        return tapped
    }

    fun dismiss() {
        dismissJob?.cancel()
        dismissJob = null
        _banner.value = null
    }

    private suspend fun handle(notification: ApiNotification) {
        val admit = dedupWindow.admit(notification.id, clock.nowMillis())
        dedupWindow = admit.window
        val prefs = preferencesStore.preferences.value
        val decision = NotificationToastPolicy.decide(
            notification = notification,
            openConversationIds = openConversationIds(),
            isDuplicateDelivery = admit.isDuplicate,
            preferences = prefs,
        )
        val shown = (decision as? NotificationToastDecision.Show)?.notification ?: return

        val conversationId = shown.context?.conversationId
        val conversation = conversationId?.let { id ->
            // #5190 — a single bounded `WHERE id = :id` lookup instead of decoding
            // the ENTIRE cached conversation table just to find one row by id.
            runCatching { conversationRepository.conversationStream(id).first() }.getOrNull()
        }

        val groupName = ConversationBannerName.composed(
            customName = conversation?.preferences?.customName,
            title = conversation?.title,
            favoriteEmoji = conversation?.preferences?.reaction,
        )
        val isDirect = isDirectConversationType(conversation?.type ?: shown.context?.conversationType)
        val avatar = NotificationBannerAvatar.of(
            notification = shown,
            actorName = shown.actor?.displayName?.takeIf { it.isNotBlank() } ?: shown.actor?.username.orEmpty(),
            isDirect = isDirect,
            groupName = groupName ?: shown.context?.conversationTitle,
        )

        dismissJob?.cancel()
        _banner.value = InAppBanner(
            notificationId = shown.id,
            presentation = NotificationBannerFraming.present(
                notification = shown,
                groupName = groupName,
                isDirect = isDirect,
            ).appliedPreviewSetting(showPreview = prefs.showPreview),
            avatarName = avatar.name,
            avatarUrl = avatar.url,
            conversationId = conversationId,
            postId = shown.context?.postId ?: shown.metadata?.postId,
            previewHidden = !prefs.showPreview,
            game = shown.takeIf { NotificationDestinationResolver.resolve(it) is NotificationDestination.Game },
        )
        dismissJob = viewModelScope.launch {
            delay(VISIBLE_MS)
            if (_banner.value?.notificationId == shown.id) _banner.value = null
        }
    }

    private companion object {
        const val VISIBLE_MS = 4_000L
    }
}
