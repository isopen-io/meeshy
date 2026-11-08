import SwiftUI

// MARK: - Le bandeau qui défile sur l'avatar (#16755, iso web #16729)
//
// Ce qu'une personne écoute ou regarde, au détail que son cercle ouvre : la CATÉGORIE pour un Proche, le TITRE et
// l'ORIGINE pour un Sang. Ce détail ne se décide pas ici : l'app remet le texte que la passerelle a servi, déjà tronqué
// pour ce lecteur. Le défilement est celui du crédit d'un son (`AudioChipMarquee`), réutilisé : boucle sans saut,
// texte statique et tronqué sous Réduire les animations.

/// Ce que l'app remet au bandeau : le glyphe de la catégorie (décoratif), le texte qui défile, et la phrase que
/// VoiceOver entend.
public struct AvatarListening: Equatable, Sendable {
    public let glyph: String
    public let text: String
    public let spoken: String

    public init(glyph: String, text: String, spoken: String) {
        self.glyph = glyph
        self.text = text
        self.spoken = spoken
    }
}

/// Le bandeau, posé par-dessus un avatar de diamètre `avatarSize` (`.overlay`). Sous `minimumAvatarSize`, le texte
/// n'y serait pas lisible : l'écoute se réduit alors au glyphe de sa catégorie, posé en pastille (#16733) — la même
/// information servie, à la taille qui la porte. Le glyphe est statique : rien à réduire sous Réduire les animations.
public struct AvatarListeningBand: View {
    public static let minimumAvatarSize: CGFloat = 40

    let listening: AvatarListening
    let avatarSize: CGFloat

    public init(listening: AvatarListening, avatarSize: CGFloat) {
        self.listening = listening
        self.avatarSize = avatarSize
    }

    /// La hauteur du bandeau : un peu plus d'un quart du cercle, jamais sous 14 pt.
    public static func bandHeight(avatarSize: CGFloat) -> CGFloat {
        max(14, (avatarSize * 0.28).rounded())
    }

    public static func fontSize(avatarSize: CGFloat) -> CGFloat {
        max(9, (avatarSize * 0.14).rounded())
    }

    public enum Form: Equatable, Sendable {
        case band
        case glyph
    }

    /// Vrai quand le bandeau défilant se pose ; sinon, c'est le glyphe.
    public static func isShown(avatarSize: CGFloat) -> Bool {
        avatarSize >= minimumAvatarSize
    }

    public static func form(avatarSize: CGFloat) -> Form {
        isShown(avatarSize: avatarSize) ? .band : .glyph
    }

    /// Le diamètre de la pastille du glyphe : un peu plus d'un tiers du cercle, jamais sous 14 pt.
    public static func glyphDiameter(avatarSize: CGFloat) -> CGFloat {
        max(14, (avatarSize * 0.42).rounded())
    }

    public var body: some View {
        switch Self.form(avatarSize: avatarSize) {
        case .band: bandBody
        case .glyph: glyphBody
        }
    }

    private var glyphBody: some View {
        let diameter = Self.glyphDiameter(avatarSize: avatarSize)
        return ZStack(alignment: .bottomTrailing) {
            Color.clear
            Text(listening.glyph)
                .font(.system(size: (diameter * 0.62).rounded()))
                .frame(width: diameter, height: diameter)
                .background(Circle().fill(Color.black.opacity(0.55)))
                .overlay(Circle().stroke(Color.white.opacity(0.85), lineWidth: 1))
        }
        .frame(width: avatarSize, height: avatarSize)
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(listening.spoken)
        .accessibilityIdentifier("avatar.listening")
        .transition(.opacity)
    }

    private var bandBody: some View {
        let height = Self.bandHeight(avatarSize: avatarSize)
        return ZStack(alignment: .bottom) {
            Color.clear
            AudioChipMarquee(
                text: "\(listening.glyph) \(listening.text)",
                height: height,
                fontSize: Self.fontSize(avatarSize: avatarSize),
                tint: .white
            )
            .padding(.horizontal, avatarSize * 0.12)
            .frame(width: avatarSize, height: height)
            .background(Color.black.opacity(0.55))
        }
        .frame(width: avatarSize, height: avatarSize)
        .clipShape(Circle())
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(listening.spoken)
        .accessibilityIdentifier("avatar.listening")
        .transition(.opacity)
    }
}
