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
    private let hint: String?
    private let onPress: (() -> Void)?

    @Environment(\.colorScheme) private var colorScheme

    /// Avec `onPress`, la pile mène quelque part (« Mène à Studio · 8 membres › ») : un bouton d'un seul tenant, son
    /// chevron à droite, une cible de 44 au moins, et `hint` pour dire à VoiceOver ce qu'il ouvre.
    public init(members: [LinksFaceMember], summary: String? = nil, label: String, tint: Color,
                hint: String? = nil, onPress: (() -> Void)? = nil) {
        self.members = LinksFaceMember.stack(members)
        self.summary = summary
        self.label = label
        self.tint = tint
        self.hint = hint
        self.onPress = onPress
    }

    public var body: some View {
        if let onPress {
            Button(action: onPress) {
                HStack(spacing: MeeshySpacing.sm) {
                    group
                    Spacer(minLength: MeeshySpacing.sm)
                    Image(systemName: "chevron.right")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityHint(hint ?? "")
            .accessibilityAddTraits(.isButton)
        } else {
            group
        }
    }

    private var group: some View {
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
