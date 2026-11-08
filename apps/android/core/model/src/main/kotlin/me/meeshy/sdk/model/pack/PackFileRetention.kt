package me.meeshy.sdk.model.pack

import kotlinx.serialization.Serializable

/**
 * **Ce qu'un pack a rangé dans le magasin adressé par contenu** : ses fichiers communs (contrat, chaînes, couverture) et,
 * par cadre, les siens (vignette, couches). Un même fichier peut appartenir à plusieurs packs : son nom est son empreinte.
 */
@Serializable
data class PackFileManifest(
    val slug: String,
    val files: Set<String>,
    val frames: Map<String, Set<String>> = emptyMap(),
) {
    val allFiles: Set<String> get() = frames.values.fold(files) { acc, frame -> acc + frame }
}

/** Ce qu'un élagage efface, et les packs que l'index peut oublier. */
data class PackPrunePlan(val files: Set<String>, val forgottenPacks: Set<String>)

/**
 * **La loi de l'élagage, pure** — miroir de `PackFileRetention` (iOS) : un fichier ne part que si AUCUN pack retenu
 * (installé par l'un des comptes connus sur l'appareil, ou tenu par un bail) ne le référence, ni aucun cadre gardé dans
 * un carnet. Un fichier qu'aucun manifeste ne décrit n'est jamais effacé : ce qu'on ne connaît pas, on le garde.
 */
object PackFileRetention {
    fun plan(
        manifests: List<PackFileManifest>,
        retainedPacks: Set<String>,
        referencedFrames: Set<String>,
    ): PackPrunePlan {
        val kept = manifests.map { it.slug to keptFiles(it, retainedPacks, referencedFrames) }
        val keep = kept.fold(emptySet<String>()) { acc, (_, files) -> acc + files }
        val known = manifests.fold(emptySet<String>()) { acc, manifest -> acc + manifest.allFiles }
        val forgotten = kept.filter { it.second.isEmpty() }.map { it.first }.toSet()
        return PackPrunePlan(files = known - keep, forgottenPacks = forgotten)
    }

    private fun keptFiles(manifest: PackFileManifest, retainedPacks: Set<String>, referencedFrames: Set<String>): Set<String> {
        if (manifest.slug in retainedPacks) return manifest.allFiles
        val referenced = manifest.frames.filterKeys { it in referencedFrames }
        if (referenced.isEmpty()) return emptySet()
        return referenced.values.fold(manifest.files) { acc, frame -> acc + frame }
    }
}
