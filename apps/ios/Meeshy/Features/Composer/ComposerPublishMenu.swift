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
    /// **La story part AUSSI en réel** (#9476) : le menu coche les deux
    /// formats, et un seul geste les publie. N'a de sens que sur une story sans
    /// disposition — `ComposerPublishMenuRule.armed` le retire partout ailleurs.
    let alsoAsReel: Bool

    init(format: ComposerFormat, layout: MosaicLayoutMode?, alsoAsReel: Bool = false) {
        self.format = format
        self.layout = layout
        self.alsoAsReel = alsoAsReel
    }

    /// Les formats qui PARTENT — ce que le menu coche, ce que la capsule nomme.
    var publishedFormats: [ComposerFormat] {
        alsoAsReel ? [format, .reel] : [format]
    }
}

nonisolated enum ComposerPublishMenuRule {

    struct Entry: Equatable {
        let format: ComposerFormat
        let isChoosable: Bool
        /// La raison du refus, `nil` quand l'entrée est choisissable.
        let reason: String?
        /// Vide ⇒ un bouton simple ; sinon le sous-menu des agencements.
        let layouts: [MosaicLayoutMode]

        /// Ce que chaque geste CHOISIT — un geste, un choix ; seule la partie
        /// principale de la capsule publie (maquette plein écran, 2026-09-27).
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

    /// **Ce que la partie principale publie** (maquette plein écran, directive
    /// porteur 2026-09-27 : « en sélectionnant la flèche pour choisir ce qu'on
    /// publie, ça ne publie pas ! C'est l'appui sur Publier qui envoie »).
    ///
    /// Le chevron ARME un choix ; la capsule le publie. Un choix que le menu
    /// n'offre plus (slide retirée, format grisé) retombe sur le format de la
    /// porte : on ne publie jamais ce que le menu ne montre pas.
    ///
    /// « Aussi en réel » (#9476) ne survit que là où le menu l'OFFRE
    /// (`companionReelOffered`) : sinon la story part seule, et la capsule le
    /// dit — jamais un réel annoncé qui ne partirait pas.
    static func armed(chosen: ComposerPublishChoice?,
                      defaultFormat: ComposerFormat,
                      entries: [Entry]?,
                      companionReelOffered: Bool = false) -> ComposerPublishChoice {
        let porte = ComposerPublishChoice(format: defaultFormat, layout: nil)
        guard let chosen else { return porte }
        let seul = ComposerPublishChoice(format: chosen.format, layout: chosen.layout)
        guard let entree = entries?.first(where: { $0.format == chosen.format }),
              entree.isChoosable,
              entree.choices.contains(seul) else { return porte }
        let accompagne = chosen.alsoAsReel && companionReelOffered
            && chosen.format == .story && chosen.layout == nil
        return accompagne ? chosen : seul
    }

    /// **La story peut-elle partir AUSSI en réel ?** (#9476) — la story ET le
    /// réel choisissables au menu (le réel l'est quand la composition qualifie,
    /// `ComposerReelGate`), et UNE seule scène : un réel est une scène, une
    /// story de plusieurs slides part en plusieurs publications. Jamais sur une
    /// REPUBLICATION : elle désigne les médias de sa source, que le serveur ne
    /// copie pas (`ALSO_AS_REEL_REQUIRES_STORY`).
    static func companionReelOffered(entries: [Entry]?, slideCount: Int, isRepost: Bool = false) -> Bool {
        guard slideCount == 1, !isRepost, let entries else { return false }
        let choisissable = { (format: ComposerFormat) in
            entries.contains { $0.format == format && $0.isChoosable }
        }
        return choisissable(.story) && choisissable(.reel)
    }

    /// **Ce que touche une entrée SANS disposition** (#9476). Story et Réel se
    /// cochent ENSEMBLE quand la story peut partir aussi en réel : toucher l'un
    /// AJOUTE ou RETIRE l'autre, jamais au point de ne plus rien cocher. Partout
    /// ailleurs, une entrée arme son format seul, comme avant.
    static func toggled(_ format: ComposerFormat,
                        armed: ComposerPublishChoice,
                        companionReelOffered: Bool) -> ComposerPublishChoice {
        let seul = ComposerPublishChoice(format: format, layout: nil)
        guard companionReelOffered, armed.layout == nil else { return seul }
        let both = ComposerPublishChoice(format: .story, layout: nil, alsoAsReel: true)
        switch (format, armed.format, armed.alsoAsReel) {
        case (.reel, .story, false), (.story, .reel, _):
            return both
        case (.reel, .story, true):
            return ComposerPublishChoice(format: .story, layout: nil)
        case (.story, .story, true):
            return ComposerPublishChoice(format: .reel, layout: nil)
        default:
            return seul
        }
    }

    /// **Le menu COCHE ce qui partira** (#9419). Le format armé est coché ; dans
    /// le sous-menu des dispositions, la disposition armée — ou, tant que
    /// l'auteur n'en a choisi aucune, le REPLI que la publication appliquera.
    /// Un menu qui ne coche rien alors que quelque chose partira ment — et un
    /// réel qui part AVEC la story est coché aussi (#9476).
    static func isChecked(_ entry: Entry, armed: ComposerPublishChoice) -> Bool {
        armed.publishedFormats.contains(entry.format)
    }

    static func checkedLayout(in entry: Entry, armed: ComposerPublishChoice) -> MosaicLayoutMode? {
        guard armed.format == entry.format, !entry.layouts.isEmpty else { return nil }
        return armed.layout ?? ComposerMosaicChoice.fallback
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

    /// **Ce que la flèche PRESSE, format et réel compris** (#9476) — la route
    /// et ce qu'elle emporte, lus d'une règle pure plutôt qu'écrits dans le
    /// corps du meuble : c'est le témoin du chemin menu → `requestPublish` →
    /// type publié. Un réel armé part en `.reel` par l'atelier ; une story
    /// accompagnée de son réel part en `.story` avec `alsoAsReel`.
    enum Dispatch: Equatable {
        case atelier(PostType, alsoAsReel: Bool)
        case storyScene(ComposerFormat, alsoAsReel: Bool)
        case document(ComposerPublishChoice)
        case unsupported
    }

    static func dispatch(surface: ComposerSurfaceKind, choice: ComposerPublishChoice) -> Dispatch {
        switch route(surface: surface, choice: choice) {
        case .atelier: return .atelier(choice.format.postType, alsoAsReel: choice.alsoAsReel)
        case .storyScene: return .storyScene(choice.format, alsoAsReel: choice.alsoAsReel)
        case .document: return .document(choice)
        case .unsupported: return .unsupported
        }
    }

    /// **Le texte du post que l'ATELIER doit emporter** (#8473, retour porteur
    /// 2026-09-28).
    ///
    /// Le bouton du socle écrit le texte du post dans `documentText` dès que
    /// « Post » est ARMÉ, même sur une scène ouverte en story. L'atelier, lui,
    /// publie le contenu de la SLIDE : sans ce report, le texte tapé dans la
    /// plaque de verre ne partait nulle part. Le canal document le porte déjà ;
    /// un texte blanc ne remplace rien.
    static func atelierCarriedPostText(route: Route,
                                       choice: ComposerPublishChoice,
                                       documentText: String) -> String? {
        guard route == .atelier, choice.format == .post,
              !documentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return documentText
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
    /// Ce que la capsule nomme pour un CHOIX : la story et son réel quand les
    /// deux partent (#9476), sinon le format seul.
    static func publishTitle(for choice: ComposerPublishChoice) -> String? {
        guard choice.alsoAsReel else { return publishTitle(choice.format) }
        return String(localized: "composer.publish.as.storyAndReel",
                      defaultValue: "Publier la story et le réel", bundle: .main)
    }

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
/// sans rien réécrire. Il CHOISIT, il ne publie pas : l'hôte retient le choix
/// et la partie principale l'envoie ; la coche marque ce qui est armé.
struct ComposerPublishMenu<Etiquette: View>: View {

    let entries: [ComposerPublishMenuRule.Entry]
    let armed: ComposerPublishChoice
    /// La story peut-elle partir AUSSI en réel (#9476) ? Story et Réel se
    /// cochent alors ensemble (`ComposerPublishMenuRule.toggled`).
    var companionReelOffered = false
    let onChoose: (ComposerPublishChoice) -> Void
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
            Toggle(isOn: choosing(ComposerPublishMenuRule.toggled(entry.format, armed: armed,
                                                                  companionReelOffered: companionReelOffered),
                                  isChecked: ComposerPublishMenuRule.isChecked(entry, armed: armed))) {
                Text(ComposerPublishMenuCopy.entryTitle(entry))
            }
            .disabled(!entry.isChoosable)
        } else {
            Menu {
                Section(ComposerMosaicChoice.sectionTitle) {
                    ForEach(entry.layouts, id: \.self) { mode in
                        Toggle(isOn: choosing(ComposerPublishChoice(format: entry.format, layout: mode),
                                              isChecked: ComposerPublishMenuRule.checkedLayout(
                                                  in: entry, armed: armed) == mode)) {
                            Label(ComposerMosaicChoice.label(mode), systemImage: ComposerMosaicChoice.symbol(mode))
                        }
                    }
                }
            } label: {
                if ComposerPublishMenuRule.isChecked(entry, armed: armed) {
                    Label(ComposerPublishMenuCopy.entryTitle(entry), systemImage: "checkmark")
                } else {
                    Text(ComposerPublishMenuCopy.entryTitle(entry))
                }
            }
            .disabled(!entry.isChoosable)
        }
    }

    /// Une entrée du menu est un `Toggle` : le système pose la coche en tête,
    /// à la place où on la cherche, et la garde à côté du glyphe de la
    /// disposition. Toucher une entrée déjà cochée la réarme, rien d'autre.
    private func choosing(_ choice: ComposerPublishChoice, isChecked: Bool) -> Binding<Bool> {
        Binding(get: { isChecked }, set: { _ in onChoose(choice) })
    }
}
