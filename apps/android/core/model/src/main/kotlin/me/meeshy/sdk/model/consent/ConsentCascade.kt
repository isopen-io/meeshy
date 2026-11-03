package me.meeshy.sdk.model.consent

/** Ce qu'une bascule change, montré à l'utilisateur AVANT confirmation. */
public data class ConsentCascadePlan(
    val purpose: ConsentPurpose,
    val granting: Boolean,
    /** Les finalités qui changeront d'état en plus de [purpose], dans l'ordre d'écriture. */
    val alsoChanged: List<ConsentPurpose>,
    /** Les finalités à écrire, dans l'ordre : octroi = racine d'abord ; retrait = enfants d'abord. */
    val writes: List<ConsentPurpose>,
) {
    val isCascading: Boolean get() = alsoChanged.isNotEmpty()
}

public object ConsentCascade {
    /**
     * Octroi : la finalité et chaque ancêtre manquant (le serveur pose aussi les ancêtres ; le client
     * les montre). Retrait : la finalité et chaque descendant encore accordé — le serveur ne retire
     * QUE la finalité visée, le client retire donc les enfants, les plus profonds d'abord.
     */
    public fun plan(purpose: ConsentPurpose, granting: Boolean, snapshot: ConsentSnapshot): ConsentCascadePlan {
        val writes = if (granting) {
            purpose.lineage.reversed().filter { !snapshot.isGranted(it) }
        } else {
            (purpose.descendants.filter(snapshot::isGranted)) + purpose.takeIf(snapshot::isGranted).let { listOfNotNull(it) }
        }
        return ConsentCascadePlan(purpose, granting, alsoChanged = writes.filter { it != purpose }, writes = writes)
    }
}
