package me.meeshy.sdk.model.scene

/**
 * Jusqu'où un objet de scène grandit et rapetisse : une borne, tous les gestes.
 * Port de `SceneObjectScalePolicy` (iOS, #4722).
 *
 * Ce que les gestes (pincement du canvas, poignées, couches) partagent n'est
 * pas le geste mais la GRANDEUR qu'ils bornent : c'est elle qui a un site
 * unique, plutôt que des littéraux qui divergent au premier ajustement.
 *
 * [MIN_SCALE] garde l'objet saisissable (sous ce facteur une puce de 40 dp
 * tombe sous la moitié d'une cible tactile) ; [MAX_SCALE] l'empêche de couvrir
 * la scène entière et de masquer ce qu'il commente.
 */
object SceneObjectScalePolicy {

    const val MIN_SCALE: Double = 0.3
    const val MAX_SCALE: Double = 4.0

    private const val IDENTITY: Double = 1.0

    /**
     * L'échelle retenue pour [base] multipliée par le facteur du geste. La
     * composition et la borne sont le même appel : un `base` déjà hors bornes
     * ne se rattrape pas par un clamp appliqué après coup.
     */
    fun settled(base: Double, gestureScale: Double): Double = clamped(base * gestureScale)

    /**
     * La borne seule, pour ce qui lit une échelle déjà écrite (modèle ancien,
     * charge décodée) plutôt qu'un geste en cours.
     *
     * Une échelle nulle, négative, NaN ou infinie ne se ramène pas à la borne
     * basse mais à l'IDENTITÉ : zéro fait disparaître l'objet, un négatif le
     * retourne, et aucun geste ne produit ces valeurs. Les clamper à
     * [MIN_SCALE] rendrait visible, minuscule et inatteignable un objet dont la
     * donnée est simplement fausse.
     */
    fun clamped(scale: Double): Double =
        if (scale > 0.0 && scale.isFinite()) scale.coerceIn(MIN_SCALE, MAX_SCALE) else IDENTITY

    /** [settled] pour les gestes Compose, qui produisent des `Float`. */
    fun settled(base: Float, gestureScale: Float): Float =
        settled(base.toDouble(), gestureScale.toDouble()).toFloat()

    /** [clamped] pour les échelles stockées en `Float`. */
    fun clamped(scale: Float): Float = clamped(scale.toDouble()).toFloat()
}
