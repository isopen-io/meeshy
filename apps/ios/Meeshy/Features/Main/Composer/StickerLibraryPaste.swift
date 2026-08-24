import Foundation
import UIKit
import SwiftUI
import MeeshyUI

/// C8/V3-5 — le collage entre dans « Mes stickers ».
///
/// `PasteIntoComposer` ventile déjà un collage selon la règle O12 (deux axes :
/// la surface décide du budget et de la mémorisation, le type collé décide du
/// produit). Ce fichier consomme sa sortie pour la SEULE surface que rien
/// n'atteignait encore avant ce lot : `.stickers`. Sans lui, `PasteSurface
/// .stickers` et `StickerLibraryStore` (budget 64 Mo, index sidecar, éviction
/// LRU) étaient de l'infrastructure que rien n'instanciait ni n'invoquait.
///
/// `PasteIntoComposer.swift` reste le lecteur POUR TOUTE surface ; celui-ci
/// orchestre UNE destination précise — même partition que
/// `StoryCameraCaptureProvider`/`CameraView.swift` (le SDK expose une fabrique,
/// l'app la remplit).

/// Ce que le panneau « Mes stickers » ne peut PAS garder, une fois un collage
/// ventilé pour la surface `.stickers`.
///
/// **Pourquoi ce n'est pas `ComposerPasteExclusion` (`PasteIntoComposer.swift`)
/// réutilisé.** Ce dernier traite `batch.scene` comme HÉBERGÉ — vrai pour la
/// scène d'une story, faux ici : un panneau de stickers ne sait jouer ni une
/// vidéo ni un son. Le réutiliser tel quel aurait avalé en silence toute
/// vidéo ou tout son collé pendant que la sheet stickers est ouverte —
/// exactement ce que la directive du 2026-08-23 interdit. Type top-level, pas
/// nested — même forme que `ComposerPasteExclusion`.
nonisolated enum StickerLibraryPasteExclusion: Equatable {
    case unreadable([String])
    /// Vidéo, son, document, type inconnu : tout ce qui a un rendu ailleurs
    /// que dans une image reste hors de la bibliothèque. Un seul cas, un seul
    /// message — le panneau ne distingue pas la RAISON de l'exclusion,
    /// seulement le fait qu'aucune image n'en est sortie.
    case onlyImagesBecomeStickers([String])
    case textCannotBecomeASticker
}

nonisolated enum StickerLibraryPaste {

    /// « Mes stickers » est UNE bibliothèque, quel que soit l'endroit d'où le
    /// panneau s'ouvre (composer, tray, viewer). Une instance par appelant de
    /// `storyStickerLibraryProvided()` dupliquerait l'index en mémoire sans
    /// rien partager entre deux sheets ouvertes à des instants différents —
    /// chacune verrait une vue partielle et périmée du disque de l'autre.
    private static let store = StickerLibraryStore()

    /// Pure : aucun accès disque, aucun acteur. Testable sans monter la moindre
    /// vue — même granularité que `PasteIntoComposer.exclusions(in:)`.
    nonisolated static func exclusions(in batch: ComposerPasteBatch) -> [StickerLibraryPasteExclusion] {
        let nonImageNames = (batch.scene + batch.attachments).map(\.name)
        let candidates: [StickerLibraryPasteExclusion?] = [
            batch.unreadable.isEmpty ? nil : .unreadable(batch.unreadable),
            nonImageNames.isEmpty ? nil : .onlyImagesBecomeStickers(nonImageNames),
            batch.text.isEmpty ? nil : .textCannotBecomeASticker
        ]
        return candidates.compactMap { $0 }
    }

    @MainActor
    private static func announceWhatCannotBeKept(_ batch: ComposerPasteBatch) {
        for exclusion in exclusions(in: batch) {
            switch exclusion {
            case .unreadable(let names):
                ComposerIngestFeedback.showFailure(names: names)
            case .onlyImagesBecomeStickers(let names):
                let joined = names.joined(separator: ", ")
                FeedbackToastManager.shared.showError(
                    String(localized: "composer.paste.onlyImagesBecomeStickers",
                           defaultValue: "Seules les images deviennent des stickers : \(joined)",
                           bundle: .main)
                )
            case .textCannotBecomeASticker:
                FeedbackToastManager.shared.showError(
                    String(localized: "composer.paste.textCannotBecomeASticker",
                           defaultValue: "Le texte ne devient pas un sticker",
                           bundle: .main)
                )
            }
        }
    }

    /// Persiste UNE image déjà ventilée dans `batch.stickers` — lit
    /// `PasteDestination.libraryWrite` plutôt que de retester `product ==
    /// .sticker` elle-même : c'est exactement ce que ce champ existe pour
    /// dire, et une seconde condition locale finirait par diverger de la
    /// table qui fait autorité (`PasteDestination.resolveProduct`).
    @MainActor
    private static func persistIfLibraryWrite(_ file: ComposerPastedFile) async -> StoryStickerLibraryItem? {
        let destination = PasteDestination.resolve(surface: .stickers, ingest: .image)
        guard destination.libraryWrite,
              let data = try? Data(contentsOf: file.url),
              let image = await StoryMediaLoader.shared.loadImage(
                  data: data, maxDimension: CGFloat(destination.maxSide))
        else { return nil }
        try? FileManager.default.removeItem(at: file.url)
        guard let encoded = image.pngData() else { return nil }
        let id = UUID().uuidString
        await store.save(encoded, id: id)
        return StoryStickerLibraryItem(id: id, thumbnail: image)
    }

    /// Les vignettes actuelles, du plus récent au plus ancien.
    @MainActor
    static func recents() async -> [StoryStickerLibraryItem] {
        var items: [StoryStickerLibraryItem] = []
        for id in await store.recentIDs() {
            guard let data = await store.data(forID: id),
                  let image = UIImage(data: data) else { continue }
            items.append(StoryStickerLibraryItem(id: id, thumbnail: image))
        }
        return items
    }

    /// Point d'entrée de la sheet « Mes stickers » : lit le presse-papier,
    /// annonce ce qui ne peut pas devenir un sticker, garde le reste, rend la
    /// bibliothèque à jour.
    @MainActor
    static func paste(_ providers: [NSItemProvider]) async -> [StoryStickerLibraryItem] {
        let batch = await PasteIntoComposer.resolve(providers, surface: .stickers)
        announceWhatCannotBeKept(batch)
        for file in batch.stickers {
            // L'échec PARLE, comme `PasteIntoComposer.sceneItems` : sans ce
            // toast, une image illisible disparaîtrait exactement comme un
            // collage avalé.
            if await persistIfLibraryWrite(file) == nil {
                ComposerIngestFeedback.showFailure(names: [file.name])
            }
        }
        return await recents()
    }
}

// MARK: - Injection dans le composer de story (SDK)

extension View {
    /// Fournit au composer de story (SDK) l'accès à « Mes stickers » — même
    /// doctrine que `storyPasteProvided` : le SDK ne réécrit ni le lecteur de
    /// presse-papier ni le magasin, il pose ce que l'app lui rend. Sans cet
    /// appel, la section « Mes stickers » de `StickerPickerView` n'est pas
    /// rendue (loi 4).
    func storyStickerLibraryProvided() -> some View {
        environment(\.storyStickerLibrary, StoryStickerLibraryProvider(
            recents: { await StickerLibraryPaste.recents() },
            paste: { providers in await StickerLibraryPaste.paste(providers) }
        ))
    }
}
