import SwiftUI

/// **Le pictogramme de la flamme-œil** (#8303) : une flamme qui porte un œil.
///
/// La flamme dit l'éphémère (`MessageProtectionSymbols.ephemeral`) ; l'œil dit
/// que c'est la LECTURE qui le déclenche. Aucun symbole système ne compose les
/// deux, d'où cet atome : l'œil est découpé dans la flamme (`destinationOut`),
/// il reste donc lisible sur n'importe quel fond, clair ou sombre.
public struct FlameEyeGlyph: View {
    private let size: CGFloat
    private let tint: Color

    public init(size: CGFloat, tint: Color) {
        self.size = size
        self.tint = tint
    }

    public var body: some View {
        ZStack {
            Image(systemName: "flame.fill")
                .resizable()
                .scaledToFit()
                .foregroundStyle(tint)
            Image(systemName: "eye.fill")
                .resizable()
                .scaledToFit()
                .frame(width: size * 0.56)
                .offset(y: size * 0.17)
                .blendMode(.destinationOut)
        }
        .compositingGroup()
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// **La flamme-œil en FILIGRANE derrière un message** (#8303, précision porteur
/// du 2026-09-27) : ni décompte ni pastille — une grande flamme discrète, posée
/// derrière l'avatar, dans la GOUTTIÈRE qui sépare le bord de la rangée du bord
/// d'attaque du contenu (la première lettre du message, ou l'angle de la pièce
/// jointe). Jamais par-dessus le texte : elle vit dans l'arrière-plan de la
/// rangée, bornée à la gouttière.
public struct AfterReadWatermark: ViewModifier {
    let isActive: Bool
    /// La largeur de la gouttière : de l'avatar à la première lettre.
    let gutter: CGFloat
    let tint: Color
    /// Le bord de la gouttière — à gauche pour un message reçu, du côté de
    /// l'avatar ; à droite pour la bulle de l'auteur, qui n'en a pas.
    let edge: HorizontalEdge
    /// Ce que la gouttière déborde HORS de la rangée — la bulle n'a pas
    /// d'avatar à côté d'elle : sa gouttière est la marge du fil.
    let overhang: CGFloat

    public func body(content: Content) -> some View {
        content.background(alignment: edge == .leading ? .topLeading : .topTrailing) {
            if isActive {
                FlameEyeGlyph(size: gutter, tint: tint)
                    .scaleEffect(1.35, anchor: .top)
                    .opacity(0.16)
                    .frame(width: gutter)
                    .offset(x: edge == .leading ? -overhang : overhang)
                    .allowsHitTesting(false)
            }
        }
    }
}

public extension View {
    /// Pose la flamme-œil en filigrane dans la gouttière de cette rangée (#8303).
    func afterReadWatermark(_ isActive: Bool, gutter: CGFloat, tint: Color,
                            edge: HorizontalEdge = .leading, overhang: CGFloat = 0) -> some View {
        modifier(AfterReadWatermark(isActive: isActive, gutter: gutter, tint: tint, edge: edge, overhang: overhang))
    }
}
