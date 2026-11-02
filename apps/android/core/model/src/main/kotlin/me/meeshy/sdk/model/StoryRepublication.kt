package me.meeshy.sdk.model

/**
 * Une republication a-t-elle un contenu PROPRE ? Un média ou des effets à elle. Sans rien,
 * elle joue la story qu'elle republie — médias ET effets d'un seul tenant, jamais mêlés
 * (leurs `postMediaId` se répondent). Miroir de `StoryEffects.republicationHasOwnContent`
 * (StoryItem.swift).
 */
public fun republicationHasOwnContent(own: StoryEffects?, ownMediaIsEmpty: Boolean): Boolean =
    !ownMediaIsEmpty || own != null

/**
 * Les effets qu'une publication JOUE : les siens, ou ceux de sa source quand l'enveloppe est
 * vide. Site unique de ce repli (lecteur, pont du détail, carte du fil).
 */
public fun playedEffects(own: StoryEffects?, ownMediaIsEmpty: Boolean, source: StoryEffects?): StoryEffects? =
    if (republicationHasOwnContent(own, ownMediaIsEmpty)) own else source

/** La story que ce post republie, quand c'en est une. */
public val FeedPost.republishedStory: RepostContent?
    get() = repost?.takeIf { it.type.orEmpty().uppercase() == "STORY" }

/** Les effets que ce post JOUE — ceux qu'annonce la carte du fil, comme le détail et le lecteur. */
public val FeedPost.playedStoryEffects: StoryEffects?
    get() = playedEffects(own = storyEffects, ownMediaIsEmpty = media.isEmpty(), source = republishedStory?.storyEffects)
