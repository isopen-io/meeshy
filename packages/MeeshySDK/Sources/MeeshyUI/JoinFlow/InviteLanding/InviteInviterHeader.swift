import SwiftUI
import MeeshySDK

/// Qui invite, et ce qu'il a écrit : l'avatar cerclé de la marque, « Priya
/// t'invite », puis le message d'invitation du lien dans une bulle — la bulle
/// disparaît quand le lien n'en porte pas.
struct InviteInviterHeader: View {
    let creator: ShareLinkCreator
    let message: String?
    let isDark: Bool

    @Environment(\.layoutDirection) private var layoutDirection

    private var bubble: UnevenBubbleShape {
        UnevenBubbleShape(cornerRadius: MeeshyRadius.xl, leadingTopRadius: 6, isRTL: layoutDirection == .rightToLeft)
    }

    private var firstName: String {
        let first = creator.firstName?.trimmingCharacters(in: .whitespaces) ?? ""
        if !first.isEmpty { return first }
        return creator.name.split(separator: " ").first.map(String.init) ?? creator.username
    }

    private var trimmedMessage: String? {
        guard let text = message?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack(spacing: MeeshySpacing.md) {
                avatar
                VStack(alignment: .leading, spacing: 2) {
                    Text(InviteLandingCopy.invites(firstName))
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .heavy, design: .rounded))
                        .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(verbatim: "@\(creator.username)")
                        .font(MeeshyFont.relative(14))
                        .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)

            if let text = trimmedMessage {
                Text(text)
                    .font(MeeshyFont.relative(16))
                    .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                    .lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, 14)
                    .background(
                        bubble
                            .fill(isDark ? MeeshyColors.indigo900.opacity(0.55) : Color.white)
                    )
                    .overlay(
                        bubble
                            .stroke(isDark ? MeeshyColors.indigo800.opacity(0.6) : MeeshyColors.indigo100, lineWidth: 1)
                    )
                    .shadow(color: MeeshyColors.indigo900.opacity(isDark ? 0 : 0.08), radius: 10, y: 4)
            }
        }
    }

    private var avatar: some View {
        MeeshyAvatar(
            name: creator.name,
            context: .custom(52),
            avatarURL: creator.avatar,
            enablePulse: false,
            isDark: isDark
        )
        .padding(3)
        .background(Circle().fill(isDark ? MeeshyColors.indigo950 : Color.white))
        .padding(3)
        .background(Circle().fill(MeeshyColors.brandGradient))
        .accessibilityHidden(true)
    }
}

/// Une bulle dont le coin de DÉPART (haut, côté du texte) est resserré — le
/// message vient de la personne au-dessus. Le coin suit la direction de
/// lecture : il passe à droite en arabe.
struct UnevenBubbleShape: Shape {
    let cornerRadius: CGFloat
    let leadingTopRadius: CGFloat
    let isRTL: Bool

    func path(in rect: CGRect) -> Path {
        let topLeft = isRTL ? cornerRadius : leadingTopRadius
        let topRight = isRTL ? leadingTopRadius : cornerRadius
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + topLeft, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - topRight, y: rect.minY))
        path.addArc(center: CGPoint(x: rect.maxX - topRight, y: rect.minY + topRight), radius: topRight,
                    startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - cornerRadius))
        path.addArc(center: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY - cornerRadius), radius: cornerRadius,
                    startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY))
        path.addArc(center: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY - cornerRadius), radius: cornerRadius,
                    startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + topLeft))
        path.addArc(center: CGPoint(x: rect.minX + topLeft, y: rect.minY + topLeft), radius: topLeft,
                    startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.closeSubpath()
        return path
    }
}
