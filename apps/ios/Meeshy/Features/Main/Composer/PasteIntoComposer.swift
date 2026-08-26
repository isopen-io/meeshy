import Foundation
import UIKit
import SwiftUI
import MeeshyUI

/// Un élément collé, une fois le presse-papier LU et le fichier copié dans
/// notre conteneur par `ComposerDropResolver`.
nonisolated struct ComposerPastedFile: Equatable {
    let url: URL
    let name: String
    let mime: String
}

/// Ce qu'un collage a produit, une fois la règle O12 appliquée à CHAQUE
/// élément.
///
/// Cinq bacs, et c'est la propriété qui compte : **tout élément lu tombe dans
/// exactement un bac**. Le presse-papier ne dit jamais pourquoi rien ne s'est
/// passé — un sixième cas non modélisé serait donc, par construction, avalé en
/// silence. `PasteIntoComposerTests` en fait une loi de conservation.
nonisolated struct ComposerPasteBatch: Equatable {
    /// Ce que la SCÈNE pose : image, vidéo, son.
    let scene: [ComposerPastedFile]
    /// Les images que « Mes stickers » retient (surface `.stickers`, budget
    /// 512 px). Vide sur la scène : coller dans la scène n'alimente JAMAIS la
    /// bibliothèque — la promotion média → sticker est une action explicite
    /// d'inspecteur, pas un effet de bord.
    let stickers: [ComposerPastedFile]
    /// Les documents. Pièces jointes du document en cours partout où il en
    /// existe ; ANNONCÉS là où il n'en existe pas — jamais un rejet muet.
    let attachments: [ComposerPastedFile]
    /// Du texte. La capsule « Coller » du canevas sert le MÉDIA ; le texte se
    /// colle dans l'éditeur de texte, qui porte déjà le menu système.
    let text: [String]
    /// Ce que le presse-papier n'a pas su rendre, nommé.
    let unreadable: [String]
}

/// Ce que la scène de story ne sait pas héberger — **et où cela PEUT aller**.
///
/// La directive produit du 2026-08-23 exige que tout ce qui est collé soit
/// « pris en compte et propagé ». Sur la scène d'une story, un document n'a
/// aucune destination : le vocabulaire par lequel un collage entre dans le
/// canvas est `StoryPastedItem`, et il n'a que trois familles — image, vidéo,
/// son. Toutes trois se PEIGNENT ; un PDF, non.
///
/// L'exclusion est donc ASSUMÉE, et assumée veut dire DITE. La différence avec
/// l'état précédent n'est pas cosmétique : `attachments` était produit puis lu
/// UNIQUEMENT pour concaténer des noms dans un message de refus — une donnée
/// que rien ne consommait, en laissant croire qu'elle l'était. Ici le bac est
/// consommé par une VALEUR dont le nom porte la destination, et le test peut
/// donc vérifier autre chose qu'une chaîne.
///
/// **Condition de levée, nommée** : le jour où `StoryPastedItem` gagne une
/// famille non peignable (un document, une pièce jointe), l'exclusion devient
/// une propagation. `StoryComposerPasteStarterTests` garde cette condition à
/// deux endroits — un `switch` exhaustif qui cesse de compiler, et un compte de
/// cas sur la déclaration de l'énumération.
nonisolated enum ComposerPasteExclusion: Equatable {
    /// Le lecteur n'a rien su tirer de ces providers (dossier, fichier vide).
    case unreadable([String])
    /// Un document. Il se joint à un POST — la surface document du meuble et la
    /// feuille du fil en acceptent — jamais au canevas d'une story.
    case documentBelongsToAPost([String])
    /// Du texte. Il se colle dans l'outil Texte, qui porte déjà le menu système.
    case textBelongsToTheTextTool
}

