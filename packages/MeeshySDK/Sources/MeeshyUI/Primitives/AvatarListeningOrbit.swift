import SwiftUI

// MARK: - Ce qu'une personne écoute, en orbite AUTOUR de son avatar (#19854)
//
// Le bandeau posé en bas du cercle (#16755) couvrait le visage et se lisait mal. L'écoute tourne désormais AUTOUR de
// l'avatar, au-delà de l'anneau de story, sans rien recouvrir : le texte suit un cercle et le cercle tourne lentement.
// Sous Réduire les animations, il reste immobile, le début en haut.

/// La géométrie de l'orbite, en valeurs : où se pose le texte, à quelle taille, et ce qui en tient sur le tour.
public nonisolated enum AvatarListeningOrbitLayout {
    /// L'écart entre le bord extérieur de l'anneau de story et le pied des lettres.
    public static let gap: CGFloat = 1.5
    /// Un tour complet, en secondes : assez lent pour se lire en suivant.
    public static let turnDuration: Double = 14
    /// La part du tour laissée vide entre la fin et le début du texte.
    public static let closingGap: CGFloat = 0.12

    /// Le bord extérieur de l'anneau de story d'un avatar (`ringSize = size + 6`, trait doublé jusqu'à 5 pt).
    public static func storyRingOuterRadius(avatarSize: CGFloat) -> CGFloat {
        avatarSize / 2 + 3 + 2.5
    }

    public static func fontSize(avatarSize: CGFloat) -> CGFloat {
        max(8, (avatarSize * 0.17).rounded())
    }

    /// Le rayon où se centrent les lettres : leur pied passe au-delà de l'anneau de story.
    public static func radius(avatarSize: CGFloat) -> CGFloat {
        storyRingOuterRadius(avatarSize: avatarSize) + gap + fontSize(avatarSize: avatarSize) / 2
    }

    /// Le côté du carré qui contient l'orbite et le haut de ses lettres.
    public static func side(avatarSize: CGFloat) -> CGFloat {
        2 * (radius(avatarSize: avatarSize) + fontSize(avatarSize: avatarSize))
    }

    /// Les caractères qui tiennent sur le tour, la fin laissée vide ; un texte trop long se termine par « … ».
    public static func fitted(_ characters: [Character], widths: [CGFloat], circumference: CGFloat,
                              ellipsisWidth: CGFloat) -> [Character] {
        let room = circumference * (1 - closingGap)
        guard widths.reduce(0, +) > room else { return characters }
        let kept = zip(characters, widths).reduce(into: (chars: [Character](), used: CGFloat(0))) { acc, pair in
            guard acc.used + pair.1 + ellipsisWidth <= room else { return }
            acc.chars.append(pair.0)
            acc.used += pair.1
        }
        return kept.chars + ["…"]
    }
}

/// L'orbite, posée par-dessus un avatar de diamètre `avatarSize` (`.overlay`) : elle déborde du cercle sans le couvrir.
public struct AvatarListeningOrbit: View {
    let listening: AvatarListening
    let avatarSize: CGFloat

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var isTurning = false

    public init(listening: AvatarListening, avatarSize: CGFloat) {
        self.listening = listening
        self.avatarSize = avatarSize
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    public var body: some View {
        let side = AvatarListeningOrbitLayout.side(avatarSize: avatarSize)
        return ring
            .frame(width: side, height: side)
            .rotationEffect(.degrees(isTurning ? 360 : 0))
            .animation(reduceMotion ? nil : .linear(duration: AvatarListeningOrbitLayout.turnDuration)
                .repeatForever(autoreverses: false), value: isTurning)
            .onAppear { isTurning = !reduceMotion }
            .frame(width: avatarSize, height: avatarSize)
            .allowsHitTesting(false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(listening.spoken)
            .accessibilityIdentifier("avatar.listening")
            .transition(.opacity)
    }

    private var ring: some View {
        let fontSize = AvatarListeningOrbitLayout.fontSize(avatarSize: avatarSize)
        let radius = AvatarListeningOrbitLayout.radius(avatarSize: avatarSize)
        let ink = colorScheme == .dark ? MeeshyColors.indigo100 : MeeshyColors.indigo700
        let text = "\(listening.glyph) \(listening.text)"
        return Canvas { canvas, size in
            let context = canvas
            let font = Font.system(size: fontSize, weight: .semibold, design: .rounded)
            let resolve = { (character: Character) -> GraphicsContext.ResolvedText in
                var glyph = context.resolve(Text(String(character)).font(font))
                glyph.shading = .color(ink)
                return glyph
            }
            let unbounded = CGSize(width: CGFloat.infinity, height: CGFloat.infinity)
            let characters = Array(text)
            let widths = characters.map { resolve($0).measure(in: unbounded).width }
            let shown = AvatarListeningOrbitLayout.fitted(characters, widths: widths, circumference: 2 * .pi * radius,
                                                         ellipsisWidth: resolve("…").measure(in: unbounded).width)
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            _ = shown.reduce(CGFloat(0)) { travelled, character in
                let glyph = resolve(character)
                let width = glyph.measure(in: unbounded).width
                let angle = (travelled + width / 2) / radius
                var placed = context
                placed.translateBy(x: center.x, y: center.y)
                placed.rotate(by: .radians(Double(angle)))
                placed.draw(glyph, at: CGPoint(x: 0, y: -radius), anchor: .center)
                return travelled + width
            }
        }
    }
}
