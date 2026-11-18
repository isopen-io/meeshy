import SwiftUI
import MeeshySDK

/// **La pile de visages d'un lien** (#19496, planches `Moi-Liens`, `Lien-Partage`, `Lien-Communaute`) : le groupe
/// d'avatars du kit (K48) en pile de 26, une cellule `MeeshyAvatar` par visage, au plus trois. Aucune présence : un
/// visage de lien dit qui est venu, jamais qui est en ligne.
public struct LinksFaceStack: View {
    private let members: [LinksFaceMember]
    private let summary: String?
    private let label: String
    private let tint: Color

    @Environment(\.colorScheme) private var colorScheme

    public init(members: [LinksFaceMember], summary: String? = nil, label: String, tint: Color) {
        self.members = LinksFaceMember.stack(members)
        self.summary = summary
        self.label = label
        self.tint = tint
    }

    public var body: some View {
        MeeshyAvatarGroup(count: members.count, layout: .stack, size: .s26, max: LinksFaceMember.stackLimit,
                          summary: summary, label: label, tint: tint, breathes: false) { index, diameter in
            face(at: index, diameter: diameter)
        }
    }

    @ViewBuilder
    private func face(at index: Int, diameter: CGFloat) -> some View {
        let member = index < members.count ? members[index] : nil
        MeeshyAvatar(name: member?.name ?? "", context: .custom(diameter), avatarURL: member?.avatar,
                     enablePulse: false, isDark: colorScheme == .dark)
    }
}
