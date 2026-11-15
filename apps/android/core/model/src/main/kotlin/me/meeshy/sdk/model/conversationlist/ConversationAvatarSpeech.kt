package me.meeshy.sdk.model.conversationlist

/** Le libellé que TalkBack lit sur l'avatar d'une ligne : « Voir le profil de X » ou « Détails de Y ». */
enum class ConversationAvatarLabelKind { PROFILE, DETAILS }

/** Une action TalkBack de l'avatar d'une ligne : une entrée de son menu, ou sa story. */
sealed interface ConversationAvatarA11yAction {
    data class Menu(val role: AvatarMenuRole) : ConversationAvatarA11yAction

    data object ViewStory : ConversationAvatarA11yAction
}

/** Ce que TalkBack dit et propose sur l'avatar d'une ligne — miroir de iOS `ConversationAvatarSpeech` (#15887). */
object ConversationAvatarSpeech {

    /** Verrouillée comprise : le code est une étape, pas une destination. */
    fun labelKind(route: ConversationAvatarRoute): ConversationAvatarLabelKind =
        if (route.opensProfile) ConversationAvatarLabelKind.PROFILE else ConversationAvatarLabelKind.DETAILS

    /** Les entrées du menu de l'avatar, dans son ordre, puis sa story. */
    fun actions(roles: List<AvatarMenuRole>, hasStory: Boolean): List<ConversationAvatarA11yAction> =
        roles.map { ConversationAvatarA11yAction.Menu(it) } +
            listOfNotNull(ConversationAvatarA11yAction.ViewStory.takeIf { hasStory })
}
