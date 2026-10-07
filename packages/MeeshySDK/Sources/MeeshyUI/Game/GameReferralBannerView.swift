import SwiftUI
import MeeshySDK

// MARK: - Le bandeau de parrainage de la carte partagée (#7742, #9554)
//
// En bas de la carte d'un moment photo, un bandeau indigo (86 %) qui porte la Signature,
// « Rejoins-moi sur Meeshy », la Flamme de l'utilisateur et son lien de parrainage en CARRÉ QR
// (#9554) : le lien ne s'écrit plus, il se capture. Sa géométrie est celle du web
// (`GameReferralBannerMetrics`) : le carré en fin de ligne, le bandeau retourné en entier en arabe.
//
// La brique dessine ; elle ne sait rien du lien. L'hôte lui passe les phrases localisées et le
// lien tel qu'il part — et ne monte JAMAIS ce bandeau sans lien : « sans lien disponible, la
// carte part sans lui, et sans placeholder qui ressemblerait à un lien » (conformité H-8).
//
// UNE exception, décidée par le porteur : dans l'APERÇU, tant que l'utilisateur n'a aucun jeton (le
// jeton se crée au toucher de « Partager », jamais avant), la place du carré est un EMPLACEMENT VIDE
// cerné de pointillés (`link == nil`) — ni module, ni fond clair. L'hôte ne le monte jamais dans une
// image qui sort de l'app.
//
// Tout se dessine à l'échelle de la HAUTEUR offerte. Les couleurs sont fixes — la carte est une
// IMAGE partagée hors de l'app, jamais habillée par le thème de celui qui la compose. Seul le carré
// s'annonce au lecteur d'écran ; le reste est un décor.

public struct GameReferralBannerView: View {

    private let title: String
    private let link: String?
    private let qrLabel: String
    private let flameForm: FlameFormKey?
    private let flameLabel: String?
    private let rightToLeft: Bool

    /// - Parameters:
    ///   - title: « Rejoins-moi sur Meeshy ».
    ///   - link: le lien COMPLET que le carré QR encode (« https://meeshy.me/signup/affiliate/AMANI7 ») ;
    ///     `nil` ⇒ le lien n'existe pas encore : la place du carré est un emplacement vide en pointillé.
    ///   - qrLabel: ce que le lecteur d'écran dit du carré (« QR code de ton lien d'invitation »).
    ///   - flameForm: la forme de la Flamme de l'utilisateur ; `nil` ⇒ pas de Flamme sur la carte
    ///     (il l'a retirée, ou n'en a pas).
    ///   - flameLabel: « 23 j », sous la Flamme.
    ///   - rightToLeft: `true` ⇒ le bandeau se retourne, le carré passe à gauche.
    public init(title: String, link: String?, qrLabel: String, flameForm: FlameFormKey? = nil, flameLabel: String? = nil,
                rightToLeft: Bool = false) {
        self.title = title
        self.link = link
        self.qrLabel = qrLabel
        self.flameForm = flameForm
        self.flameLabel = flameLabel
        self.rightToLeft = rightToLeft
    }

    private static let ink = Color(hex: "1c1941")
    private static let linkInk = Color(hex: "c7d2fe")

    public var body: some View {
        GeometryReader { proxy in
            let metrics = GameReferralBannerMetrics(size: proxy.size, rightToLeft: rightToLeft, hasFlame: flameForm != nil)
            let k = proxy.size.height / 66
            ZStack(alignment: .topLeading) {
                decor(metrics, k: k)
                    .accessibilityHidden(true)
                slot(metrics.qr, k: k)
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
            .environment(\.layoutDirection, .leftToRight)
        }
        .accessibilityElement(children: .contain)
    }

    private func decor(_ metrics: GameReferralBannerMetrics, k: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 16 * k, style: .continuous).fill(Self.ink.opacity(0.86))
            SignatureMark(style: .flat, color: .white, strokeWidth: 110)
                .placed(metrics.signature)
            Text(title)
                .font(.system(size: metrics.titleSize, weight: .heavy, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(width: metrics.title.width, height: metrics.title.height, alignment: rightToLeft ? .trailing : .leading)
                .offset(x: metrics.title.minX, y: metrics.title.minY)
            if let flameForm {
                FlameView(form: flameForm, flickers: false)
                    .placed(metrics.flame)
                if let flameLabel {
                    Text(flameLabel)
                        .font(.system(size: metrics.flameLabelSize, weight: .medium, design: .monospaced))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .placed(metrics.flameLabel)
                }
            }
        }
    }

    /// Le carré QR du lien ; ou, sans jeton, son EMPLACEMENT : un cadre en pointillé, vide.
    @ViewBuilder
    private func slot(_ rect: CGRect, k: CGFloat) -> some View {
        if let link {
            if let square = GameReferralQRSquare.make(link: link, side: Int(rect.width)) {
                GameReferralQRView(square: square)
                    .accessibilityElement()
                    .accessibilityLabel(qrLabel)
                    .accessibilityAddTraits(.isImage)
                    .placed(rect)
            }
        } else {
            RoundedRectangle(cornerRadius: 4 * k, style: .continuous)
                .strokeBorder(Self.linkInk.opacity(0.85), style: StrokeStyle(lineWidth: max(2, rect.width * 0.02), dash: [rect.width * 0.08, rect.width * 0.06]))
                .placed(rect)
                .accessibilityHidden(true)
        }
    }
}

private extension View {
    /// Posée à sa place dans le repère du bandeau.
    func placed(_ rect: CGRect) -> some View {
        frame(width: rect.width, height: rect.height)
            .offset(x: rect.minX, y: rect.minY)
    }
}