/// C5b — **le chemin** du presse-papier vers le composer.
///
/// ## Ce que ce fichier n'est pas
///
/// Ce n'est PAS un lecteur de presse-papier. `ComposerDropResolver` et
/// `ComposerIngestRouter` en sont un, branché sur six sites de production, et
/// ils savent déjà tout ce qui compte : image avec ou sans fichier sous-jacent,
/// document, vidéo, audio, refus des dossiers et des fichiers de 0 octet,
/// autorisation sandbox, nom d'ORIGINE (et non la description localisée du
/// type). En écrire un second reviendrait à corriger deux fois chaque cas
/// limite du presse-papier iOS — et l'historique de ce lecteur montre qu'il y
/// en a beaucoup.
///
/// Ce fichier ne fait que deux choses : **ventiler** ce que le lecteur rend,
/// selon `PasteDestination` (règle O12), et **matérialiser** les images au
/// budget que la surface impose.
///
/// ## Les deux axes, jamais une table croisée
///
/// La SURFACE décide du budget et de la mémorisation ; le TYPE COLLÉ décide du
/// produit. Une surface ne peut pas transformer la NATURE de ce qui est collé :
/// un PDF déposé dans le panneau Stickers reste une pièce jointe. La décision
/// n'est pas reprise ici — elle est LUE sur `PasteDestination`, sans quoi il y
/// aurait deux tables à tenir d'accord.
nonisolated enum PasteIntoComposer {

    /// Ventilation PURE. Aucun accès disque, aucun UIKit : c'est la règle,
    /// et rien d'autre.
    ///
    /// `unreadable` traverse la fonction sans être touché — les providers que
    /// le lecteur a refusés n'ont pas d'`ingest`, mais ils ont un nom, et ce nom
    /// doit survivre jusqu'au toast.
    static func batch(
        ingests: [ComposerIngest],
        unreadable: [String] = [],
        surface: PasteSurface
    ) -> ComposerPasteBatch {
        let files = ingests.compactMap(Self.pastedFile)
        let product: (ComposerPastedFile) -> PasteProduct = { file in
            PasteDestination.resolve(
                surface: surface,
                ingest: ComposerIngestRouter.route(mime: file.mime)
            ).product
        }
        return ComposerPasteBatch(
            scene: files.filter { product($0) == .mediaObject },
            stickers: files.filter { product($0) == .sticker },
            attachments: files.filter { product($0) == .attachment },
            text: ingests.compactMap(Self.pastedText),
            unreadable: unreadable
        )
    }

    private static func pastedFile(_ ingest: ComposerIngest) -> ComposerPastedFile? {
        guard case let .file(url, name, mime) = ingest else { return nil }
        return ComposerPastedFile(url: url, name: name, mime: mime)
    }

    private static func pastedText(_ ingest: ComposerIngest) -> String? {
        guard case let .text(value) = ingest else { return nil }
        return value
    }
}

// MARK: - Lecture du presse-papier et remise au composer

extension PasteIntoComposer {

    /// Résout les providers remis par `PasteButton`, puis ventile.
    ///
    /// Résolution SÉQUENTIELLE, et non par `withTaskGroup` : `NSItemProvider`
    /// n'est pas `Sendable`, donc le confier à une tâche enfant est refusé net
    /// par Swift 6 — et lui fabriquer une conformité `@unchecked Sendable`
    /// serait affirmer une sûreté que le compilateur ne peut pas vérifier. Le
    /// séquentiel ne bloque PAS le main : le travail disque vit dans la closure
    /// de complétion de `NSItemProvider`, qui rappelle hors du main.
    @MainActor
    static func resolve(_ providers: [NSItemProvider], surface: PasteSurface) async -> ComposerPasteBatch {
        var ingests: [ComposerIngest] = []
        var unreadable: [String] = []
        for provider in providers {
            if let ingest = await ComposerDropResolver.resolve(provider) {
                ingests.append(ingest)
            } else {
                unreadable.append(provider.suggestedName ?? Self.unnamedItem)
            }
        }
        return batch(ingests: ingests, unreadable: unreadable, surface: surface)
    }

    /// Point d'entrée de la SCÈNE du composer de story : lit, annonce ce que la
    /// scène ne sait pas héberger, et rend ce qu'elle sait poser.
    @MainActor
    static func storyScene(_ providers: [NSItemProvider]) async -> [StoryPastedItem] {
        let resolved = await resolve(providers, surface: .scene)
        announceWhatTheStorySceneCannotHost(resolved)
        return await sceneItems(resolved.scene, surface: .scene)
    }

    /// Ce que la scène ne peut pas héberger, en VALEURS — pur, donc testable.
    ///
    /// C'est ici que le bac `attachments` est réellement consommé : chaque
    /// famille exclue devient un cas dont le nom porte sa destination, et la
    /// loi « posé OU annoncé, jamais avalé » se vérifie sur ces valeurs plutôt
    /// que sur le texte d'un toast.
    nonisolated static func exclusions(in batch: ComposerPasteBatch) -> [ComposerPasteExclusion] {
        let candidates: [ComposerPasteExclusion?] = [
            batch.unreadable.isEmpty ? nil : .unreadable(batch.unreadable),
            batch.attachments.isEmpty ? nil : .documentBelongsToAPost(batch.attachments.map(\.name)),
            batch.text.isEmpty ? nil : .textBelongsToTheTextTool
        ]
        return candidates.compactMap { $0 }
    }

