import SwiftUI
import MeeshySDK

// MARK: - Le bandeau de parrainage de la carte partagée (#7742)
//
// MIROIR du bandeau de `docs/product/jeu-meeshy-conception.html` (§ XII.3) : en bas de la carte
// 9:16 d'un moment photo, un bandeau indigo (86 %) qui porte la Signature, « Rejoins-moi sur
// Meeshy », le lien de parrainage court de l'utilisateur et sa Flamme.
//
// La brique dessine ; elle ne sait rien du lien. L'hôte lui passe les phrases localisées et le
// lien tel qu'il part — et ne monte JAMAIS ce bandeau sans lien : « sans lien disponible, la
// carte part sans lui, et sans placeholder qui ressemblerait à un lien » (conformité H-8).
//
// Tout se dessine à l'échelle de la HAUTEUR offerte (66 unités sur la planche) : le bandeau tient
// de 3,5:1 (carré) à 3,8:1 (story) sans rien déformer. Les couleurs sont fixes — la carte est une
// IMAGE partagée hors de l'app, jamais habillée par le thème de celui qui la compose.

public struct GameReferralBannerView: View {

    private let title: String
    private let link: String
    private let flameForm: FlameFormKey?
    private let flameLabel: String?

    /// - Parameters:
    ///   - title: « Rejoins-moi sur Meeshy ».
    ///   - link: le lien court, sans schéma (« meeshy.me/signup/affiliate/AMANI7 »).
    ///   - flameForm: la forme de la Flamme de l'utilisateur ; `nil` ⇒ pas de Flamme sur la carte
    ///     (il l'a retirée, ou n'en a pas).
    ///   - flameLabel: « 23 j », sous la Flamme.
    public init(title: String, link: String, flameForm: FlameFormKey? = nil, flameLabel: String? = nil) {
        self.title = title
        self.link = link
        self.flameForm = flameForm
        self.flameLabel = flameLabel
    }

    private static let ink = Color(hex: "1c1941")
    private static let linkInk = Color(hex: "c7d2fe")

    public var body: some View {
        GeometryReader { proxy in
            let k = proxy.size.height / 66
            HStack(spacing: 12 * k) {
                SignatureMark(style: .flat, color: .white, strokeWidth: 110)
                    .frame(width: 30 * k, height: 30 * k)
                VStack(alignment: .leading, spacing: 4 * k) {
                    Text(title)
                        .font(.system(size: 13 * k, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text(link)
                        .font(.system(size: 10.5 * k, weight: .medium, design: .monospaced))
                        .foregroundColor(Self.linkInk)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                }
                Spacer(minLength: 0)
                if let flameForm {
                    VStack(spacing: 1 * k) {
                        FlameView(form: flameForm, flickers: false)
                            .frame(width: 30 * k, height: 30 * k)
                        if let flameLabel {
                            Text(flameLabel)
                                .font(.system(size: 9 * k, weight: .medium, design: .monospaced))
                                .foregroundColor(.white)
                                .lineLimit(1)
                        }
                    }
                }
            }
            .padding(.horizontal, 14 * k)
            .frame(width: proxy.size.width, height: proxy.size.height)
            .background(RoundedRectangle(cornerRadius: 16 * k, style: .continuous).fill(Self.ink.opacity(0.86)))
        }
        .accessibilityHidden(true)
    }
}
