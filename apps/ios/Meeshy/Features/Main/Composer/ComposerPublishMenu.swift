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

    /// **Le chevron, ou son absence** (#7497, directive porteur 2026-09-22 :
    /// « [publier story/réel/post | v] — la flèche permet de choisir le type ;
    /// si on n'y touche pas, on publie comme indiqué »).
    ///
    /// Il ne dépend plus de la matière (#6502 l'ouvrait à partir de deux
    /// images ou d'une vidéo) : le TYPE se choisit toujours, et la partie
    /// principale de la capsule publie au format de la porte. `nil` quand il
    /// n'offrirait qu'un geste : une entrée unique sans sous-menu est une
    /// affordance sans choix (loi 4) — le mood, qui n'offre que lui-même.
    static func menu(candidates: [ComposerFormat],
                     offered: [ComposerFormat],
                     carriesMoreThanText: Bool,
                     slideCount: Int,
                     layoutsTravel: Bool) -> [Entry]? {
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

    /// **Ce que dit la partie principale de la capsule** (#7497) — le format
    /// qui partira si l'auteur ne touche pas au chevron. `nil` pour le mood :
    /// son en-tête dit « Publier », il n'a aucun autre format à nommer.
    static func publishTitle(_ format: ComposerFormat) -> String? {
        switch format {
        case .story:
            return String(localized: "composer.publish.as.story", defaultValue: "Publier la story", bundle: .main)
        case .post:
            return String(localized: "composer.publish.as.post", defaultValue: "Publier le post", bundle: .main)
        case .reel:
            return String(localized: "composer.publish.as.reel", defaultValue: "Publier le réel", bundle: .main)
        case .status:
            return nil
        }
    }

    /// Un `SwiftUI.Menu` n'expose pas de sous-titre : le refus porte sa raison
    /// dans le libellé, sinon il dit « non » sans dire quoi faire.
    static func entryTitle(_ entry: ComposerPublishMenuRule.Entry) -> String {
        let libelle = ComposerFormatCopy.label(entry.format)
        guard let raison = entry.reason, !entry.isChoosable else { return libelle }
        return "\(libelle) — \(raison)"
    }
}

/// **Le chevron de la capsule Publier** (#7497). `Menu` natif : le système le rend en
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
