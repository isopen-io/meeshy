package me.meeshy.sdk.model.game

/**
 * **Le bandeau revient quand quelque chose change** (#17366, retouche 3) — hors de l'ouverture de l'app, le bandeau du
 * joueur revient quelques secondes quand deux lectures successives du bloc servi disent qu'un acte vient d'être
 * réalisé, que l'Offrande vient d'être prête ou que la Flamme vient de passer à risque.
 *
 * Miroir de `bannerRecall` (`packages/shared/utils/game/banner-recall.ts`) et de `GameBannerRecall` iOS
 * (`packages/MeeshySDK/.../Game/GameAttention.swift`), rejoué sur les mêmes cas. Un signal déjà levé ne rappelle pas
 * deux fois ; ce qui retombe ne rappelle rien ; la première lecture non plus. Aucune notification n'en découle
 * (#17368). Le bandeau Android qui la lira est l'affaire de #18230.
 */
public data class GameBannerMoment(val actsDone: Int, val attention: GameAttention) {
    public companion object {
        public fun of(game: GameBlock?, hidden: Boolean): GameBannerMoment? {
            if (hidden || game == null) return null
            return GameBannerMoment(
                actsDone = GameActsRing.of(game, hidden = false)?.done ?: 0,
                attention = GameAttention.of(game, hidden = false),
            )
        }
    }
}

public enum class GameBannerRecall {
    OfferingReady,
    Act,
    FlameAtRisk,
    ;

    public companion object {
        /** Le temps pendant lequel le bandeau rappelé reste à l'écran (`PLAYER_BANNER_RECALL_MS` du web). */
        public const val DURATION_MS: Long = 5_000L

        /** Ce qui vient de naître entre deux lectures, par ordre d'importance ; `null` ⇒ le bandeau ne revient pas. */
        public fun reason(before: GameBannerMoment?, after: GameBannerMoment?): GameBannerRecall? {
            if (before == null || after == null) return null
            if (after.attention.chestReady && !before.attention.chestReady) return OfferingReady
            if (after.actsDone > before.actsDone) return Act
            if (after.attention.flameAtRisk && !before.attention.flameAtRisk) return FlameAtRisk
            return null
        }
    }
}
