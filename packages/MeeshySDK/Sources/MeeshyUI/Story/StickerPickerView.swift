import SwiftUI
import UniformTypeIdentifiers
import MeeshySDK

// MARK: - Sticker Picker View

/// **La palette de CONSTRUCTIONS** (#4579, directive porteur 2026-08-31).
///
/// Cette feuille n'est plus un clavier d'emoji : elle propose ce qui se POSE
/// sur la scène — des décorations d'amour, l'heure qu'il est, un lieu alentour,
/// ses propres stickers. C'est ce qui évite de multiplier les icônes du rail :
/// une porte, cinq constructions, et un point d'extension pour la suivante.
///
/// ## Ce que la feuille ne décide pas
///
/// Ni la localisation (permission, `CLLocationManager`), ni le magasin de
/// « Mes stickers » (budget, éviction, disque). Les deux sont **injectés par
/// l'app** ; sans injection leur onglet est **absent**, jamais grisé — loi 4.
///
/// ## Le gel
///
/// L'heure est lue **une fois, à l'ouverture**, et figée dans les emplacements
/// du gabarit à la pose. Rien en aval ne relit l'horloge : tout lecteur voit
/// l'heure que l'auteur a composée, et une story archivée garde son sens.
public struct StickerPickerView: View {

    public var onStickerSelected: (String) -> Void
    /// Ce que fait un tap sur une vignette de « Mes stickers ». Requis, sans
    /// défaut : une bibliothèque peinte dont les vignettes ne mènent nulle part
    /// est une affordance inerte (loi 4).
    public var onLibraryStickerSelected: (StoryStickerLibraryItem) -> Void
    /// Ce que fait un tap sur une décoration d'AMOUR ou d'HEURE : poser un
    /// `StorySticker` de nature `.template`, avec ses emplacements déjà figés.
    ///
    /// **Requis, sans défaut** — même règle que `onLibraryStickerSelected` : un
    /// rappel par défaut vide ferait de la grille une affordance INERTE, qui
    /// vibre sous le doigt et ne pose rien (loi 4). Sans défaut, tout site de
    /// montage doit dire ce qu'il fait de la décoration.
    public var onTemplateSelected: (StickerTemplate, [String: String]) -> Void
    /// Ce que fait un tap sur une décoration de LIEU : poser un
    /// `StoryLocationObject` — la famille qui porte la donnée géographique que
    /// la plateforme LIT, jamais un sticker jumeau.
    public var onLocationTemplateSelected: (SharedPlace, StickerTemplate) -> Void

    @State var selectedCategory: StickerCategory = .smileys
    @State private var selectedTab: StickerPaletteTab = .emoji
    @Environment(\.colorScheme) var colorScheme

    /// V3-5 — « Mes stickers ». `nil` tant que l'app n'a pas injecté
    /// `.storyStickerLibraryProvided()`.
    @Environment(\.storyStickerLibrary) var stickerLibrary
    /// #4579 — les lieux alentour. `nil` tant que l'app n'a pas injecté son
    /// fournisseur : l'onglet « Lieu » n'existe alors pas.
    @Environment(\.stickerNearbyPlaces) var nearbyPlaces
    @Environment(\.stickerPaletteClock) private var clock

    @State var libraryItems: [StoryStickerLibraryItem] = []
    @State var places: [SharedPlace] = []
    @State var selectedPlaceIndex: Int = 0
    /// L'instant lu à l'OUVERTURE. Une seule lecture, figée ensuite : relire
    /// l'horloge à chaque rendu ferait bouger les vignettes sous le doigt.
    @State var openedAt: Date = .distantPast
    /// Les mots que l'auteur tape dans l'onglet Texte (#4822) — les vignettes
    /// se redessinent à la frappe (loi 7), et la pose les fige.
    @State var typedStickerText: String = ""

