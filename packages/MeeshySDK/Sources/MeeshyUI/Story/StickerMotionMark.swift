import SwiftUI
import MeeshySDK

// MARK: - « Ça bouge » — dit à l'œil, une fois pour toutes

/// **La marque d'une décoration ANIMÉE** (#5000, directive porteur 2026-09-03 :
/// « on doit distinguer durant la composition les stickers animés des stickers
/// non animé »).
///
/// ## Le défaut qu'elle corrige
///
/// Le mouvement d'un gabarit était déjà DIT à VoiceOver
/// (`StoryStickerAccessibility` compose « … qui palpite », onze libellés
/// localisés) et n'était montré à personne : la palette mêle animés et
/// immobiles dans la même grille — `StickerTemplateCatalog+Answer` sert `.pop`,
/// `.shake`, `.wobble`, `.bounce`, puis deux `nil`, puis `.tada` — et rien ne
/// les distinguait. Le lecteur d'écran était servi, l'œil était le parent
/// pauvre : le symétrique exact du défaut qu'on corrige d'habitude.
///
/// ## Deux marques pour un seul fait
///
/// - **la vignette BOUGE**, par la même `StickerAnimation.pose(at:)` qui
///   dessinera sur la scène. C'est la marque qui ne s'apprend pas : elle
///   montre le mouvement au lieu de le nommer, donc elle ne coûte à l'auteur
///   aucune connaissance (dimension 12 — la complexité se paie dans le code) ;
/// - **un glyphe la MARQUE**, parce que le mouvement seul ne suffit pas : il
///   n'existe pas dans une capture d'écran, il passe inaperçu quand on fait
///   défiler vite, et il disparaît entièrement sous « Réduire les animations ».
///
/// Les deux répondent à la même question et lisent la même source
/// (`template.animation != nil`) : il n'y a pas deux règles à tenir d'accord.
///
/// ## Pourquoi `livephoto`
///
/// C'est le glyphe par lequel Apple dit, depuis Photos, « cette image fixe est
/// en fait vivante ». L'auteur le connaît déjà et n'a rien à apprendre — un
/// `sparkles` aurait dit « magique », un `waveform` aurait dit « son », et
/// aucun des deux n'aurait dit CE fait-là.
public enum StickerMotionMark {

    /// Le glyphe, nommé une fois — la garde de vocabulaire peut le lire, un
    /// littéral recopié dans deux vues ne se garde pas.
    public static let symbolName = "livephoto"
}

// MARK: - La vignette qui bouge

/// Applique à une vue la pose d'une animation, au fil du temps.
///
/// **Le temps part de l'APPARITION de la vue**, jamais d'une horloge partagée :
/// `pose(at: 0)` étant l'identité par contrat, une vignette qui entre à l'écran
/// montre d'abord la décoration telle qu'elle se posera, puis se met à bouger —
/// et un `.pop` ou un `.tada`, qui jouent en UN COUP, jouent vraiment au lieu
/// d'être ratés pendant qu'on regardait ailleurs.
///
/// 30 Hz, pas 120 : c'est une vignette de 104 points dans une grille qui défile,
/// et le budget d'images se dépense sur la scène, pas ici.
public struct StickerMotionPreview: ViewModifier {
    private let animation: StickerAnimation?
    private let side: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var origine = Date()

    public init(animation: StickerAnimation?, side: CGFloat) {
        self.animation = animation
        self.side = side
    }

    public func body(content: Content) -> some View {
        if let animation, !reduceMotion {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { contexte in
                let pose = animation.pose(at: contexte.date.timeIntervalSince(origine))
                content
                    .rotationEffect(.degrees(pose.rotationDegrees))
                    .scaleEffect(pose.scale)
                    .offset(x: CGFloat(pose.offsetX) * side,
                            y: CGFloat(pose.offsetY) * side)
                    .opacity(pose.opacity)
            }
        } else {
            content
        }
    }
}

// MARK: - Le glyphe

/// La pastille posée sur une vignette animée. Muette pour VoiceOver : la
/// phrase du mouvement est déjà dans l'étiquette de la vignette
/// (`StoryStickerAccessibility.describing(_:motion:)`), et l'annoncer deux fois
/// ferait dire « qui palpite » puis « vivant » pour un seul fait.
public struct StickerMotionBadge: View {
    private let side: CGFloat

    public init(side: CGFloat) { self.side = side }

    public var body: some View {
        Image(systemName: StickerMotionMark.symbolName)
            .font(.system(size: side, weight: .semibold))
            .foregroundStyle(.white)
            .padding(3)
            .background(Circle().fill(Color.black.opacity(0.45)))
            .accessibilityHidden(true)
    }
}
