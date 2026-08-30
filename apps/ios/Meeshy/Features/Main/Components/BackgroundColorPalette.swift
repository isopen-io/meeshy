import SwiftUI
import MeeshyUI

/// **La bande de pastilles de couleur du composeur — une seule fois pour deux
/// surfaces, et une cible tactile qui n'est plus le dessin.**
///
/// `ComposerSceneBand.palette` et la palette de `ComposerDocumentSurface`
/// portaient la même bande, au caractère près : `Circle().fill(Color(hex:))`
/// de 28 pt, même contour, même espacement, même marge — et le même défaut,
/// deux fois.
///
/// ### La cible tactile ÉTAIT le dessin
///
/// Une pastille de 28 pt n'a que 40 % de la surface qu'Apple demande (784 pt²
/// contre 1936). Le `.padding(.vertical, 8)` qui l'entourait n'y changeait
/// rien : il vivait sur le `HStack` PARENT, donc en dehors du bouton. La bande
/// mesurait déjà 44 pt de haut — 8 + 28 + 8 — mais **seuls les 28 pt du milieu
/// répondaient**. Les seize points de marge étaient de l'espace perdu au sens
/// propre : posés là pour aérer, ils ne servaient rien d'autre.
///
/// La pastille les récupère : cible de 44 × 44, dessin inchangé à 28 pt, marge
/// verticale du parent retirée. **La bande fait exactement la même hauteur
/// qu'avant.**
///
/// ### Dix-sept boutons qui portaient tous le même nom
///
/// Chaque pastille s'annonçait « Arrière-plan » — le nom du GROUPE, répété
/// dix-sept fois, sans rien qui distingue une couleur d'une autre. Le nom est
/// désormais POSITIONNEL (« Couleur 3 sur 17 »), pour la raison exacte qui a
/// fait choisir la position sur la barre d'étapes de l'inscription (242i) :
/// une couleur n'a pas de nom court dans le dépôt, et la position est
/// l'information que le lecteur cherche pour parcourir la bande. Le nom du
/// groupe reste sur le conteneur, où il a toujours eu sa place.
struct BackgroundColorPalette: View {

    /// Côté de la zone sensible. Le dessin, lui, garde ses 28 pt : la cible
    /// n'est pas le dessin.
    static let hitSide: CGFloat = 44

    /// Diamètre du disque VISIBLE — inchangé depuis les deux copies.
    static let swatchDiameter: CGFloat = 28

    let colors: [String]
    let onPick: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                // Indexé et non `id: \.self` sur la couleur : le nom accessible
                // EST le rang, et deux teintes identiques dans une palette
                // rendraient une identité dupliquée.
                ForEach(colors.indices, id: \.self) { index in
                    let hex = colors[index]
                    Button {
                        onPick(hex)
                    } label: {
                        Circle()
                            .fill(Color(hex: hex))
                            .frame(width: Self.swatchDiameter, height: Self.swatchDiameter)
                            .overlay(Circle().stroke(
                                MeeshyColors.textSecondary(isDark: true).opacity(0.25),
                                lineWidth: 1))
                            // Dans le label, jamais après le contrôle : la zone
                            // sensible d'un `Button` EST le cadre de son label
                            // (leçon 249i).
                            .frame(width: Self.hitSide, height: Self.hitSide)
                            // `Rectangle` et non `Circle` : la HIG mesure une
                            // AIRE de 44 × 44, et l'espacement de 10 pt garantit
                            // qu'aucune cellule n'en chevauche une autre.
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel(Self.positionLabel(index: index, total: colors.count))
                }
            }
            // Pas de `.padding(.vertical, 8)` : ces seize points sont DANS la
            // cible désormais. Les reposer doublerait la hauteur de la bande.
            .padding(.horizontal, 16)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerDocumentCopy.background))
    }

    /// « Couleur 3 sur 17 ».
    ///
    /// Les deux nombres passent par `LocalizedNumber.exact` AVANT d'être
    /// injectés — le catalogue porte donc des `%@`, pas des `%lld`. C'est la
    /// source unique du dépôt pour « un nombre écrit dans le système de
    /// chiffres du lecteur » (241i) : une interface arabe mêlerait sinon
    /// chiffres arabo-indiens et chiffres latins dans la même phrase.
    ///
    /// `bundle` et `locale` vont par PAIRE : le bundle choisit la table, le
    /// locale applique ses règles à cette table.
    static func positionLabel(index: Int,
                              total: Int,
                              bundle: Bundle = .main,
                              locale: Locale = .current) -> String {
        let position = LocalizedNumber.exact(index + 1, locale: locale)
        let count = LocalizedNumber.exact(total, locale: locale)
        return String(
            localized: "a11y.color.position",
            defaultValue: "Couleur \(position) sur \(count)",
            bundle: bundle,
            locale: locale
        )
    }
}
