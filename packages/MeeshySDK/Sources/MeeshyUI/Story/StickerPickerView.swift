import SwiftUI
import PhotosUI
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

    /// **L'ONGLET choisi** (directive porteur 2026-09-05) — il remplace
    /// `selectedNature`, l'interrupteur à deux positions de #5012.
    ///
    /// La nature répondait à « qu'est-ce que c'est ? » ; l'onglet répond à
    /// « qu'est-ce que je cherche ? », question qui vient AVANT. Le
    /// raisonnement complet vit dans `StickerSheetTab`, avec ce que le
    /// remplacement corrige : dix-huit sections toutes également lointaines,
    /// où la deuxième visite coûtait autant que la première.
    @State var selectedTab: StickerSheetTab = .search
    /// Les mots tapés dans l'onglet RECHERCHE — ils filtrent le catalogue à la
    /// frappe (loi 7), et ne survivent pas à la fermeture : une recherche est
    /// une intention du moment, pas une préférence.
    @State var searchQuery: String = ""
    @Environment(\.colorScheme) var colorScheme
    /// **Fermer la feuille.** `@Environment(\.dismiss)` plutôt qu'un rappel au
    /// contrat : les trois hôtes la présentent en `.sheet`, et un rappel de
    /// plus aurait obligé chacun à redire ce que le système sait déjà faire.
    @Environment(\.dismiss) var dismiss
    /// Les favoris et les récents. Le magasin est un STORE DE PRÉFÉRENCES,
    /// donc SDK — il retient, il rend, il borne, il ne décide de rien.
    @ObservedObject var usage: StickerUsageStore = .shared

    /// V3-5 — « Mes stickers ». `nil` tant que l'app n'a pas injecté
    /// `.storyStickerLibraryProvided()`.
    @Environment(\.storyStickerLibrary) var stickerLibrary
    /// #4579 — les lieux alentour. `nil` tant que l'app n'a pas injecté son
    /// fournisseur : l'onglet « Lieu » n'existe alors pas.
    @Environment(\.stickerNearbyPlaces) var nearbyPlaces
    @Environment(\.stickerPaletteClock) private var clock

    @State var libraryItems: [StoryStickerLibraryItem] = []
    /// La photo choisie pour un DÉTOURAGE (#3955) — remise à `nil` dès que
    /// la tâche l'a consommée, sinon rouvrir l'onglet re-détourerait la
    /// même image.
    @State var liftSelection: PhotosPickerItem?
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
                .padding(.bottom, 10)
            StickerSheetTabBar(selection: $selectedTab)
                .padding(.bottom, 8)
            Divider().opacity(0.15)
            tabbedContent
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

    /// **L'en-tête : le `✕` en verre, puis le logo et le titre — tous à
    /// GAUCHE** (directive porteur 2026-09-05).
    ///
    /// > « Rendre un header propre avec (X) en liquidglass et le titre et logo
    /// > Stickers à gauche »
    ///
    /// ## Le `✕` n'existait pas, et son absence n'était pas une décision
    ///
    /// La feuille se fermait par le GLISSEMENT, seul geste offert. Il marche —
    /// et il est invisible : rien sur l'écran ne dit qu'il existe, et un auteur
    /// qui ne le connaît pas n'a aucune sortie. Une feuille dont la seule
    /// fermeture est un geste appris ailleurs est fermée pour qui ne l'a pas
    /// appris.
    ///
    /// ## Pourquoi le titre reste à GAUCHE du `✕`, et non centré
    ///
    /// Un titre centré cède la moitié de sa largeur aux deux marges qui
    /// l'équilibrent, pour une feuille qui n'a qu'UNE action d'en-tête. Groupés
    /// à gauche, le glyphe, le mot et la croix se lisent dans l'ordre du regard
    /// et laissent la droite libre — c'est ce que la directive demande, et
    /// c'est aussi ce qui laisse la place à une action future sans rien
    /// déplacer.
    ///
    /// **`adaptiveGlass` et non `glassEffect`** : l'enrobage du SDK rend le vrai
    /// Liquid Glass sur iOS 26 et un matériau translucide en dessous. Le
    /// plancher du projet est iOS 16, et un appel direct ne compilerait pas
    /// sans une garde de version que ce site n'a pas à porter.
    private var panelHeader: some View {
        HStack(spacing: 10) {
            Button(action: { dismiss() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(colorScheme == .dark ? .white : MeeshyColors.indigo950)
                    // 32 pt de DESSIN dans une cible de 44 — le plancher
                    // tactile (dimension 5) porte sur ce que le doigt vise,
                    // jamais sur ce que l'œil voit.
                    .frame(width: 32, height: 32)
                    .adaptiveGlass(in: Circle())
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "sticker.sheet.close",
                                       defaultValue: "Fermer", bundle: .module))

            Image(systemName: Self.sheetSymbolName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(MeeshyColors.brandGradient)
            Text(String(localized: "story.sticker.title", defaultValue: "Stickers", bundle: .module))
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(colorScheme == .dark ? .white : MeeshyColors.indigo950)
            Spacer(minLength: 0)
        }
        // Le titre et le glyphe DISENT la même chose que le bouton qui a ouvert
        // la feuille ; les fusionner évite à VoiceOver de lire deux éléments
        // pour un seul en-tête, et le trait dit au rotor que c'en est un.
        .accessibilityElement(children: .contain)
    }

    // MARK: - Les onglets

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
