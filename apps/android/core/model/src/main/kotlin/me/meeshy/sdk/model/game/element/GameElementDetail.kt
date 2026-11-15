package me.meeshy.sdk.model.game.element

import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.GameRarityEntry
import me.meeshy.sdk.model.game.GameMaterial
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.MythicSeatRef
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.progression.GameDetailFactKey
import me.meeshy.sdk.model.game.progression.PieceDetailFact
import me.meeshy.sdk.model.game.progression.ProgressionConcept

/** L'emblème d'un élément : une DONNÉE, que la feuille dessine en grand avec les briques du jeu. */
public sealed interface GameElementEmblem {
    public data class Concept(val concept: ProgressionConcept) : GameElementEmblem
    public data class Tier(val tier: LevelTierKey, val level: Int, val progress: Double) : GameElementEmblem
    public data class Rank(val rank: GloryRank, val division5: Int?, val mythic: MythicSeatRef?) : GameElementEmblem
    public data class Coin(val edition: MeeshEdition) : GameElementEmblem
    public data class Flame(val form: FlameFormKey?) : GameElementEmblem
    public data class Chest(val open: Boolean) : GameElementEmblem
    public data class Symbol(val symbol: GameElementSymbol) : GameElementEmblem

    /** La médaille d'un axe (iOS `.badge`) : sa famille, son glyphe, sa matière, allumée ou en empreinte, et la part parcourue. */
    public data class Badge(val axis: EngagementAxisKey, val material: GameMaterial, val lit: Boolean, val progress: Double) : GameElementEmblem

    /** La médaille d'un succès (une pastille) ou d'un défi (un record) : sa matière, allumée ou éteinte. */
    public data class Medal(val shape: GameElementMedalShape, val material: GameMaterial, val lit: Boolean) : GameElementEmblem

    /** Une coupe dessinée dans sa [material] : trophée, étape de saison ou étoile de Prestige. */
    public data class Trophy(val material: GameMaterial) : GameElementEmblem

    /** Le cachet d'une langue de l'Atlas : tamponné, ou à moitié encré. */
    public data class Stamp(val code: String, val stamped: Boolean) : GameElementEmblem

    /** La gemme de la ligue où l'on joue. */
    public data class League(val league: LeagueKey) : GameElementEmblem
}

/** La forme d'une médaille de succès ou de défi (iOS `GameBadgeShape`, hors l'accumulation des badges d'axe). */
public sealed interface GameElementMedalShape {
    /** [filled] pastilles pleines sur [total]. */
    public data class Collection(val filled: Int, val total: Int) : GameElementMedalShape

    public data object Record : GameElementMedalShape
}

/** Les pictogrammes que l'emblème dessine faute de brique dédiée. */
public enum class GameElementSymbol { Target, Snowflake, Seal }

/** L'état d'un élément, dit en toutes lettres par la feuille. */
public sealed interface GameElementStatus {
    /**
     * Obtenu ; [reachedAt] est la date SERVIE (ISO 8601), ou `null` quand la passerelle n'en sert pas. [phrase], quand
     * l'élément a SA façon de le dire (« Tamponné le … », le seul mois d'un visiteur), remplace « Obtenu le … ».
     */
    public data class Obtained(val reachedAt: String?, val phrase: GameText? = null) : GameElementStatus

    /** Verrouillé ; ce qu'il manque et la part parcourue, quand la passerelle les sert. */
    public data class Locked(val missing: GameText?, val progress: Double?) : GameElementStatus

    /** Une donnée : ni obtenue ni verrouillée ; sa valeur se dit, avec la jauge quand il y a une étape suivante. */
    public data class Value(val value: GameText, val progress: Double?) : GameElementStatus
}

/**
 * LES PRÉCISIONS D'UN ÉLÉMENT DU JEU (miroir de `GameElementDetail`, iOS) : emblème, nom, état, lignes de données et
 * rareté quand elle est servie. UN modèle nourrit UNE feuille ; une fonction pure par famille le bâtit
 * ([GameElementDetailsCore]) — aucun calcul, aucune donnée inventée.
 */
public data class GameElementDetail(
    val kind: GameElementKind,
    /** L'identité de CET élément : deux médailles ne partagent pas leurs précisions. */
    val key: String,
    val emblem: GameElementEmblem,
    val name: GameText,
    val status: GameElementStatus,
    val facts: List<PieceDetailFact> = emptyList(),
    val rarity: GameRarityEntry? = null,
    val concept: ProgressionConcept,
    /** La donnée dont une ligne parle, quand elle a sa phrase au catalogue. */
    val factKey: GameDetailFactKey? = null,
) {
    val id: String get() = "${kind.segment}:$key"

    val isObtained: Boolean get() = status is GameElementStatus.Obtained

    /** Un élément verrouillé se dessine désaturé : on le reconnaît, on ne l'a pas encore. */
    val isLockedLook: Boolean get() = status is GameElementStatus.Locked

    val progress: Double?
        get() = when (val s = status) {
            is GameElementStatus.Obtained -> null
            is GameElementStatus.Locked -> s.progress
            is GameElementStatus.Value -> s.progress
        }
}
