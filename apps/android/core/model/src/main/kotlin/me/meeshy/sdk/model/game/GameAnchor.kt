package me.meeshy.sdk.model.game

/** Les ancres que posent les composants du jeu sur Progression (iOS `GameAnchor`). */
public enum class GameAnchor(public val wire: String) {
    Level("game-level"),
    Missions("game-missions"),
    Flame("game-flame"),
    Treasury("game-treasury"),
    Rank("game-rank"),
    Mint("game-mint"),
    FlamePanel("game-flame-panel"),
}
