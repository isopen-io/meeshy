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
///
/// **Le choix est COMPOSITE** (#13920, décision porteur : « le choix du type
/// de post est composite et non exclusif ») : l'auteur coche un ou plusieurs
/// formats parmi Story, Post et Réel, et un seul geste les publie tous.
nonisolated struct ComposerPublishChoice: Hashable, Sendable {
    /// Les formats qui PARTENT — jamais vide, rangés dans l'ordre du menu
    /// (`ComposerFormat.allComposable`) : le premier GOUVERNE la scène.
    let formats: [ComposerFormat]
    /// La disposition des scènes du POST. `nil` ⇒ aucune disposition imposée :
    /// le repli du modèle s'appliquera.
    let layout: MosaicLayoutMode?

    init(format: ComposerFormat, layout: MosaicLayoutMode?, alsoAsReel: Bool = false) {
        self.formats = alsoAsReel ? ComposerFormat.allComposable.filter { $0 == format || $0 == .reel } : [format]
        self.layout = layout
    }

    /// `nil` quand rien n'est coché : un choix publie toujours quelque chose.
    init?(formats: [ComposerFormat], layout: MosaicLayoutMode?) {
        let ranges = ComposerFormat.allComposable.filter(formats.contains)
        guard !ranges.isEmpty else { return nil }
        self.formats = ranges
        self.layout = ranges.contains(.post) ? layout : nil
    }

    /// Le format qui gouverne la scène, les rails et la garde de publication.
    var format: ComposerFormat { formats[0] }

    /// **La story part AUSSI en réel** (#9476) — le cas particulier du choix
    /// composite : une seule requête, le serveur fait le réel de la story.
    var alsoAsReel: Bool { formats.contains(.story) && formats.contains(.reel) }

    /// Les formats qui PARTENT — ce que le menu coche, ce que la capsule nomme.
    var publishedFormats: [ComposerFormat] { formats }

    /// **Une publication par format** : la story emporte son réel quand les
    /// deux sont cochés (#9476), le post emporte la disposition.
    var legs: [ComposerPublishChoice] {
        formats.compactMap { format in
            switch format {
            case .reel where alsoAsReel: return nil
            case .story: return ComposerPublishChoice(format: .story, layout: nil, alsoAsReel: alsoAsReel)
            case .post: return ComposerPublishChoice(format: .post, layout: layout)
            case .reel, .status: return ComposerPublishChoice(format: format, layout: nil)
            }
        }
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
                let deplie = layoutsTravel
                    && ComposerFormatVariant.of(verdict.format).offersLayouts(sceneCount: slideCount)
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
    /// **Le chevron CHOISIT, il ne publie pas** : il échappe au gate de matière
    /// (une scène encore vide peut déjà devenir un post ou un réel, #13839) et
    /// ne se fige que pendant l'envoi.
    static func chevronIsEnabled(isPublishing: Bool) -> Bool { !isPublishing }

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
    ///
    /// Le choix composite (#13920) se relit FORMAT PAR FORMAT : chacun garde
    /// ses règles, et seul celui que le menu refuse tombe.
    static func armed(chosen: ComposerPublishChoice?,
                      defaultFormat: ComposerFormat,
                      entries: [Entry]?,
                      companionReelOffered: Bool = false) -> ComposerPublishChoice {
        let porte = ComposerPublishChoice(format: defaultFormat, layout: nil)
        guard let chosen else { return porte }
        let servis = chosen.formats.filter { format in
            guard let entree = entries?.first(where: { $0.format == format }), entree.isChoosable else { return false }
            guard format == .post, let disposition = chosen.layout else { return true }
            return entree.layouts.contains(disposition)
        }
        let accompagne = companionReelOffered && servis.contains(.story)
        return ComposerPublishChoice(formats: servis.filter { $0 != .reel || accompagne || !servis.contains(.story) },
                                     layout: chosen.layout) ?? porte
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

    /// **Toucher une entrée la COCHE ou la DÉCOCHE** (#13920) — jamais au point
    /// de ne plus rien cocher : la dernière entrée cochée le reste.
    ///
    /// Story et Réel ne se cochent ensemble que là où la story peut partir
    /// aussi en réel (#9476) : ailleurs, cocher l'un décoche l'autre. Le post se
    /// coche avec l'un comme avec l'autre, et garde sa disposition.
    static func toggled(_ format: ComposerFormat,
                        armed: ComposerPublishChoice,
                        companionReelOffered: Bool) -> ComposerPublishChoice {
        guard !armed.formats.contains(format) else {
            return ComposerPublishChoice(formats: armed.formats.filter { $0 != format }, layout: armed.layout) ?? armed
        }
        let rival: ComposerFormat? = companionReelOffered ? nil : [.story: .reel, .reel: .story][format]
        let coches = armed.formats.filter { $0 != rival } + [format]
        return ComposerPublishChoice(formats: coches, layout: armed.layout) ?? armed
    }

    /// **Choisir une disposition COCHE le post** et garde les autres formats.
    static func choosingLayout(_ layout: MosaicLayoutMode,
                               armed: ComposerPublishChoice) -> ComposerPublishChoice {
        ComposerPublishChoice(formats: armed.formats + [.post], layout: layout) ?? armed
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
        guard armed.formats.contains(entry.format), !entry.layouts.isEmpty else { return nil }
        return armed.layout ?? ComposerMosaicChoice.fallback
    }

    /// **Le canal suit le FORMAT du geste**, quelle que soit la surface
    /// (#15629) : la story part par ses unités d'histoire, le post et le réel
    /// par le document — le seul canal qui transporte `canvasV3.layout`.
    static func route(choice: ComposerPublishChoice) -> Route {
        switch ComposerPublishChannel.channel(for: choice.format) {
        case .scene: return .storyScene
        case .document: return .document
        case .unsupported: return .unsupported
        }
    }

    /// **Ce que la flèche PRESSE, format et réel compris** (#9476) — la route
    /// et ce qu'elle emporte, lus d'une règle pure plutôt qu'écrits dans le
    /// corps du meuble : c'est le témoin du chemin menu → `requestPublish` →
    /// type publié. Une story accompagnée de son réel part en `.story` avec
    /// `alsoAsReel`.
    enum Dispatch: Equatable {
        case storyScene(ComposerFormat, alsoAsReel: Bool)
        case document(ComposerPublishChoice)
        case unsupported
    }

    /// **Une requête par format** (#13920) : chaque publication du choix
    /// composite emprunte le canal de son format.
    static func dispatches(choice: ComposerPublishChoice) -> [Dispatch] {
        choice.legs.map { dispatch(choice: $0) }
    }

    /// **Le réel n'accompagne qu'une story** (#9476) : armé sur un autre
    /// format, il ne part pas avec lui.
    static func publishedAlsoAsReel(requested: Bool, served: PostType) -> Bool {
        requested && served == .story
    }

    static func dispatch(choice: ComposerPublishChoice) -> Dispatch {
        switch route(choice: choice) {
        case .storyScene: return .storyScene(choice.format, alsoAsReel: choice.alsoAsReel)
        case .document: return .document(choice)
        case .unsupported: return .unsupported
        }
    }
}

nonisolated enum ComposerPublishMenuCopy {
    static var title: String {
        String(localized: "composer.publish.menu.title", defaultValue: "Publier comme", bundle: .main)
    }

    /// Le nom du chevron pour VoiceOver (#13839) : il CHOISIT le type, il ne
    /// publie pas — « Publier comme » le faisait entendre comme un second Publier.
    static var typeMenu: String {
        String(localized: "composer.publish.typeMenu", defaultValue: "Type de publication", bundle: .main)
    }

    static var emptyReason: String {
        String(localized: "composer.publish.emptyReason",
               defaultValue: "Ajoutez quelque chose à la scène pour publier", bundle: .main)
    }

    static var hint: String {
        String(localized: "composer.publish.menu.a11y.hint",
               defaultValue: "Ouvre le choix du format et de la disposition", bundle: .main)
    }

    /// **Ce que dit la partie principale de la capsule** (#7497) — le format
    /// qui partira si l'auteur ne touche pas au chevron. `nil` pour le mood :
    /// son en-tête dit « Publier », il n'a aucun autre format à nommer.
    /// Ce que la capsule nomme pour un CHOIX : chacun des formats cochés
    /// (#13920), la story et son réel compris (#9476).
    static func publishTitle(for choice: ComposerPublishChoice) -> String? {
        switch Set(choice.formats) {
        case [.story, .reel]:
            return String(localized: "composer.publish.as.storyAndReel",
                          defaultValue: "Publier la story et le réel", bundle: .main)
        case [.story, .post]:
            return String(localized: "composer.publish.as.storyAndPost",
                          defaultValue: "Publier la story et le post", bundle: .main)
        case [.post, .reel]:
            return String(localized: "composer.publish.as.postAndReel",
                          defaultValue: "Publier le post et le réel", bundle: .main)
        case [.story, .post, .reel]:
            return String(localized: "composer.publish.as.storyPostAndReel",
                          defaultValue: "Publier la story, le post et le réel", bundle: .main)
        default:
            return publishTitle(choice.format)
        }
    }

    /// **L'échec partiel dit LEQUEL** (#13920) : les formats partis le sont, la
    /// phrase nomme ceux qui ne sont pas partis.
    static func partialFailure(_ formats: [ComposerFormat]) -> String {
        let noms = ListFormatter.localizedString(byJoining: formats.map(ComposerFormatCopy.label))
        return String(format: String(localized: "composer.publish.partialFailure",
                                     defaultValue: "Non publié : %@", bundle: .main), noms)
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
        .modifier(StaysOpenWhileChecking())
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
                Toggle(isOn: choosing(ComposerPublishMenuRule.toggled(entry.format, armed: armed,
                                                                      companionReelOffered: companionReelOffered),
                                      isChecked: ComposerPublishMenuRule.isChecked(entry, armed: armed))) {
                    Text(ComposerFormatCopy.label(entry.format))
                }
                Section(ComposerMosaicChoice.sectionTitle) {
                    ForEach(entry.layouts, id: \.self) { mode in
                        Toggle(isOn: choosing(ComposerPublishMenuRule.choosingLayout(mode, armed: armed),
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

/// Les formats se cochent menu OUVERT, comme Android : une coche ne
/// referme pas le menu, l'auteur en coche plusieurs d'un seul déploiement.
private struct StaysOpenWhileChecking: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content.menuActionDismissBehavior(.disabled)
        } else {
            content
        }
    }
}

/// **Le chevron posé dans la capsule Publier** (#13839) : le filet qui le
/// sépare, le menu et son nom VoiceOver « Type de publication ». Un type
/// concret, pour que la capsule le reçoive hors du gate de matière sans
/// effacer son type.
struct ComposerPublishChevron: View {
    let entries: [ComposerPublishMenuRule.Entry]
    let armed: ComposerPublishChoice
    var companionReelOffered = false
    let onChoose: (ComposerPublishChoice) -> Void

    var body: some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(Color.white.opacity(0.35))
                .frame(width: 1, height: 20)
                .accessibilityHidden(true)
            ComposerPublishMenu(entries: entries, armed: armed,
                                companionReelOffered: companionReelOffered,
                                onChoose: onChoose) {
                Image(systemName: "chevron.down")
                    .font(.footnote.weight(.bold))
                    .foregroundColor(.white)
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(ComposerPublishMenuCopy.typeMenu)
            .accessibilityHint(ComposerPublishMenuCopy.hint)
        }
    }
}

/// Un Publier grisé n'est pas muet : le toucher dit la raison du refus, ou
/// qu'il faut d'abord poser quelque chose sur la scène.
struct ComposerPublishRefusalTapZone: View {
    let isRefused: Bool
    let reason: String

    var body: some View {
        if isRefused {
            Color.clear
                .contentShape(Capsule())
                .onTapGesture {
                    HapticFeedback.warning()
                    FeedbackToastManager.shared.showError(reason.isEmpty ? ComposerPublishMenuCopy.emptyReason : reason)
                }
                .accessibilityHidden(true)
        }
    }
}

/// **Le plan d'un choix composite** (#13920) : chaque format, par le canal de
/// son format (`ComposerPublishMenuRule.dispatch`), sous sa propre garde.
nonisolated struct ComposerSeveralFormats: Equatable {
    let scene: [ComposerPublishChoice]
    let document: [ComposerPublishChoice]
    /// Les formats qui ne partiront pas — refusés par leur garde, ou sans canal.
    let refused: [ComposerFormat]

    static func plan(_ choice: ComposerPublishChoice,
                     accepts: (ComposerFormat) -> Bool) -> ComposerSeveralFormats {
        let routes = choice.legs.map { leg in
            (leg: leg, dispatch: accepts(leg.format) ? ComposerPublishMenuRule.dispatch(choice: leg)
                                                     : .unsupported)
        }
        let canal = { (garde: (ComposerPublishMenuRule.Dispatch) -> Bool) in routes.filter { garde($0.dispatch) }.map(\.leg) }
        return ComposerSeveralFormats(
            scene: canal { if case .storyScene = $0 { return true } else { return false } },
            document: canal { if case .document = $0 { return true } else { return false } },
            refused: canal { $0 == .unsupported }.flatMap(\.formats)
        )
    }

    /// **Ce que le geste laisse derrière lui** : tout est parti ⇒ le compositeur
    /// se ferme ; sinon il reste, et seuls les formats qui ne sont pas partis
    /// restent cochés — le prochain appui ne republie pas ce qui l'est déjà.
    enum Outcome: Equatable {
        case published
        case remains(ComposerPublishChoice)
    }

    static func outcome(of choice: ComposerPublishChoice, refused: [ComposerFormat]) -> Outcome {
        ComposerPublishChoice(formats: refused, layout: choice.layout).map(Outcome.remains) ?? .published
    }

    /// **L'ordre d'un geste** : les publications DOCUMENT d'abord, une à une et
    /// attendues, pendant que le compositeur est encore là pour garder ce
    /// qu'elles refusent ; puis celles qui partent sur-le-champ (la scène),
    /// dont la porte peut refermer le compositeur. `sendNow` reçoit
    /// ce qui est déjà refusé, et rend ce qu'il refuse à son tour.
    @MainActor
    static func run(_ plan: ComposerSeveralFormats,
                    sendDocument: @MainActor (ComposerPublishChoice) async -> Bool,
                    sendNow: @MainActor ([ComposerFormat]) -> [ComposerFormat]) async -> [ComposerFormat] {
        var refuses = plan.refused
        for leg in plan.document {
            let parti = await sendDocument(leg)
            if !parti { refuses += leg.formats }
        }
        return refuses + sendNow(refuses)
    }

    @MainActor
    static func sayRefused(_ formats: [ComposerFormat]) {
        guard !formats.isEmpty else { return }
        HapticFeedback.error()
        FeedbackToastManager.shared.showError(ComposerPublishMenuCopy.partialFailure(formats))
    }
}
