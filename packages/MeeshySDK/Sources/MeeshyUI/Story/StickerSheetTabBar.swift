import SwiftUI
import MeeshySDK

// MARK: - La barre des cinq onglets

/// **Cinq positions, en verre** (directive porteur 2026-09-05).
///
/// Elle remplace `StickerNatureSwitch`, l'interrupteur à deux positions de
/// #5012 — retiré avec son type, aucun site ne le montait plus —, et hérite de
/// sa forme pour une raison qui n'est pas esthétique :
/// l'auteur retrouve au même endroit un contrôle qui se manipule pareil. Ce
/// qui change est le NOMBRE de positions, donc la place de chacune.
///
/// ## Le glyphe ET le mot, jamais le glyphe seul
///
/// Cinq pictogrammes sans légende obligent à les essayer pour savoir ce
/// qu'ils ouvrent — cinq essais à la première visite, et la mémoire à chaque
/// suivante. Le mot coûte huit points de hauteur ; l'exploration coûte
/// davantage, et elle se paie à CHAQUE ouverture pour qui ne l'a pas retenue.
///
/// Le libellé se réduit (`minimumScaleFactor`) plutôt que de tronquer : cinq
/// entrées sur un iPhone étroit sont serrées, et « Dynamique » abrégé en
/// « Dynami… » n'apprend rien de plus qu'un pictogramme.
public struct StickerSheetTabBar: View {

    @Binding var selection: StickerSheetTab
    @Environment(\.colorScheme) private var colorScheme

    public init(selection: Binding<StickerSheetTab>) {
        self._selection = selection
    }

    public var body: some View {
        HStack(spacing: 4) {
            ForEach(StickerSheetTab.allCases) { onglet in
                Button {
                    // L'animation porte sur la SÉLECTION, donc sur la pastille
                    // qui glisse — le contenu, lui, se remplace sans ressort :
                    // animer une liste qu'on vient de changer entièrement fait
                    // clignoter des sections que personne n'a demandées.
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                        selection = onglet
                    }
                    HapticFeedback.light()
                } label: {
                    entree(onglet)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(onglet.title)
                .accessibilityAddTraits(onglet == selection ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(4)
        .adaptiveGlass(in: Capsule())
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func entree(_ onglet: StickerSheetTab) -> some View {
        let choisi = onglet == selection
        VStack(spacing: 3) {
            Image(systemName: onglet.symbolName)
                .font(.system(size: 13, weight: .semibold))
            Text(onglet.title)
                .font(.system(size: 9, weight: choisi ? .bold : .medium, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        // Le CHOISI porte le dégradé de marque ; les autres restent en encre
        // secondaire. Le remplissage marque la position, pas le contour : sur
        // une capsule de 44 pt, un anneau se confond avec le socle de verre.
        .foregroundStyle(choisi ? AnyShapeStyle(MeeshyColors.brandGradient)
                                : AnyShapeStyle(Color.secondary))
        .frame(maxWidth: .infinity)
        .frame(height: 40)
        .background {
            if choisi {
                Capsule().fill(colorScheme == .dark ? Color.white.opacity(0.12)
                                                    : Color.white.opacity(0.85))
            }
        }
        .contentShape(Capsule())
    }
}

// MARK: - Épingler une décoration

/// **L'appui long épingle** (directive porteur 2026-09-05 : un onglet FAVORIS
/// suppose un geste qui le remplit).
///
/// `contextMenu` plutôt qu'une étoile posée sur chaque vignette : une étoile
/// permanente occuperait un coin de chacune des ~200 décorations pour un geste
/// qu'on fait une fois. L'appui long est le geste que l'app emploie déjà pour
/// « ce que je peux faire de cet élément » (menu de la scène, menu d'un
/// message) — la cohérence de positionnement (dimension 6) veut qu'il fasse
/// ici la même chose.
///
/// Le libellé DIT l'état courant, jamais l'action neutre : « Retirer des
/// favoris » sur une décoration épinglée, « Épingler » sinon. Un menu qui
/// afficherait « Favori » sans dire dans quel sens il bascule oblige à essayer
/// pour savoir.
struct StickerFavoriteMenu: ViewModifier {
    let entree: StickerUsageEntry
    @ObservedObject var usage: StickerUsageStore

    func body(content: Content) -> some View {
        content.contextMenu {
            Button {
                usage.toggleFavorite(entree)
                HapticFeedback.light()
            } label: {
                if usage.isFavorite(entree) {
                    Label(String(localized: "sticker.sheet.unpin",
                                 defaultValue: "Retirer des favoris", bundle: .module),
                          systemImage: "star.slash")
                } else {
                    Label(String(localized: "sticker.sheet.pin",
                                 defaultValue: "Épingler aux favoris", bundle: .module),
                          systemImage: "star")
                }
            }
        }
    }
}

extension View {
    func stickerFavoriteMenu(_ entree: StickerUsageEntry,
                             usage: StickerUsageStore) -> some View {
        modifier(StickerFavoriteMenu(entree: entree, usage: usage))
    }
}
