package me.meeshy.app.composer.host

import me.meeshy.sdk.model.composer.ComposerOrigin

/**
 * Les portes de l'hôte unique, telles qu'elles voyagent dans une route. Seules les portes que l'hôte
 * porte DÉJÀ y entrent : une origine que son profil route encore vers l'ancien compositeur (republication,
 * édition) ne passe pas par ici — l'ancien chemin reste tant que tout n'est pas porté.
 *
 * Les valeurs ne portent que `[A-Za-z0-9_-]` : rien à encoder. Une route est une ENTRÉE EXTERNE de la navigation : ses identifiants sont des chaînes qu'un lien ou un autre écran
 * peut forger. Aucun n'est cru sans forme — un identifiant hors `[A-Za-z0-9_-]{1,64}` (ni `/`, ni `..`, ni encodage) ou
 * un jeton de graine qui n'a pas la forme de ceux que [ComposerSeedStore] fabrique ne produit AUCUNE route, et à la
 * lecture ouvre le compositeur du fil, vide : le repli sûr n'ouvre rien d'autre.
 */
object ComposerHostRoute {
    const val ORIGIN_ARG = "origin"
    const val ID_ARG = "id"
    const val SUB_ARG = "sub"
    const val SEED_ARG = "seed"
    const val PATTERN = "composer?$ORIGIN_ARG={$ORIGIN_ARG}&$ID_ARG={$ID_ARG}&$SUB_ARG={$SUB_ARG}&$SEED_ARG={$SEED_ARG}"

    private const val STORY_TRAY = "story"
    private const val FEED = "feed"
    private const val MOOD = "mood"
    private const val DRAFT = "draft"
    private const val SHARE = "share"
    private const val CONVERSATION_MEDIA = "conversation-media"
    private const val SOCIAL_MEDIA = "social-media"

    private val IDENTIFIER = Regex("[A-Za-z0-9_-]{1,64}")
    private val SEED_TOKEN = Regex("[A-Za-z0-9_-]{22,64}")

    /** Une porte lue : l'origine, et le jeton de la graine déposée par l'entrée externe (porte `Share` seule). */
    data class Door(val origin: ComposerOrigin, val seedToken: String? = null)

    fun route(origin: ComposerOrigin, seedToken: String? = null): String? {
        val wire = wire(origin) ?: return null
        val arguments = arguments(origin, seedToken) ?: return null
        return "composer?$ORIGIN_ARG=$wire" + arguments.joinToString("") { (name, value) -> "&$name=$value" }
    }

    fun origin(wire: String?, id: String? = null, sub: String? = null): ComposerOrigin = when (wire) {
        STORY_TRAY -> ComposerOrigin.StoryTray
        MOOD -> ComposerOrigin.MoodChip
        DRAFT -> identifier(id)?.let { ComposerOrigin.Draft(it) } ?: ComposerOrigin.FeedComposer
        CONVERSATION_MEDIA -> identifier(id)?.let { ComposerOrigin.ConversationMedia(it, identifier(sub)) } ?: ComposerOrigin.FeedComposer
        SOCIAL_MEDIA -> identifier(id)?.let { ComposerOrigin.SocialMedia(it, identifier(sub)) } ?: ComposerOrigin.FeedComposer
        else -> ComposerOrigin.FeedComposer
    }

    /** La porte d'une route reçue. `Share` sans graine reconnue n'a rien à composer : elle retombe sur le fil, comme une porte inconnue. */
    fun door(wire: String?, id: String? = null, sub: String? = null, seed: String? = null): Door {
        if (wire != SHARE) return Door(origin(wire, id, sub))
        return seedToken(seed)?.let { Door(ComposerOrigin.Share, it) } ?: Door(ComposerOrigin.FeedComposer)
    }

    fun seedToken(raw: String?): String? = raw?.takeIf { SEED_TOKEN.matches(it) }

    private fun identifier(raw: String?): String? = raw?.takeIf { IDENTIFIER.matches(it) }

    private fun arguments(origin: ComposerOrigin, seedToken: String?): List<Pair<String, String>>? = when (origin) {
        is ComposerOrigin.Draft -> identifier(origin.id)?.let { listOf(ID_ARG to it) }
        ComposerOrigin.Share -> seedToken(seedToken)?.let { listOf(SEED_ARG to it) }
        is ComposerOrigin.ConversationMedia -> identifier(origin.messageId)?.let { message ->
            listOf(ID_ARG to message) + listOfNotNull(identifier(origin.attachmentId)?.let { SUB_ARG to it })
        }
        is ComposerOrigin.SocialMedia -> identifier(origin.postId)?.let { post ->
            listOf(ID_ARG to post) + listOfNotNull(identifier(origin.mediaId)?.let { SUB_ARG to it })
        }
        else -> emptyList()
    }

    private fun wire(origin: ComposerOrigin): String? = when (origin) {
        ComposerOrigin.StoryTray -> STORY_TRAY
        ComposerOrigin.FeedComposer -> FEED
        ComposerOrigin.MoodChip -> MOOD
        is ComposerOrigin.Draft -> DRAFT
        ComposerOrigin.Share -> SHARE
        is ComposerOrigin.ConversationMedia -> CONVERSATION_MEDIA
        is ComposerOrigin.SocialMedia -> SOCIAL_MEDIA
        is ComposerOrigin.Repost, is ComposerOrigin.Edit -> null
    }
}
