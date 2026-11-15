package me.meeshy.feature.kit

import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry

/**
 * La règle de `KitRegistryGuardTest`, sans disque : le registre, le catalogue et ce que le disque porte entrent en
 * paramètres, les problèmes sortent en phrases. Miroir de `KitRegistryAudit` (iOS).
 */
internal object KitRegistryAudit {

    data class Lot(val key: String, val name: String, val target: String)

    /** Ce que le disque porte : les chemins (relatifs à la racine du dépôt) qui existent, et les images sous `snapshots/`. */
    data class Disk(val existing: Set<String>, val images: List<String>)

    const val WITNESS_FOLDER: String = "apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/component/kit"

    /** Les chemins que la garde demande au disque : la cible que le REGISTRE déclare et le témoin de chaque lot. */
    fun candidatePaths(lots: List<Lot>): List<String> = lots.flatMap { listOf(it.target, witnessPath(it.name)) }

    fun witnessPath(name: String): String = "$WITNESS_FOLDER/${name}Test.kt"

    fun problems(
        lots: List<Lot>,
        entries: List<MeeshyKitCatalogEntry>,
        boardViewIds: Set<String>,
        disk: Disk,
    ): List<String> =
        sequenceProblems(lots, entries) + lots.flatMap { lot ->
            entries.firstOrNull { it.key == lot.key }?.let { lotProblems(lot, it, boardViewIds, disk) }.orEmpty()
        }

    private fun sequenceProblems(lots: List<Lot>, entries: List<MeeshyKitCatalogEntry>): List<String> =
        if (lots.map { it.key } == entries.map { it.key } && lots.map { it.name } == entries.map { it.name }) {
            emptyList()
        } else {
            listOf("le catalogue ne porte pas les clés et les noms du registre, dans l'ordre")
        }

    private fun lotProblems(lot: Lot, entry: MeeshyKitCatalogEntry, boardViewIds: Set<String>, disk: Disk): List<String> {
        if (lot.target !in disk.existing) {
            return if (entry.isDelivered) listOf("${lot.key} ${lot.name} : la cible ${lot.target} n'existe pas, l'entrée doit être vide") else emptyList()
        }
        if (!entry.isDelivered) return listOf("${lot.key} ${lot.name} : la cible existe, l'entrée est vide")
        return witnessProblems(lot, disk) + boardViewProblems(lot, entry, boardViewIds) + imageProblems(lot, entry, disk)
    }

    private fun witnessProblems(lot: Lot, disk: Disk): List<String> =
        if (witnessPath(lot.name) in disk.existing) emptyList() else listOf("${lot.key} : le témoin ${lot.name}Test est absent")

    private fun boardViewProblems(lot: Lot, entry: MeeshyKitCatalogEntry, boardViewIds: Set<String>): List<String> =
        entry.states.mapNotNull { it.boardView }
            .filter { it !in boardViewIds }
            .map { "${lot.key} : la vue $it n'est pas dans la table S de la planche" }

    private fun imageProblems(lot: Lot, entry: MeeshyKitCatalogEntry, disk: Disk): List<String> {
        val expected = entry.states.flatMap { state -> KitSnapshot.variants(state).map { KitSnapshot.imageStem(state.id, it) } } +
            listOf(KitSnapshot.Variant.GrandePolice, KitSnapshot.Variant.Rtl).map { KitSnapshot.imageStem(KitSnapshot.BOARD_ID, it) }
        return expected
            .filter { stem -> disk.images.none { it.startsWith("${lot.name}/$stem") && it.endsWith(".png") } }
            .map { "${lot.key} : l'image ${lot.name}/$it est absente" }
    }
}
