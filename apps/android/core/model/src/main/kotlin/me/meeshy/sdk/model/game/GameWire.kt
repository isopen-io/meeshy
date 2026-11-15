package me.meeshy.sdk.model.game

/**
 * L'en-tête de version du Jeu Meeshy. MIROIR de `GameRoutes` (iOS,
 * `packages/MeeshySDK/.../Game/GameRoutes.swift`) et de `game-routes.ts`.
 *
 * Absent, illisible ou inférieur à 2, la passerelle sert l'ancien comportement :
 * le client déclare ce qu'il sait lire, jamais plus.
 */
public object GameWire {
    public const val versionHeader: String = "X-Meeshy-Game-Version"

    /** La vague que ce binaire sait lire. */
    public const val waveVersion: Int = 2
}
