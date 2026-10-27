import Foundation
import MeeshySDK
import MeeshyUI

/// **Remplacer la source d'un média posé, côté meuble** (#12590) — le miroir de
/// `ComposerMediaRetraction` : la retouche rend un fichier neuf pour un média déjà posé,
/// et les huit porteurs du document doivent le suivre À SA PLACE, d'un bloc.
///
/// La règle est pure : elle CALCULE les porteurs et dit quels fichiers la pré-montée doit
/// oublier. `ComposerMediaSwapRun` l'applique, dans l'ordre de la rétraction.
///
/// Ce qui est re-clé de l'ancienne URL à la nouvelle : le rôle (qui est aussi la garde
/// d'idempotence de la pose — sans lui le tour de dérivation suivant re-poserait le fichier),
/// l'index des fondations (qui garde la tuile d'un fond en Post), la marque du rail, la légende.
/// Le pont `source → objet` et l'alternative suivent le NOUVEL objet. La transcription de
/// l'ancien fichier s'en va : son son a pu être coupé.
///
/// **Un fichier encore peint ailleurs reste** (une duplication peint le même fichier) : on
/// l'y garde, et le nouveau s'AJOUTE — jeter l'ancien ferait publier un clone sans fichier.
nonisolated struct ComposerMediaSwap: Equatable, Sendable {

    let porteurs: ComposerMediaPorters
    /// Les fichiers que la pré-montée doit oublier — vide quand l'ancien est encore peint ailleurs.
    let forgottenURLs: Set<URL>

    static func swapping(_ porteurs: ComposerMediaPorters,
                         oldURL: URL?,
                         newMedia: ComposerDocumentMedia,
                         oldObjectId: String,
                         newObjectId: String,
                         census: ComposerCanvasCensus = .empty) -> ComposerMediaSwap {
        guard let oldURL else {
            return ComposerMediaSwap(porteurs: porteurs, forgottenURLs: oldFile(of: oldObjectId, census: census))
        }
        let survivants = census.survivors(excluding: [oldObjectId])
        let peints = Set(survivants.compactMap(\.fileURL))
        let ancienFichier = census.fileURL(of: oldObjectId)
        let gardee = peints.contains(oldURL) || (ancienFichier.map(peints.contains) ?? false)

        var neufs = porteurs
        neufs.localMedia = gardee
            ? porteurs.localMedia + [newMedia]
            : ComposerMediaOrder.replacing(porteurs.localMedia, at: oldURL, with: newMedia)
        let nouvelle = newMedia.url
        neufs.roleByURL = rekeyed(porteurs.roleByURL, from: oldURL, to: nouvelle, keepingOld: gardee)
        neufs.slideIdByMediaURL = rekeyed(porteurs.slideIdByMediaURL, from: oldURL, to: nouvelle, keepingOld: gardee)
        neufs.captions = rekeyed(porteurs.captions, from: oldURL, to: nouvelle, keepingOld: gardee)
        neufs.railPosedURLs = porteurs.railPosedURLs.contains(oldURL)
            ? (gardee ? porteurs.railPosedURLs : porteurs.railPosedURLs.subtracting([oldURL])).union([nouvelle])
            : porteurs.railPosedURLs
        neufs.objectIdBySource = porteurs.objectIdBySource
        neufs.objectIdBySource[nouvelle] = newObjectId
        neufs.altsByObjectId = porteurs.altsByObjectId
        if let alt = neufs.altsByObjectId.removeValue(forKey: oldObjectId) {
            neufs.altsByObjectId[newObjectId] = alt
        }
        if gardee {
            let repreneur = survivants.first { $0.fileURL == oldURL || $0.fileURL == ancienFichier }
            neufs.objectIdBySource[oldURL] = repreneur?.id
            if let repreneur, let alt = porteurs.altsByObjectId[oldObjectId] {
                neufs.altsByObjectId[repreneur.id] = alt
            }
        } else {
            neufs.objectIdBySource.removeValue(forKey: oldURL)
            neufs.transcriptions = porteurs.transcriptions.filter { $0.key != oldURL }
        }
        return ComposerMediaSwap(porteurs: neufs, forgottenURLs: gardee ? [] : oldFile(of: oldObjectId, census: census).union([oldURL]))
    }

    private static func oldFile(of objectId: String, census: ComposerCanvasCensus) -> Set<URL> {
        census.fileURL(of: objectId).map { [$0] } ?? []
    }

    private static func rekeyed<Valeur>(_ carte: [URL: Valeur], from ancienne: URL, to nouvelle: URL,
                                        keepingOld: Bool) -> [URL: Valeur] {
        guard let valeur = carte[ancienne] else { return carte }
        var neuve = carte
        if !keepingOld { neuve.removeValue(forKey: ancienne) }
        neuve[nouvelle] = valeur
        return neuve
    }
}

/// **Le remplacement, APPLIQUÉ — dans l'ordre de la rétraction** : la pré-montée d'abord (elle
/// oublie l'ancien fichier), les porteurs d'un bloc, le SDK en DERNIER. C'est
/// `adaptiveOnChange(of: documentLocalMedia)` qui relance ensuite la dérivation : appeler le
/// SDK avant la ferait courir sur des index encore pleins de l'ancien fichier.
@MainActor
enum ComposerMediaSwapRun {

    /// - Returns: l'identifiant du média remplaçant, `nil` (sans rien toucher) quand le modèle
    ///   refuse le remplacement.
    @discardableResult
    static func apply(objectId: String,
                      delivered: ComposerReturnedFile,
                      store: ComposerMediaPorterStore,
                      preUploads: ComposerPreUploadRegistry,
                      viewModel: StoryComposerViewModel,
                      newObjectId: String = UUID().uuidString) -> String? {
        guard StoryMediaSourceSwap.canSwap(objectId, to: delivered.source, in: viewModel) else { return nil }
        let census = ComposerCanvasCensus.of(viewModel.slides)
        let ancienne = store.porters.objectIdBySource.first { $0.value == objectId }?.key
        let remplacement = ComposerMediaSwap.swapping(
            store.porters,
            oldURL: ancienne,
            newMedia: delivered.media,
            oldObjectId: objectId,
            newObjectId: newObjectId,
            census: census)
        remplacement.forgottenURLs.forEach { preUploads.forget(url: $0) }
        store.porters = remplacement.porteurs
        return StoryMediaSourceSwap.swap(objectId, to: delivered.source, as: newObjectId, in: viewModel)
    }
}

/// Le fichier que « Terminé » a écrit pour le média remplaçant, et ce qu'il faut en dire au
/// document (`media`) et au modèle de la scène (`source`).
struct ComposerReturnedFile {
    let media: ComposerDocumentMedia
    let source: StoryMediaSourceSwap.Source
}
