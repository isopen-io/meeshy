import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les pages de liens, une fois pour la pile iPhone et le panneau iPad (#18871) : « Mes liens » (la face Liens en
/// page), chaque famille, et « Mes adresses ». Les deux racines n'y voient qu'un nom.
struct LinksRouteDestination: View {
    let route: Route

    var body: some View {
        switch route {
        case .links:
            LinksHubView()
        case .affiliate:
            AffiliateView().navigationBarHidden(true)
        case .trackingLinks:
            TrackingLinksView().navigationBarHidden(true)
        case .shareLinks:
            ShareLinksView().navigationBarHidden(true)
        case .communityLinks:
            CommunityLinksView().navigationBarHidden(true)
        case .myAddresses:
            MyAddressesView(accent: MeeshyColors.brandPrimary).navigationBarHidden(true)
        default:
            EmptyView()
        }
    }
}
