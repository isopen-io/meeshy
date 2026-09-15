import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce que l'auteur publie, décidé au moment où il publie** (#6502, directive
/// porteur 2026-09-14).
///
/// > « dès qu'on publie plus d'une image, ou que la publication a une vidéo,
/// > lors de l'appui sur publier, on a un menu liquid glass avec choix,
/// > sous-menu dépliable pour les posts de comment agencer les médias —
/// > supprimer le sélecteur en haut qui permet de choisir ce qu'on publie ! »
///
/// L'éventail du haut (`ComposerFormatFan`) demandait le format AVANT la
/// composition, quand l'auteur ne sait pas encore ce qu'il publie. Le choix
/// descend sur la flèche : c'est le seul instant où la matière est connue.
nonisolated struct ComposerPublishChoice: Hashable, Sendable {
    let format: ComposerFormat
    /// `nil` ⇒ aucune disposition imposée : le repli du modèle s'appliquera.
    let layout: MosaicLayoutMode?
}

nonisolated enum ComposerPublishMenuRule {

    struct Entry: Equatable {
        let format: ComposerFormat
        let isChoosable: Bool
        /// La raison du refus, `nil` quand l'entrée est choisissable.
        let reason: String?
        /// Vide ⇒ un bouton simple ; sinon le sous-menu des agencements.
        let layouts: [MosaicLayoutMode]

        /// Ce que chaque geste publie — un geste, une publication.
        var choices: [ComposerPublishChoice] {
            layouts.isEmpty
                ? [ComposerPublishChoice(format: format, layout: nil)]
                : layouts.map { ComposerPublishChoice(format: format, layout: $0) }
        }
    }

    /// **Le canal qu'emprunte un choix.** `.atelier` presse la télécommande de
    /// l'atelier ; `.storyScene` publie les unités d'histoire ; `.document`
    /// remet un brouillon ; `.unsupported` refuse en le disant.
    enum Route: Equatable {
        case atelier
        case storyScene
        case document
        case unsupported
    }

    /// **Plus d'une image OU au moins une vidéo** — la directive, au mot près.
    ///
    /// Ce n'est pas `ReelComposition.qualifiesAsReel` : celui-là exige 3 s de
    /// vidéo et compte le son. Une vidéo d'une seconde ouvre le menu ; un son
    /// seul ne l'ouvre pas.
    static func offersMenu(mediaKinds: [FeedMediaType]) -> Bool {
        mediaKinds.filter { $0 == .image }.count > 1 || mediaKinds.contains(.video)
    }

    /// **Les médias visuels de la composition, toutes slides confondues.**
    ///
    /// Un média du meuble vit à DEUX endroits dès qu'il est posé sur la scène :
    /// `documentLocalMedia` et un objet de slide. Le pont `URL source → objet`
    /// (`bridgedSources`) dit lesquels sont déjà comptés par les slides — sans
    /// lui, une seule photo ouvrirait le menu. L'image de FOND de l'atelier ne
    /// vit pas dans `effects` ; elle compte comme l'image qu'elle est.
    static func mediaKinds(slides: [StorySlide],
                           slideImageIds: Set<String>,
                           documentMedia: [ComposerDocumentMedia],
                           bridgedSources: Set<URL>) -> [FeedMediaType] {
        let objets: [FeedMediaType] = slides.flatMap { slide in
            (slide.effects.mediaObjects ?? []).compactMap { objet -> FeedMediaType? in
                switch objet.kind {
                case .image: return .image
                case .video: return .video
                case nil: return nil
                }
            }
        }
        let fonds = slides.filter { slideImageIds.contains($0.id) }.map { _ in FeedMediaType.image }
        let meuble: [FeedMediaType] = documentMedia
            .filter { !bridgedSources.contains($0.url) }
            .map { media in
                switch ComposerIngestRouter.route(mime: media.mimeType) {
                case .image: return .image
                case .video: return .video
                case .audio: return .audio
                case .file: return .document
                }
            }
        return objets + fonds + meuble
    }

    /// **Le canal document porte-t-il tous les fichiers du canevas ?**
    ///
    /// Il ne téléverse que `localMedia`. Un objet posé par l'ATELIER — ou son
    /// image de fond — n'y figure pas : le publier par ce canal enverrait un
    /// canevas qui référence des fichiers absents, sans que rien ne le dise.
    static func documentCarriesEveryMedia(slides: [StorySlide],
                                          slideImageIds: Set<String>,
                                          bridgedObjectIds: Set<String>) -> Bool {
        guard slides.allSatisfy({ !slideImageIds.contains($0.id) }) else { return false }
        return slides
            .flatMap { $0.effects.mediaObjects ?? [] }
            .allSatisfy { bridgedObjectIds.contains($0.id) }
    }

    /// **Les entrées du menu** — les formats de la porte, dans SON ordre ; le
    /// refus est grisé AVEC sa raison (`ComposerFormatAvailability`, #4030) ;
    /// Post déplie les agencements là où la disposition voyage
    /// (`ComposerMosaicChoice.isServed`) ET où son canal porte les fichiers.
    static func entries(candidates: [ComposerFormat],
                        offered: [ComposerFormat],
                        carriesMoreThanText: Bool,
                        slideCount: Int,
                        layoutsTravel: Bool) -> [Entry] {
        ComposerFormatAvailability.verdicts(candidates: candidates, offered: offered,
                                            carriesMoreThanText: carriesMoreThanText)
            .map { verdict in
                let deplie = verdict.format == .post
                    && layoutsTravel
                    && ComposerMosaicChoice.isServed(slideCount: slideCount, format: verdict.format)
                return Entry(format: verdict.format,
                             isChoosable: verdict.isChoosable,
                             reason: verdict.reason,
                             layouts: deplie ? ComposerMosaicChoice.ordered : [])
            }
    }

    /// **Le menu, ou son absence.** `nil` sans la matière qui l'appelle, et
    /// `nil` quand il n'offrirait qu'un geste : une entrée unique sans
    /// sous-menu est une affordance sans choix (loi 4).
    static func menu(mediaKinds: [FeedMediaType],
                     candidates: [ComposerFormat],
                     offered: [ComposerFormat],
                     carriesMoreThanText: Bool,
                     slideCount: Int,
                     layoutsTravel: Bool) -> [Entry]? {
        guard offersMenu(mediaKinds: mediaKinds) else { return nil }
        let menu = entries(candidates: candidates, offered: offered,
                           carriesMoreThanText: carriesMoreThanText,
                           slideCount: slideCount, layoutsTravel: layoutsTravel)
        guard menu.flatMap(\.choices).count > 1 else { return nil }
        return menu
    }

    /// **La surface est celle d'OUVERTURE ; le canal suit le GESTE.**
    ///
    /// Sous l'atelier, un choix sans agencement presse la télécommande — c'est
    /// l'atelier qui publie. « Post + agencement » part par le document, le
    /// seul canal qui transporte `canvasV3.layout` ; `entries` ne l'offre que
    /// si ce canal porte les fichiers.
    static func route(surface: ComposerSurfaceKind, choice: ComposerPublishChoice) -> Route {
        switch surface {
        case .scene:
            return choice.layout == nil ? .atelier : .document
        case .document, .mood:
            switch ComposerPublishChannel.channel(for: choice.format) {
            case .scene: return .storyScene
            case .document: return .document
            case .unsupported: return .unsupported
            }
        }
    }
}

