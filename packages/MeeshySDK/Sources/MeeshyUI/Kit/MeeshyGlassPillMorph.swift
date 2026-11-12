import SwiftUI

/// **Le verre de la pilule et son morphisme.** Le verre est le FOND du contenu
/// (une seule demande à K01) ; le contenu se met en page à sa taille naturelle,
/// sans jamais être contraint par le verre, donc sans boucle de mesure. La
/// taille mesurée du contenu pilote un cadre animé, ancré en bas, qui sert à la
/// fois de verre et de masque : le contenu est rogné à la forme du verre.
///
/// La première mesure ne joue rien (le cadre passe de « remplit le contenu » à
/// sa propre taille, identique). Un ressort interruptible repart de la taille
/// affichée ; « réduire les animations » le remplace par 200 ms sans ressort.
/// Seule la taille du verre s'anime : ni flou, ni ombre, ni mise en page.
///
/// Les boutons K02 posés dedans sont déclarés emboîtés : sous le verre dessiné,
/// ils ne portent aucune seconde matière (jamais de verre sur du verre).
struct MeeshyGlassPillMorph: ViewModifier {
    let tone: MeeshyGlassTone?
    let density: MeeshyGlassDensity
    let showsRow: Bool

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion
    @State private var shown: CGSize?

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: MeeshyGlassPillRecipe.radius, style: .continuous)
    }

    func body(content: Content) -> some View {
        let reduceMotion = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        return content
            .environment(\.meeshyGlassIsNested, true)
            .onGeometryChange(for: CGSize.self) { $0.size } action: { measured in
                guard Self.isUsable(measured), measured != shown else { return }
                shown = measured
            }
            .mask(alignment: .bottom) { framed(shape.fill(MeeshyColors.onMedia)) }
            .background(alignment: .bottom) {
                framed(Color.clear)
                    .meeshyGlass(in: shape, tone: tone, density: density)
            }
            .contentShape(Rectangle().inset(by: -MeeshyGlassPillRecipe.overflow))
            .animation(
                MeeshyGlassPillRecipe.morphAnimation(reduceMotion: reduceMotion),
                value: MeeshyGlassPillMorphKey(size: shown, showsRow: showsRow)
            )
    }

    private func framed<V: View>(_ view: V) -> some View {
        view.frame(width: shown?.width, height: shown?.height)
    }

    private static func isUsable(_ size: CGSize) -> Bool {
        size.width.isFinite && size.height.isFinite && size.width > 0 && size.height > 0
    }
}

private struct MeeshyGlassPillMorphKey: Equatable {
    let size: CGSize?
    let showsRow: Bool
}
