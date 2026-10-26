package me.meeshy.app.stories

/**
 * The navigation intent a committed drag on the story viewer resolves to. The decision itself
 * lives in [StoryGroupSwipeDecision] (horizontal) and [StoryVerticalSwipeDecision] (vertical).
 */
enum class StorySwipeAction { NextGroup, PreviousGroup, Dismiss, None }
