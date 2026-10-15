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

    public init(design: AppearanceDesign, isDark: Bool, accentHex: String) {
        self.design = design
        self.isDark = isDark
        self.accentHex = accentHex
    }

    nonisolated public static func == (lhs: BannerDesignView, rhs: BannerDesignView) -> Bool {
        lhs.design == rhs.design && lhs.isDark == rhs.isDark && lhs.accentHex == rhs.accentHex
    }

    public var body: some View {
        AppearanceDesignView(design: design, isDark: isDark, accentHex: accentHex)
            .equatable()
            .clipped()
    }
}