    /// Une story n'a ni pièce jointe ni champ de saisie hors canevas. Ce que sa
    /// scène ne peut pas héberger est donc DIT, avec le nom du fichier ET la
    /// surface qui l'accepte : l'utilisateur a collé quelque chose, il doit
    /// savoir ce qu'il en est advenu ET où le porter. Le silence est le pire
    /// comportement possible ici ; un refus sans issue est le deuxième pire.
    @MainActor
    static func announceWhatTheStorySceneCannotHost(_ batch: ComposerPasteBatch) {
        exclusions(in: batch).forEach { announce($0) }
    }

    @MainActor
    private static func announce(_ exclusion: ComposerPasteExclusion) {
        switch exclusion {
        case .unreadable(let names):
            ComposerIngestFeedback.showFailure(names: names)
        case .documentBelongsToAPost(let names):
            let joined = names.joined(separator: ", ")
            FeedbackToastManager.shared.showError(
                String(localized: "composer.paste.documentGoesToAPost",
                       defaultValue: "Un document se joint à un post, pas au canevas d'une story : \(joined)",
                       bundle: .main)
            )
        case .textBelongsToTheTextTool:
            FeedbackToastManager.shared.showError(
                String(localized: "composer.paste.textGoesToTheTextTool",
                       defaultValue: "Le texte se colle dans l'outil Texte",
                       bundle: .main)
            )
        }
    }

    /// Traduit les fichiers destinés à la scène en valeurs que le SDK sait
    /// poser. L'image est matérialisée ici, au budget de la surface ; la vidéo
    /// et le son passent par leur URL, que le composer recopie lui-même sous le
    /// nom de son objet.
    @MainActor
    private static func sceneItems(
        _ files: [ComposerPastedFile],
        surface: PasteSurface
    ) async -> [StoryPastedItem] {
        var items: [StoryPastedItem] = []
        for file in files {
            switch ComposerIngestRouter.route(mime: file.mime) {
            case .image:
                guard let image = await materializeImage(file, surface: surface) else {
                    // L'échec PARLE : sans ce toast, une image illisible
                    // disparaîtrait exactement comme un collage avalé.
                    ComposerIngestFeedback.showFailure(names: [file.name])
                    continue
                }
                items.append(.image(image))
            case .video:
                items.append(.video(file.url))
            case .audio:
                items.append(.audio(file.url))
            case .file:
                // Inatteignable : `batch` a déjà routé les documents vers
                // `attachments`. Ne rien poser vaut mieux que poser un objet
                // média vide, et l'annonce a déjà eu lieu.
                continue
            }
        }
        return items
    }

    /// Décode au budget de la surface — 2048 px sur la scène, 512 px dans le
    /// panneau Stickers.
    ///
    /// `StoryMediaLoader.loadImage(data:maxDimension:)` décode DIRECTEMENT à la
    /// taille cible (ImageIO) : une photo de 12 Mpx n'est jamais matérialisée en
    /// pleine résolution. Le fichier temporaire nous appartient (le lecteur l'a
    /// copié pour nous) et a fini son office une fois le bitmap obtenu — le
    /// composer écrit le sien, sous le nom de son objet.
    @MainActor
    private static func materializeImage(
        _ file: ComposerPastedFile,
        surface: PasteSurface
    ) async -> UIImage? {
        guard let data = try? Data(contentsOf: file.url) else { return nil }
        let budget = PasteDestination.resolve(surface: surface, ingest: .image).maxSide
        let image = await StoryMediaLoader.shared.loadImage(
            data: data, maxDimension: CGFloat(budget))
        try? FileManager.default.removeItem(at: file.url)
        return image
    }

    /// Même libellé que la cible de dépôt de la barre de conversation : un
    /// provider sans nom reste nommable dans le toast.
    @MainActor
    private static var unnamedItem: String {
        String(localized: "composer.drop.unnamedItem",
               defaultValue: "\u{00E9}l\u{00E9}ment sans nom", bundle: .main)
    }
}

// MARK: - Injection dans le composer de story (SDK)

extension View {
    /// Fournit au composer de story (`StoryComposerView`, côté SDK) la lecture
    /// du presse-papier. Même doctrine que `storyCameraCaptureProvided` : la
    /// résolution d'un `NSItemProvider` (représentation fichier vs données,
    /// autorisation sandbox, nom d'origine) est de l'orchestration app-side, et
    /// elle existe déjà. Sans cet appel, la capsule « Coller » n'est pas rendue
    /// — une amorce qui ouvre le vide est pire que pas d'amorce.
    func storyPasteProvided() -> some View {
        environment(\.storyPaste, StoryPasteProvider { providers in
            await PasteIntoComposer.storyScene(providers)
        })
    }
}
