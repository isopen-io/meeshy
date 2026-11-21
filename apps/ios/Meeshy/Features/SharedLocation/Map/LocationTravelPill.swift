import SwiftUI
import MeeshySDK
import MeeshyUI

/// « DE PASSAGE À LISBONNE » (#19560, planches Carte-Personne, Carte-Proches, Carte-Partage, Carte-Sang et
/// iPad-Split). Sur une carte où j'apparais, la pastille K41 dit que ma position est loin de ma ville déclarée : valise
/// à roulettes sur téléphone, avion sur l'iPad. Elle ne sert qu'à moi — la ville de ma position se nomme sur
/// l'appareil et ne part nulle part — et se tait sans ma position, sans permission déjà accordée ou sans ville.
struct LocationTravelPill: View {
    let me: SharedLocationFix?
    @ObservedObject var places: LocationPlaceNamer

    @Environment(\.horizontalSizeClass) private var sizeClass

    private var declaredCity: String? { AuthManager.shared.currentUser?.declaredCity }

    private var city: String? {
        LocationTravelRule.awayCity(declaredCity: declaredCity,
                                    currentCity: me.flatMap { places.city(of: $0) },
                                    isAuthorized: me != nil && LocationMapOwnPosition.isAuthorized)
    }

    var body: some View {
        pill.task(id: me) {
            guard let me, declaredCity != nil else { return }
            await places.resolveCity(of: me)
        }
    }

    @ViewBuilder
    private var pill: some View {
        if let city {
            MeeshyBadge(.label(LocationMapCopy.passingThrough(city)),
                        leading: .systemImage(sizeClass == .regular ? "airplane" : "suitcase.rolling"),
                        surface: .glass, size: .s28)
        } else {
            Color.clear.frame(width: 0, height: 0).accessibilityHidden(true)
        }
    }
}
