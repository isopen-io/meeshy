import SwiftUI

/// « Chiffrement de bout en bout activé » sur la Vitrine d'une fiche : la pastille du kit (K41) en sens acquis, au glyphe
/// `lock.shield`. Public : la fiche d'un autre et ma propre vitrine (#19512) posent LA MÊME pastille.
public struct ProfileE2EEBadge: View {
    public init() {}

    public var body: some View {
        MeeshyBadge(
            .label(String(localized: "profile.e2ee.enabled", defaultValue: "Chiffrement de bout en bout activé", bundle: .module)),
            leading: .systemImage("lock.shield"),
            kind: .ok,
            lineLimit: 2
        )
    }
}
