import Foundation
import UIKit
import SwiftUI
import MeeshySDK
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
    /// panneau s'ouvre (composer, tray, viewer) et quelle que soit
    /// l'alimentation — collage ici, contenu reçu dans `StickerLibraryReceive`
    /// juste en dessous. Une instance par appelant dupliquerait l'index en
    /// mémoire sans rien partager entre deux sheets ouvertes à des instants
    /// différents — chacune verrait une vue partielle et périmée du disque de
    /// l'autre. `fileprivate` : les deux alimentations la partagent, personne
    /// d'autre ne l'atteint.
    fileprivate static let store = StickerLibraryStore()

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
    ///
    /// Elle remet les OCTETS du fichier, jamais une image déjà décodée : ce
    /// qu'on garde est décidé par `keep(original:)` juste en dessous.
    @MainActor
    private static func persistIfLibraryWrite(_ file: ComposerPastedFile) async -> StoryStickerLibraryItem? {
        guard PasteDestination.resolve(surface: .stickers, ingest: .image).libraryWrite,
              let data = try? Data(contentsOf: file.url)
        else { return nil }
        defer { try? FileManager.default.removeItem(at: file.url) }
        return await keep(original: data)
    }

    /// **Garde une image dans la bibliothèque, animée si elle l'est** (#3956).
    ///
    /// Les octets d'ORIGINE sont remis à la règle, jamais l'image déjà décodée :
    /// c'est le ré-encodage `pngData()` d'une `UIImage` qui détruisait
    /// l'animation d'un GIF collé — trente images lues, une gardée, et rien nulle
    /// part pour signaler la perte.
    ///
    /// L'identifiant est un `UUID` par GESTE : le presse-papier ne dit rien de la
    /// provenance des octets, donc rien ici ne permet de reconnaître une image
    /// déjà collée. Un sticker REÇU, lui, porte un `postMediaId` — d'où l'id
    /// STABLE qu'en dérive `StoryStickerLibrary.libraryID(forPostMediaID:)`,
    /// préfixé pour que les deux espaces d'ids ne se croisent jamais.
    @MainActor
    private static func keep(original: Data) async -> StoryStickerLibraryItem? {
        // La moitié ANIMÉE est interrogée d'ABORD : décoder puis ré-encoder une
        // image fixe qu'un GIF n'utilisera jamais serait du travail pur perdu
        // sur le geste que l'utilisateur regarde.
        //
        // Le côté long est borné par la SURFACE (`PasteDestination`) pour
        // l'image FIXE seulement : les octets animés gardent leur résolution
        // native et se décodent au budget du site qui les peint.
        let bytes: Data
        if let animated = StickerLibraryArtwork.animatedBytesToKeep(original: original) {
            bytes = animated
        } else {
            let bound = PasteDestination.resolve(surface: .stickers, ingest: .image).maxSide
            guard let still = await StoryMediaLoader.shared.loadImage(
                    data: original, maxDimension: CGFloat(bound)),
                  let kept = StickerLibraryArtwork.keep(original: original,
                                                        stillPNG: still.pngData())
            else { return nil }
            bytes = kept.bytes
        }
        let id = UUID().uuidString
        await store.save(bytes, id: id)
        return StickerLibraryArtwork.item(id: id, bytes: bytes)
    }

    /// **La bibliothèque s'alimente aussi depuis une image DÉJÀ en main** —
    /// le sujet détouré d'une photo (#3955), qui n'a ni fichier collé ni octets
    /// d'origine, seulement un bitmap avec son canal alpha.
    ///
    /// Elle passe par le MÊME magasin et le même encodage PNG que le collage :
    /// une seconde queue d'écriture divergerait dès la première évolution du
    /// budget ou du format.
    @MainActor
    static func save(image: UIImage) async -> StoryStickerLibraryItem? {
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
                  // **Relire, c'est redécouvrir l'animation** : rien n'est
                  // persisté à côté des octets pour dire qu'ils animent, et
                  // c'est volontaire — un drapeau posé à côté d'un fichier
                  // remplacé mentirait.
                  let item = StickerLibraryArtwork.item(id: id, bytes: data)
            else { continue }
            items.append(item)
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

// MARK: - S5 — l'autre alimentation : un sticker REÇU

/// « Enregistrer ce sticker », depuis un contenu reçu.
///
/// Le collage était la SEULE alimentation de « Mes stickers » : une
/// bibliothèque qu'on ne pouvait remplir qu'en collant depuis le presse-papier
/// n'a de sens que pour qui possède déjà ses images. Recevoir un sticker et
/// pouvoir le garder ferme la boucle.
///
/// L'image copiée est celle du `PostMedia` du post — la même que celle qui est
/// PEINTE, par le même cache image que le rendu. Aucun second chemin de
/// chargement, aucune URL tierce, et surtout aucune seconde bibliothèque : le
/// magasin est celui du collage, à un `fileprivate` près.
nonisolated enum StickerLibraryReceive {

    /// Ce qu'un geste d'enregistrement a produit, pour UN sticker.
    enum Outcome: Equatable {
        case saved
        case alreadyInLibrary
        case failed
    }

    /// Ce que l'utilisateur s'entend dire pour l'ensemble du geste.
    enum Announcement: Equatable {
        case saved(Int)
        case alreadyInLibrary
        case failed
    }

    /// `nil` quand rien n'a été tenté : une annonce sans geste serait du bruit.
    ///
    /// L'échec prime sur le succès partiel — c'est la seule des trois annonces
    /// qui appelle une action de l'utilisateur (réessayer), et la taire
    /// derrière un « ajouté » lui ferait croire que tout est en bibliothèque.
    static func announcement(for outcomes: [Outcome]) -> Announcement? {
        guard !outcomes.isEmpty else { return nil }
        guard !outcomes.contains(.failed) else { return .failed }
        let saved = outcomes.filter { $0 == .saved }.count
        return saved > 0 ? .saved(saved) : .alreadyInLibrary
    }

    /// Les octets à garder, lus par le MÊME cache image que le rendu de la
    /// slide : l'image est le plus souvent déjà là, et l'écrire une seconde
    /// fois ailleurs ferait deux caches pour une image.
    ///
    /// **Les OCTETS d'abord, l'image ensuite** (#3956) : un sticker reçu peut
    /// être animé, et `image(for:)` n'en rendrait que la première image — la
    /// même perte que le collage, sur l'autre alimentation. On demande donc les
    /// octets au cache, et on ne retombe sur le chemin image que s'ils
    /// n'animent pas.
    ///
    /// PNG et non JPEG sur ce chemin de repli : un sticker est une image
    /// détourée, et `pngData()` est aussi ce qu'écrit le collage — la
    /// bibliothèque ne contient qu'une seule forme d'octets fixes. Le côté long
    /// est borné par la MÊME règle que le collage (`PasteDestination`), un
    /// sticker venu d'un autre client n'étant pas nécessairement déjà réduit.
    @MainActor
    private static func downloaded(_ urlString: String) async -> Data? {
        let bound = PasteDestination.resolve(surface: .stickers, ingest: .image).maxSide
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        // La moitié ANIMÉE de la règle, seule : sur ce chemin l'image fixe se
        // lit par le cache image juste en dessous, avec son budget — il n'y a
        // donc rien à lui donner tant qu'on ne sait pas s'il en faut une.
        if let bytes = try? await CacheCoordinator.shared.images.data(for: resolved),
           let animated = StickerLibraryArtwork.animatedBytesToKeep(original: bytes) {
            return animated
        }
        let image = await CacheCoordinator.shared.images.image(
            for: resolved, maxPixelSize: CGFloat(bound))
        return image?.pngData()
    }

    /// Copie UN sticker reçu dans la bibliothèque.
    ///
    /// L'identifiant vient de `StoryStickerLibrary.libraryID(forPostMediaID:)`,
    /// donc STABLE : le même sticker reçu deux fois vise la même entrée, et le
    /// second geste s'arrête AVANT le téléchargement.
    @MainActor
    static func save(
        _ sticker: StoryStickerLibrary.Savable,
        into store: StickerLibraryStore? = nil,
        download: (@MainActor (String) async -> Data?)? = nil
    ) async -> Outcome {
        let library = store ?? StickerLibraryPaste.store
        let known = await library.recentIDs()
        guard !known.contains(sticker.id) else { return .alreadyInLibrary }
        let fetch: @MainActor (String) async -> Data? = download ?? { await downloaded($0) }
        guard let data = await fetch(sticker.mediaURLString) else { return .failed }
        await library.save(data, id: sticker.id)
        return .saved
    }

    /// Point d'entrée du geste : copie, puis dit ce qui s'est passé. Le silence
    /// serait le pire des retours — l'utilisateur n'a aucun moyen de vérifier
    /// une bibliothèque qui vit dans une autre surface.
    @MainActor
    static func saveAndAnnounce(_ stickers: [StoryStickerLibrary.Savable]) async {
        var outcomes: [Outcome] = []
        for sticker in stickers {
            outcomes.append(await save(sticker))
        }
        guard let spoken = announcement(for: outcomes) else { return }
        switch spoken {
        case .saved(let count):
            FeedbackToastManager.shared.showSuccess(
                count == 1
                    ? String(localized: "story.viewer.sticker.saved.one",
                             defaultValue: "Sticker ajouté à Mes stickers",
                             bundle: .main)
                    : String(format: String(localized: "story.viewer.sticker.saved.many",
                                            defaultValue: "%d stickers ajoutés à Mes stickers",
                                            bundle: .main),
                             count)
            )
        case .alreadyInLibrary:
            FeedbackToastManager.shared.show(
                String(localized: "story.viewer.sticker.alreadySaved",
                       defaultValue: "Déjà dans Mes stickers",
                       bundle: .main),
                type: .info
            )
        case .failed:
            FeedbackToastManager.shared.showError(
                String(localized: "story.viewer.sticker.saveFailed",
                       defaultValue: "Enregistrement impossible",
                       bundle: .main)
            )
        }
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
            paste: { providers in await StickerLibraryPaste.paste(providers) },
            // `nil` sur iOS 16 : l'entrée « détourer » n'est alors PAS rendue
            // (loi 4). Le prédicat vit dans le service, pas ici — un second
            // `#available` écrit au site d'injection divergerait du premier au
            // jour où le plancher monte.
            lift: StickerSubjectLift.isAvailable
                ? { data in await StickerLibraryLift.lift(imageData: data) }
                : nil
        ))
    }
}