nonisolated enum ComposerPublishMenuCopy {
    static var title: String {
        String(localized: "composer.publish.menu.title", defaultValue: "Publier comme", bundle: .main)
    }

    static var hint: String {
        String(localized: "composer.publish.menu.a11y.hint",
               defaultValue: "Ouvre le choix du format et de la disposition", bundle: .main)
    }

    /// Un `SwiftUI.Menu` n'expose pas de sous-titre : le refus porte sa raison
    /// dans le libellé, sinon il dit « non » sans dire quoi faire.
    static func entryTitle(_ entry: ComposerPublishMenuRule.Entry) -> String {
        let libelle = ComposerFormatCopy.label(entry.format)
        guard let raison = entry.reason, !entry.isChoosable else { return libelle }
        return "\(libelle) — \(raison)"
    }
}

/// **La flèche Publier devenue menu.** `Menu` natif : le système le rend en
/// verre liquide sur iOS 26 et garde sa forme sur iOS 16 à 25 ; un `Menu` dans
/// un `Menu` donne le sous-menu dépliable. VoiceOver et Dynamic Type suivent
/// sans rien réécrire.
struct ComposerPublishMenu<Etiquette: View>: View {

    let entries: [ComposerPublishMenuRule.Entry]
    let onPublish: (ComposerPublishChoice) -> Void
    @ViewBuilder let label: () -> Etiquette

    var body: some View {
        Menu {
            Section(ComposerPublishMenuCopy.title) {
                ForEach(entries, id: \.format) { entry in
                    entree(entry)
                }
            }
        } label: {
            label()
        }
        .menuIndicator(.hidden)
    }

    @ViewBuilder
    private func entree(_ entry: ComposerPublishMenuRule.Entry) -> some View {
        if entry.layouts.isEmpty {
            Button {
                onPublish(ComposerPublishChoice(format: entry.format, layout: nil))
            } label: {
                Text(ComposerPublishMenuCopy.entryTitle(entry))
            }
            .disabled(!entry.isChoosable)
        } else {
            Menu {
                Section(ComposerMosaicChoice.sectionTitle) {
                    ForEach(entry.layouts, id: \.self) { mode in
                        Button {
                            onPublish(ComposerPublishChoice(format: entry.format, layout: mode))
                        } label: {
                            Label(ComposerMosaicChoice.label(mode), systemImage: ComposerMosaicChoice.symbol(mode))
                        }
                    }
                }
            } label: {
                Text(ComposerPublishMenuCopy.entryTitle(entry))
            }
            .disabled(!entry.isChoosable)
        }
    }
}
