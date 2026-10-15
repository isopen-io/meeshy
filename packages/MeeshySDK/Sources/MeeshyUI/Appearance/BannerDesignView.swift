import SwiftUI
import MeeshySDK

// MARK: - BannerDesignView (#10632, spec §§ 5.3, 8.2)
//
// Une bannière de design (3:1) PRIME sur l'image `banner` d'un profil : la même
// donnée vectorielle que les fonds (`AppearanceDesign`), peinte par le même
// moteur (`AppearanceDesignView`), sans second moteur de dessin. Agnostique :
// la décision « quelle bannière, quand » reste à l'app.

public struct BannerDesignView: View, Equatable {
    public let design: AppearanceDesign
    public let isDark: Bool
    public let accentHex: String
    /// La décision de l'app : `false` ⇒ la couche animée du design montre sa première image (aperçus, économie d'énergie).
    public let animates: Bool

    public init(design: AppearanceDesign, isDark: Bool, accentHex: String, animates: Bool = true) {
        self.design = design
        self.isDark = isDark
        self.accentHex = accentHex
        self.animates = animates
    }

    nonisolated public static func == (lhs: BannerDesignView, rhs: BannerDesignView) -> Bool {
        lhs.design == rhs.design && lhs.isDark == rhs.isDark && lhs.accentHex == rhs.accentHex && lhs.animates == rhs.animates
    }

    public var body: some View {
        ZStack {
            AppearanceDesignView(design: design, isDark: isDark, accentHex: accentHex)
                .equatable()
            if let lottie = design.lottie {
                PackLottieLayer(ref: lottie, animates: animates, contentMode: .fill)
            }
        }
        .clipped()
    }
}
