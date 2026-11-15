package me.meeshy.sdk.model.relation

import kotlinx.serialization.Serializable

/**
 * **« QUI EST PRÉVENU »** (#14064) — le cran d'entourage d'une action : jusqu'où une action se dit à mon entourage. Miroir
 * de `RELATION_AUDIENCE_CHOICES` (`packages/shared/utils/relation-levels.ts`), dans l'ordre de l'écran : du plus fermé
 * ([NOBODY]) au plus large ([PUBLIC]). [PUBLIC] n'envoie jamais à tout Meeshy : il nomme les mêmes personnes que
 * [COMMUNITY] (ADR gateway #13929, point 4).
 */
@Serializable
public enum class RelationAudienceChoice {
    NOBODY,
    BLOOD,
    CLOSE,
    FRIEND,
    ACQUAINTANCE,
    COMMUNITY,
    PUBLIC,
    ;

    public companion object {
        /** Le cran d'un niveau de l'échelle — le défaut d'une famille EST le niveau minimal de sa feature. */
        public fun of(level: RelationLevel): RelationAudienceChoice = valueOf(level.name)
    }
}

/** Une action relayée à l'entourage ; [wire] est son suffixe de clé (`circlePublication` + `Post`). */
public enum class CircleNotifyAction(public val wire: String) {
    POST("Post"),
    REEL("Reel"),
    STORY("Story"),
    MOOD("Mood"),
    REPOST("Repost"),
    SHARE("Share"),
    COMMENT("Comment"),
    REACTION("Reaction"),
    QUOTE("Quote"),
    REFERENCE("Reference"),
    MENTION("Mention"),
}

/**
 * Les trois familles de `CIRCLE_NOTIFY_FAMILIES`, leurs actions dans l'ordre partagé, et la feature de la loi qui en
 * donne le défaut (Proche, Proche, Sang). Dix-neuf clés en tout.
 */
public enum class CircleNotifyFamily(
    public val wire: String,
    public val feature: RelationFeature,
    public val actions: List<CircleNotifyAction>,
) {
    PUBLICATION(
        "Publication",
        RelationFeature.NOTIFY_NEW_CONTENT,
        listOf(
            CircleNotifyAction.POST,
            CircleNotifyAction.REEL,
            CircleNotifyAction.STORY,
            CircleNotifyAction.MOOD,
            CircleNotifyAction.REPOST,
            CircleNotifyAction.SHARE,
        ),
    ),
    ON_MY_CONTENT(
        "OnMyContent",
        RelationFeature.RELAY_COMMENTERS_ON_MY_POSTS,
        listOf(
            CircleNotifyAction.COMMENT,
            CircleNotifyAction.REACTION,
            CircleNotifyAction.SHARE,
            CircleNotifyAction.REPOST,
            CircleNotifyAction.QUOTE,
            CircleNotifyAction.REFERENCE,
            CircleNotifyAction.MENTION,
        ),
    ),
    ELSEWHERE(
        "Elsewhere",
        RelationFeature.RELAY_MY_COMMENTS_ELSEWHERE,
        listOf(
            CircleNotifyAction.COMMENT,
            CircleNotifyAction.REACTION,
            CircleNotifyAction.SHARE,
            CircleNotifyAction.QUOTE,
            CircleNotifyAction.REFERENCE,
            CircleNotifyAction.MENTION,
        ),
    ),
    ;

    /** Le cran servi à qui n'a rien réglé. */
    public val default: RelationAudienceChoice get() = RelationAudienceChoice.of(feature.minimumLevel)

    /** La clé plate de [action] (`notification.<clé>`), ex. `circlePublicationPost`. */
    public fun keyOf(action: CircleNotifyAction): String = "circle$wire${action.wire}"

    public val keys: List<String> get() = actions.map(::keyOf)
}

/**
 * Les crans réglés, une clé plate par action : seules les clés que la passerelle a servies ou que l'utilisateur a
 * choisies y sont ; une clé absente vaut le défaut de sa famille, comme la passerelle le lit pour un document antérieur.
 */
public object CircleNotify {
    public val KEYS: List<String> = CircleNotifyFamily.entries.flatMap { it.keys }

    public fun valueOf(
        chosen: Map<String, RelationAudienceChoice>,
        family: CircleNotifyFamily,
        action: CircleNotifyAction,
    ): RelationAudienceChoice = chosen[family.keyOf(action)] ?: family.default

    /** Le cran commun à toute la famille, ou `null` quand ses actions diffèrent (la ligne dit alors « Mixte »). */
    public fun summaryOf(chosen: Map<String, RelationAudienceChoice>, family: CircleNotifyFamily): RelationAudienceChoice? =
        family.actions.map { valueOf(chosen, family, it) }.distinct().singleOrNull()
}
