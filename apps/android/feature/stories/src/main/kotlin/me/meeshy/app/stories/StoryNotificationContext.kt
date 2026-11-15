package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryViewerInitialAction
import me.meeshy.sdk.model.story.StoryNotificationContext

/**
 * Le contrat d'arguments de la route de l'écran cible d'une notification de story : le nom des arguments, et la
 * (dé)sérialisation de l'instantané [StoryNotificationContext] qui voyage avec le toucher (miroir de iOS
 * `StoryNotificationContext`, `Codable`). Tout est facultatif : une route sans contexte se dessine quand même.
 */
object StoryNotificationTargetArgs {
    const val STORY_ID: String = "storyId"
    const val ACTION: String = "action"
    const val COMMENT_ID: String = "commentId"
    const val PARENT_COMMENT_ID: String = "parentCommentId"
    const val ACTOR_NAME: String = "actorName"
    const val ACTOR_AVATAR: String = "actorAvatar"
    const val TRIGGER: String = "trigger"
    const val EMOJI: String = "emoji"
    const val PREVIEW: String = "preview"
    const val AT: String = "at"

    const val TRIGGER_REACTION: String = "reaction"
    const val TRIGGER_COMMENT: String = "comment"

    /** Les paires (argument, valeur) à poser sur la route ; les valeurs vides sont omises. */
    fun encode(context: StoryNotificationContext): List<Pair<String, String>> {
        val trigger = when (val t = context.trigger) {
            is StoryNotificationContext.Trigger.Reaction -> listOf(TRIGGER to TRIGGER_REACTION, EMOJI to t.emoji)
            is StoryNotificationContext.Trigger.Comment -> listOf(TRIGGER to TRIGGER_COMMENT, PREVIEW to t.preview)
        }
        return (
            listOf(
                ACTOR_NAME to context.actorDisplayName,
                ACTOR_AVATAR to context.actorAvatar.orEmpty(),
                AT to context.occurredAtMillis.toString(),
            ) + trigger
            ).filter { it.second.isNotBlank() }
    }

    fun decode(read: (String) -> String?, nowMillis: Long): StoryNotificationContext {
        fun arg(name: String): String? = read(name)?.takeIf { it.isNotBlank() }
        val trigger = if (arg(TRIGGER) == TRIGGER_REACTION) {
            StoryNotificationContext.Trigger.Reaction(arg(EMOJI) ?: StoryNotificationContext.DEFAULT_REACTION_EMOJI)
        } else {
            StoryNotificationContext.Trigger.Comment(arg(PREVIEW).orEmpty())
        }
        return StoryNotificationContext(
            actorAvatar = arg(ACTOR_AVATAR),
            actorDisplayName = arg(ACTOR_NAME).orEmpty(),
            trigger = trigger,
            occurredAtMillis = arg(AT)?.toLongOrNull() ?: nowMillis,
        )
    }

    fun action(read: (String) -> String?): StoryViewerInitialAction? = StoryViewerInitialAction.fromWire(read(ACTION))
}
