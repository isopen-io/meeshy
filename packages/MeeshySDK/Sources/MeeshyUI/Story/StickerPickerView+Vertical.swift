import SwiftUI
import MeeshySDK

// MARK: - Les catégories, à la VERTICALE (#5012)

/// > Directive porteur 2026-09-03 : « la liste des stickers et smileys **par
/// > categorie verticalement** ».
///
/// Le ruban horizontal d'onglets obligeait à faire défiler pour SAVOIR ce qui
/// existe : rien ne disait combien de familles restaient à droite, et l'auteur
/// découvrait « Météo » ou « Sport » par hasard. Une liste verticale montre
/// l'inventaire en même temps que le contenu.
///
/// **Un seul défilement.** C'est la contrainte qui a gouverné le remaniement :
/// chaque grille a perdu son `ScrollView` et son plafond de hauteur
/// (`templateGrid`, `emojiGrid`, la bibliothèque), parce qu'une grille bornée au
/// milieu d'une liste vole le geste vertical de celle qui la contient — et
/// devient inatteignable au doigt sur un écran court.
extension StickerPickerView {

    /// Le contenu servi, gouverné par la NATURE choisie.
    @ViewBuilder
    var naturedContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                switch selectedNature {
                case .smiley:  smileySections
                case .sticker: stickerSections
                }
            }
            .padding(.bottom, 8)
        }
        // **Changer de nature REPART du début** — mesuré au simulateur : sans
        // cela, basculer sticker → smiley garde l'offset et dépose l'auteur au
        // milieu des « Objets », sur une liste qu'il n'a jamais parcourue. Un
        // défilement conservé n'a de sens que pour une liste qu'on RETROUVE,
        // jamais pour une qu'on découvre.
        //
        // `.id` sur la nature plutôt qu'un `ScrollViewReader` : la liste est
        // paresseuse, sa reconstruction ne coûte que les sections visibles, et
        // un lecteur aurait demandé une ancre par section pour un seul usage.
        .id(selectedNature)
        .frame(maxHeight: 420)
    }

    // MARK: - Smileys

    /// Les huit catégories Unicode, chacune sous son titre.
    @ViewBuilder
    private var smileySections: some View {
        ForEach(StickerCategory.allCases, id: \.self) { categorie in
            Section {
                emojiGrid(categorie)
            } header: {
                sectionHeader(icone: categorie.icon, titre: categorie.title)
            }
        }
    }

    // MARK: - Stickers

    /// Une section par onglet SERVI, dans l'ordre où la palette les offre.
    ///
    /// `offeredTabs` reste la source : un magasin non injecté (les lieux, la
    /// bibliothèque) ne doit pas laisser une section vide derrière lui, et
    /// c'est déjà cette liste qui le sait.
    @ViewBuilder
    private var stickerSections: some View {
        ForEach(offeredTabs.filter { StickerPaletteNature.of($0) == .sticker }) { onglet in
            Section {
                stickerSectionContent(onglet)
            } header: {
                sectionHeader(icone: nil,
                              symbole: onglet.symbolName,
                              titre: Self.tabTitle(onglet))
            }
        }
    }

    /// **Trois onglets ne sont pas de simples grilles**, et c'est ce qui empêche
    /// de tout traiter par `templateGrid` :
    ///
    /// - `text` porte un CHAMP au-dessus de sa grille, et sa grille ne pose rien
    ///   tant que rien n'est tapé (loi 4) ;
    /// - `place` porte les puces de lieu, et un lieu ne se pose PAS en sticker —
    ///   lui seul a des coordonnées et un id de POI que la plateforme lit ;
    /// - `library` porte le bouton COLLER et son état vide.
    @ViewBuilder
    private func stickerSectionContent(_ onglet: StickerPaletteTab) -> some View {
        switch onglet {
        case .text:    textTab
        case .place:
            // **La permission de position se demande quand l'auteur ARRIVE sur
            // la section**, pas à l'ouverture de la palette.
            //
            // La règle vient du ruban qu'on remplace : charger les lieux dans le
            // `.task` faisait surgir l'alerte système par-dessus la grille
            // d'emoji, avant tout intérêt manifesté — et une permission demandée
            // sans motif visible est une permission refusée, donc un onglet
            // fermé pour de bon.
            //
            // La `LazyVStack` ne construit cette section qu'en arrivant dessus :
            // le geste de défilement DIT l'intérêt, exactement comme le tap sur
            // l'onglet le disait. `places.isEmpty` garde l'idempotence.
            placeTab.onAppear {
                guard let nearbyPlaces, places.isEmpty else { return }
                Task { places = await nearbyPlaces.nearby() }
            }
        case .library: libraryTab
        default:
            if let famille = onglet.templateFamily {
                templateGrid(family: famille)
            }
        }
    }

    // MARK: - L'en-tête d'une section

    /// **Il porte le trait d'en-tête pour VoiceOver.** Sans lui, le rotor des
    /// en-têtes ne rend rien et la liste redevient un mur — c'est la moitié
    /// d'accessibilité qu'un ruban d'onglets donnait gratuitement (chaque onglet
    /// était un bouton nommé) et qu'une liste doit rendre à la main.
    @ViewBuilder
    private func sectionHeader(icone: String? = nil,
                               symbole: String? = nil,
                               titre: String) -> some View {
        HStack(spacing: 6) {
            if let icone {
                Text(icone).font(.system(size: 14))
            } else if let symbole {
                Image(systemName: symbole)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(MeeshyColors.brandGradient)
            }
            Text(titre)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Le nom d'une catégorie d'emoji

public extension StickerCategory {
    /// Le titre d'une section. L'icône seule suffisait à un onglet de 40 pt ;
    /// une section a la largeur d'un nom, et un lecteur d'écran n'a jamais rien
    /// pu faire d'un pictogramme.
    var title: String {
        switch self {
        case .smileys:
            return String(localized: "sticker.category.smileys", defaultValue: "Smileys", bundle: .module)
        case .animals:
            return String(localized: "sticker.category.animals", defaultValue: "Animaux", bundle: .module)
        case .food:
            return String(localized: "sticker.category.food", defaultValue: "Nourriture", bundle: .module)
        case .activities:
            return String(localized: "sticker.category.activities", defaultValue: "Activités", bundle: .module)
        case .travel:
            return String(localized: "sticker.category.travel", defaultValue: "Voyage", bundle: .module)
        case .objects:
            return String(localized: "sticker.category.objects", defaultValue: "Objets", bundle: .module)
        case .symbols:
            return String(localized: "sticker.category.symbols", defaultValue: "Symboles", bundle: .module)
        case .flags:
            return String(localized: "sticker.category.flags", defaultValue: "Drapeaux", bundle: .module)
        }
    }
}