    public init(onStickerSelected: @escaping (String) -> Void,
                onLibraryStickerSelected: @escaping (StoryStickerLibraryItem) -> Void,
                onTemplateSelected: @escaping (StickerTemplate, [String: String]) -> Void,
                onLocationTemplateSelected: @escaping (SharedPlace, StickerTemplate) -> Void) {
        self.onStickerSelected = onStickerSelected
        self.onLibraryStickerSelected = onLibraryStickerSelected
        self.onTemplateSelected = onTemplateSelected
        self.onLocationTemplateSelected = onLocationTemplateSelected
    }

    /// Les onglets réellement servis — la loi 4, résolue par une fonction pure
    /// que son propre témoin exerce (`StickerPaletteTab.offered`).
    var offeredTabs: [StickerPaletteTab] {
        StickerPaletteTab.offered(hasLibrary: stickerLibrary != nil,
                                  hasNearbyPlaces: nearbyPlaces != nil)
    }

    public var body: some View {
        VStack(spacing: 0) {
            panelHeader
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 8)
            paletteTabs
            Divider().opacity(0.15)
            tabContent
        }
        .padding(16)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .task {
            // Une seule lecture de l'horloge, à l'ouverture (cf. doc de type).
            if openedAt == .distantPast { openedAt = clock() }
            if let stickerLibrary, libraryItems.isEmpty {
                libraryItems = await stickerLibrary.recents()
            }
        }
        // **La position se demande quand on ENTRE dans l'onglet, pas à
        // l'ouverture de la palette.**
        //
        // Mesuré au simulateur : charger les lieux dans le `.task` faisait
        // surgir l'alerte système « Autoriser Meeshy à utiliser votre
        // position ? » PAR-DESSUS la grille d'emoji, avant que l'auteur ait
        // manifesté le moindre intérêt pour un lieu. Une permission demandée
        // sans motif visible est une permission refusée — et un refus ferme
        // l'onglet pour de bon (l'injecteur ne sert plus le fournisseur).
        //
        // Le chargement reste UNE fois : `places.isEmpty` garde l'idempotence
        // quand on revient sur l'onglet.
        .adaptiveOnChange(of: selectedTab) { _, onglet in
            guard onglet == .place, let nearbyPlaces, places.isEmpty else { return }
            Task { places = await nearbyPlaces.nearby() }
        }
    }

    // MARK: - En-tête

    /// Le glyphe de la feuille — **le même que celui de la porte qui l'ouvre**
    /// (`ComposerRailDoor.sticker`). Une feuille dont l'en-tête ne ressemble pas
    /// au bouton qui vient de la faire monter est une rupture de continuité
    /// visuelle : l'utilisateur perd la trace de ce qu'il a touché.
    ///
    /// Aucun glyphe Apple ne s'appelle « sticker » ni « peel » (vérifié dans
    /// `CoreGlyphs.bundle`) ; celui-ci dit le geste — la feuille qui se décolle.
    /// iOS 16.0 = le plancher du projet.
    static let sheetSymbolName = "rectangle.portrait.on.rectangle.portrait.angled"

    private var panelHeader: some View {
        HStack {
            Image(systemName: Self.sheetSymbolName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(MeeshyColors.brandGradient)
            Text(String(localized: "story.sticker.title", defaultValue: "Stickers", bundle: .module))
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(colorScheme == .dark ? .white : MeeshyColors.indigo950)
            Spacer()
        }
    }

    // MARK: - Les onglets

    private var paletteTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(offeredTabs) { onglet in
                    Button {
                        withAnimation(.spring(response: 0.25)) { selectedTab = onglet }
                        HapticFeedback.light()
                    } label: {
                        VStack(spacing: 3) {
                            Image(systemName: onglet.symbolName)
                                .font(.system(size: 15, weight: .semibold))
                            Text(Self.tabTitle(onglet))
                                .font(.system(size: 9.5, weight: .semibold, design: .rounded))
                        }
                        .foregroundStyle(selectedTab == onglet
                                         ? AnyShapeStyle(MeeshyColors.brandGradient)
                                         : AnyShapeStyle(Color.secondary))
                        .frame(minWidth: 56, minHeight: 44)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(selectedTab == onglet
                                      ? Color.primary.opacity(0.08) : Color.clear)
                        )
                    }
                    // `.plain` obligatoire : le style par défaut rend les
                    // glyphes emoji INVISIBLES dans la sheet (vécu it.72).
                    .buttonStyle(.plain)
                    .accessibilityLabel(Self.tabTitle(onglet))
                    .accessibilityAddTraits(selectedTab == onglet ? [.isSelected] : [])
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        // Un onglet retiré sous le doigt (le magasin se démonte) laisserait la
        // feuille sur un contenu qui n'existe plus.
        .adaptiveOnChange(of: offeredTabs) { _, servis in
            if !servis.contains(selectedTab) { selectedTab = servis.first ?? .emoji }
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case .emoji:   emojiTab
        case .text:    textTab
        case .love:    templateTab(family: .love)
        case .joy:          templateTab(family: .joy)
        case .surprise:     templateTab(family: .surprise)
        case .mood:         templateTab(family: .mood)
        case .greeting:     templateTab(family: .greeting)
        case .reaction:     templateTab(family: .reaction)
        case .party:        templateTab(family: .party)
        case .availability: templateTab(family: .availability)
        case .nature: templateTab(family: .nature)
        case .cheer: templateTab(family: .cheer)
        case .answer: templateTab(family: .answer)
        case .food: templateTab(family: .food)
        case .sport: templateTab(family: .sport)
        case .travel: templateTab(family: .travel)
        case .work: templateTab(family: .work)
        case .music: templateTab(family: .music)
        case .time:    templateTab(family: .time)
        case .weather: templateTab(family: .weather)
        case .place:   placeTab
        case .library: libraryTab
        }
    }

    static func tabTitle(_ onglet: StickerPaletteTab) -> String {
        switch onglet {
        case .emoji:
            return String(localized: "sticker.tab.emoji", defaultValue: "Emoji", bundle: .module)
        case .text:
            return String(localized: "sticker.tab.text", defaultValue: "Texte", bundle: .module)
        case .love:
            return String(localized: "sticker.tab.love", defaultValue: "Amour", bundle: .module)
        case .time:
            return String(localized: "sticker.tab.time", defaultValue: "Heure", bundle: .module)
        case .weather:
            return String(localized: "sticker.tab.weather", defaultValue: "Météo", bundle: .module)
        case .joy:
            return String(localized: "sticker.tab.joy", defaultValue: "Joie", bundle: .module)
        case .surprise:
            return String(localized: "sticker.tab.surprise", defaultValue: "Stupeur", bundle: .module)
        case .mood:
            return String(localized: "sticker.tab.mood", defaultValue: "Humeur", bundle: .module)
        case .greeting:
            return String(localized: "sticker.tab.greeting", defaultValue: "Salut", bundle: .module)
        case .reaction:
            return String(localized: "sticker.tab.reaction", defaultValue: "Réactions", bundle: .module)
        case .party:
            return String(localized: "sticker.tab.party", defaultValue: "Fête", bundle: .module)
        case .availability:
            return String(localized: "sticker.tab.availability", defaultValue: "Dispo", bundle: .module)
        case .nature:
            return String(localized: "sticker.tab.nature", defaultValue: "Nature", bundle: .module)
        case .cheer:
            return String(localized: "sticker.tab.cheer", defaultValue: "Bravo", bundle: .module)
        case .answer:
            return String(localized: "sticker.tab.answer", defaultValue: "Réponses", bundle: .module)
        case .food:
            return String(localized: "sticker.tab.food", defaultValue: "Gourmand", bundle: .module)
        case .sport:
            return String(localized: "sticker.tab.sport", defaultValue: "Sport", bundle: .module)
        case .travel:
            return String(localized: "sticker.tab.travel", defaultValue: "Voyage", bundle: .module)
        case .work:
            return String(localized: "sticker.tab.work", defaultValue: "Travail", bundle: .module)
        case .music:
            return String(localized: "sticker.tab.music", defaultValue: "Musique", bundle: .module)
        case .place:
            return String(localized: "sticker.tab.place", defaultValue: "Lieu", bundle: .module)
        case .library:
            return String(localized: "story.sticker.library.title",
                          defaultValue: "Mes stickers", bundle: .module)
        }
    }
}