// MARK: - #3955 — la TROISIÈME alimentation : un sujet détouré

/// « Détourer », depuis une photo de la pellicule.
///
/// Le collage demande à l'utilisateur d'avoir DÉJÀ une image de sticker ; le
/// sticker reçu, d'en croiser un. Le détourage est la seule alimentation qui
/// part de ce que tout le monde a : ses propres photos.
///
/// Le travail de Vision vit hors du `MainActor` — détourer une photo de douze
/// mégapixels y ferait sauter la palette pendant une seconde entière, et c'est
/// exactement le moment où l'utilisateur la regarde.
nonisolated enum StickerLibraryLift {

    /// `nil` = rien n'est entré dans la bibliothèque, et l'utilisateur vient de
    /// se l'entendre dire. Le silence serait le pire retour : il a choisi une
    /// photo, l'attente a duré, et la grille n'a pas bougé.
    @MainActor
    static func lift(imageData: Data) async -> [StoryStickerLibraryItem]? {
        guard StickerSubjectLift.isAvailable else {
            announce(.unsupported)
            return nil
        }
        do {
            // Le `#available` est RÉPÉTÉ dans la tâche détachée : l'affinement
            // de disponibilité est lexical, et se fier à celui de la ligne
            // au-dessus laisserait la compilation dépendre d'un détail de
            // portée plutôt que d'une garde écrite.
            let cutOut = try await Task.detached(priority: .userInitiated) { () throws -> UIImage in
                guard #available(iOS 17.0, *) else { throw StickerSubjectLift.Failure.unsupported }
                return try StickerSubjectLift.lift(imageData: imageData)
            }.value
            guard await StickerLibraryPaste.save(image: cutOut) != nil else {
                announce(.unreadable)
                return nil
            }
            FeedbackToastManager.shared.showSuccess(
                String(localized: "story.sticker.library.lift.saved",
                       defaultValue: "Sujet détouré et ajouté à Mes stickers",
                       bundle: .main)
            )
            return await StickerLibraryPaste.recents()
        } catch let failure as StickerSubjectLift.Failure {
            announce(failure)
            return nil
        } catch {
            announce(.noSubject)
            return nil
        }
    }

    /// Chaque échec porte son nom : « aucun sujet » invite à choisir une AUTRE
    /// photo, « image illisible » n'invite pas à la même chose, et confondre les
    /// deux ferait réessayer l'utilisateur sur la même image.
    @MainActor
    private static func announce(_ failure: StickerSubjectLift.Failure) {
        let message: String
        switch failure {
        case .unsupported:
            message = String(localized: "story.sticker.library.lift.unsupported",
                             defaultValue: "Le détourage demande iOS 17",
                             bundle: .main)
        case .unreadable:
            message = String(localized: "story.sticker.library.lift.unreadable",
                             defaultValue: "Image illisible",
                             bundle: .main)
        case .noSubject:
            message = String(localized: "story.sticker.library.lift.noSubject",
                             defaultValue: "Aucun sujet trouvé sur cette photo",
                             bundle: .main)
        }
        FeedbackToastManager.shared.showError(message)
    }
}
