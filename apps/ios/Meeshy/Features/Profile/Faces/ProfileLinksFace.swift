import SwiftUI
import MeeshySDK
import MeeshyUI

/// La face Liens de MA fiche (#18869) : en attendant ses billets (#18871 — mon lien de profil, son QR, mes adresses),
/// elle mène, d'un geste, à chaque famille de liens que l'app sait déjà gérer, et donne l'adresse courte de ma page
/// publique. Faite du kit : rangées à chevron (K06) dans un verre de thème, en-tête de section (K44).
struct ProfileLinksFace: View {
    let profileLink: ProfileLink?
    let accentColor: String
    let onOpen: (Route) -> Void

    private var accent: Color { Color(hex: accentColor) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: String(localized: "links.hub.title", defaultValue: "Mes liens", bundle: .main))
            if let profileLink {
                MeeshyNote(profileLink.displayText, lead: .systemImage("link"))
            }
            VStack(spacing: 0) {
                ForEach(Array(Self.entries.enumerated()), id: \.offset) { index, entry in
                    MeeshyToggleRow(entry.title, systemImage: entry.systemImage, accessory: .chevron,
                                    showsDivider: index < Self.entries.count - 1, tint: accent,
                                    action: { onOpen(entry.route) })
                }
            }
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        }
    }

    struct Entry {
        let title: String
        let systemImage: String
        let route: Route
    }

    static var entries: [Entry] {
        [
            Entry(title: String(localized: "links.hub.share.title", defaultValue: "Liens de partage", bundle: .main),
                  systemImage: "link", route: .shareLinks),
            Entry(title: String(localized: "links.hub.tracking.title", defaultValue: "Liens de suivi", bundle: .main),
                  systemImage: "chart.line.uptrend.xyaxis", route: .trackingLinks),
            Entry(title: String(localized: "links.hub.community.title", defaultValue: "Liens communauté", bundle: .main),
                  systemImage: "person.3", route: .communityLinks),
            Entry(title: String(localized: "links.hub.affiliate.title", defaultValue: "Parrainage", bundle: .main),
                  systemImage: "gift", route: .affiliate),
        ]
    }
}
