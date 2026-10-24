package me.meeshy.sdk.model.game

/**
 * Un argument d'une phrase du jeu. Les nombres restent des ENTIERS jusqu'à la
 * résolution : c'est elle, et elle seule, qui les formate par la locale (un
 * seul trou par nombre) et qui choisit l'accord.
 */
public sealed interface GameTextArg {
    /** Un nombre écrit en plein par la locale (« 1 221 »). */
    public data class Count(val value: Int) : GameTextArg

    /** Un nombre écrit en compact par la locale (« 8,7 k » dès 10 000). */
    public data class Compact(val value: Int) : GameTextArg

    /** Un texte déjà prêt (un nom propre venu du serveur, une heure). */
    public data class Verbatim(val value: String) : GameTextArg

    /** Une autre phrase, résolue d'abord (« Niveau 9, Éclat »). */
    public data class Nested(val text: GameText) : GameTextArg
}

/**
 * Le DESCRIPTEUR d'une phrase du jeu : une clé fermée ([GameTextKey]) et ses
 * arguments. Aucune phrase n'est composée dans `:core:model` — les lois rendent
 * ceci, l'écran le résout dans la langue de l'interface (`GameCopy` côté
 * `:feature:game`). Une clé à accord (`GameTextForm.Agreement`) prend son
 * premier [GameTextArg.Count] comme entier d'accord.
 */
public data class GameText(val key: GameTextKey, val args: List<GameTextArg> = emptyList()) {

    public companion object {
        public fun of(key: GameTextKey, vararg args: GameTextArg): GameText = GameText(key, args.toList())

        /** Des phrases mises bout à bout, séparées par une espace (« 1 h 5 min »). */
        public fun joined(parts: List<GameText>): GameText =
            GameText(GameTextKey.JoinedBySpace, parts.map(GameTextArg::Nested))
    }
}
