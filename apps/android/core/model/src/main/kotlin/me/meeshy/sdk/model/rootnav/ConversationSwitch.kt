package me.meeshy.sdk.model.rootnav

/**
 * Ce que l'ouverture de la conversation [targetId] fait de la pile, selon la conversation
 * actuellement affichee. Miroir de iOS `Router.navigateToConversation` + `.id(conv.id)` : la pile
 * est REMPLACEE en une mutation, donc depuis A un tap sur la notification de B reutiliserait la
 * meme vue — l'identite par conversation force le demontage de celle de A (vidage de son
 * brouillon) et une vue neuve pour B.
 */
data class ConversationSwitchPlan(
    /** Vrai : la pile est remplacee par la seule conversation cible. */
    val replacesStack: Boolean,
    /** La conversation dont la vue est detruite et dont le brouillon est vide ; `null` si aucune. */
    val teardownConversationId: String?,
    /** Vrai : la vue affichee est deja la bonne, rien a recreer. */
    val reusesCurrentScreen: Boolean,
)

object ConversationSwitch {

    fun plan(displayedConversationId: String?, targetId: String): ConversationSwitchPlan = when (displayedConversationId) {
        null -> ConversationSwitchPlan(replacesStack = true, teardownConversationId = null, reusesCurrentScreen = false)
        targetId -> ConversationSwitchPlan(replacesStack = false, teardownConversationId = null, reusesCurrentScreen = true)
        else -> ConversationSwitchPlan(replacesStack = true, teardownConversationId = displayedConversationId, reusesCurrentScreen = false)
    }
}

/**
 * Un contexte ephemere pose avant l'ouverture d'une conversation (contexte de reponse en attente,
 * mode de lecture force) : il est CONSOMME a l'arrivee puis remis a nul, jamais ecrit en
 * preference. Une seconde lecture rend `null`.
 */
class PendingRouteContext<T : Any> {
    private var value: T? = null

    fun set(newValue: T?) {
        value = newValue
    }

    fun consume(): T? {
        val current = value
        value = null
        return current
    }
}

/** Le registre des contextes d'ouverture que la destination conversation consomme. */
class ConversationRouteContext<Reply : Any, Mode : Any> {
    val replyContext = PendingRouteContext<Reply>()
    val forcedMode = PendingRouteContext<Mode>()

    fun arm(reply: Reply? = null, mode: Mode? = null) {
        replyContext.set(reply)
        forcedMode.set(mode)
    }

    /** A l'arrivee dans la conversation : lit les deux contextes puis les remet a nul. */
    fun consumeOnArrival(): Pair<Reply?, Mode?> = replyContext.consume() to forcedMode.consume()
}

/**
 * La declaration de la conversation affichee au gestionnaire de notifications : dedupliquee,
 * et chaque CHANGEMENT retire les notifications systeme de l'ecran ouvert. Le panneau de bannieres
 * de l'application se tait par `ActiveConversationStore`.
 */
class ActiveConversationReporting(
    private val declare: (String?) -> Unit,
    private val clearSystemNotifications: (String) -> Unit,
) {
    private var reported: String? = null

    fun report(conversationId: String?) {
        val normalized = conversationId?.takeIf { it.isNotBlank() }
        if (normalized == reported) return
        reported = normalized
        declare(normalized)
        normalized?.let(clearSystemNotifications)
    }
}
