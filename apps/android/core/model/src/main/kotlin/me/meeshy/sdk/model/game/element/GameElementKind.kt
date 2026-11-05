package me.meeshy.sdk.model.game.element

import me.meeshy.sdk.model.game.progression.ProgressionConcept

/** Ce que la seconde phrase d'une famille dit : comment on OBTIENT l'élément, ou ce qu'il DONNE (le titre de la section en dépend). */
public enum class GameElementHow { Obtain, Gives }

/**
 * LES FAMILLES D'ÉLÉMENTS DU JEU — la liste FERMÉE du partagé (miroir de `GameElementKind`, iOS, et de
 * `GAME_DETAIL_FAMILIES`, web). [segment] est le `<famille>` des clés `game.detail.<famille>.what` / `.how` : les mêmes
 * clés sur les trois plateformes. `Fact` n'est pas une famille du catalogue (une pastille ou une ligne de donnée, dont la
 * phrase est `game.detail.fact.<donnée>`) ; `Player` non plus (une ligne du classement de la ligue, une seule phrase).
 */
public enum class GameElementKind(public val segment: String) {
    Badge("badge"),
    Achievement("succes"),
    Challenge("defi"),
    Trophy("trophy"),
    Stamp("stamp"),
    SeasonStep("step"),
    Seal("seal"),
    LeagueGem("gem"),
    PrestigeStar("star"),
    Rank("rank"),
    FlameForm("flame"),
    Freeze("freeze"),
    Mission("mission"),
    Chest("chest"),
    Coin("coin"),
    LevelRing("ring"),
    TreasuryTier("treasury"),
    ElanFamily("elan"),
    LevelStep("levelstep"),
    Fact("fact"),
    Player("player"),
    ;

    /** Comment on obtient l'élément, ou ce qu'il donne. */
    public val how: GameElementHow
        get() = when (this) {
            FlameForm, Mission, Chest, ElanFamily -> GameElementHow.Gives
            else -> GameElementHow.Obtain
        }

    /**
     * Le concept dont l'élément relève : c'est sa fiche que « Voir la fiche » ouvre. Celui d'une étape des niveaux dépend
     * de ce qu'elle demande, et celui d'une donnée est porté par la donnée : la famille seule ne le dit pas (`null`).
     */
    public val concept: ProgressionConcept?
        get() = when (this) {
            Badge -> ProgressionConcept.Badges
            Achievement -> ProgressionConcept.Succes
            Challenge -> ProgressionConcept.Defis
            Trophy -> ProgressionConcept.Showcase
            Stamp -> ProgressionConcept.Atlas
            SeasonStep, Seal -> ProgressionConcept.Season
            LeagueGem, Player -> ProgressionConcept.League
            PrestigeStar -> ProgressionConcept.Prestige
            Rank -> ProgressionConcept.Glory
            FlameForm, Freeze -> ProgressionConcept.Flame
            Mission, Chest -> ProgressionConcept.Missions
            Coin, TreasuryTier -> ProgressionConcept.Meesh
            LevelRing -> ProgressionConcept.Level
            ElanFamily -> ProgressionConcept.Elans
            LevelStep, Fact -> null
        }

    public companion object {
        /** Les dix-neuf familles du catalogue : tout sauf la donnée et la ligne de classement. */
        public val families: List<GameElementKind> = entries.filter { it != Fact && it != Player }
    }
}
