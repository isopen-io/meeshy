package me.meeshy.sdk.model.scene.export

/**
 * Débit unique du pipeline d'export de story (miroir de `StoryExportFrameRate` iOS) : le bake,
 * l'intro de marque et la carte de fin partagent cette valeur, jamais un littéral local.
 */
public object StoryExportFrameRate {
    public const val FPS: Int = 30
    public const val FRAME_DURATION_MICROS: Long = 1_000_000L / FPS
}
