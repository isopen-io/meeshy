import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le cœur de la page d'une humeur : l'avatar de l'auteur au centre, puis le
/// texte de l'humeur DÉCORÉ — son emoji en médaillon, le texte sur une carte
/// de verre. Le tout se lit en un seul élément VoiceOver.
struct MoodSpotlightCard: View, Equatable {
    static let avatarSize: CGFloat = 112

    let entry: StatusEntry
    let avatarURL: String?
    let avatarThumbHash: String?
    /// Le contour équipé de l'auteur (#10946) ; `nil` sans contour.
    var ring: ServedProfileDecorItem? = nil

    static func == (lhs: MoodSpotlightCard, rhs: MoodSpotlightCard) -> Bool {
        lhs.entry.id == rhs.entry.id && lhs.entry.content == rhs.entry.content
            && lhs.entry.moodEmoji == rhs.entry.moodEmoji
            && lhs.avatarURL == rhs.avatarURL && lhs.avatarThumbHash == rhs.avatarThumbHash
            && lhs.ring == rhs.ring
    }

    var body: some View {
        VStack(spacing: 18) {
            ZStack(alignment: .bottomTrailing) {
                CachedAvatarImage(urlString: avatarURL, thumbHash: avatarThumbHash, name: entry.username,
                                  size: Self.avatarSize, accentColor: entry.avatarColor)
                    .frame(width: Self.avatarSize, height: Self.avatarSize)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(Color.white.opacity(0.9), lineWidth: 3))
                    .shadow(color: Color(hex: entry.avatarColor).opacity(0.6), radius: 24)
                    .avatarRing(ProfileDecorResolver.ring(ring), avatarSize: Self.avatarSize)
                Text(entry.moodEmoji)
                    .font(MeeshyFont.emoji(34))
                    .padding(MeeshySpacing.xsPlus)
                    .background(.ultraThinMaterial, in: Circle())
                    .offset(x: 8, y: 8)
            }

            VStack(spacing: 4) {
                Text(entry.username)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                Text(entry.timeAgo)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.75))
            }

            if let text = entry.content?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
                Text(text)
                    .font(.system(.title2, design: .rounded).weight(.semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 22)
                    .padding(.vertical, MeeshySpacing.lg)
                    .background(
                        RoundedRectangle(cornerRadius: 26, style: .continuous)
                            .fill(.ultraThinMaterial)
                            .overlay(
                                RoundedRectangle(cornerRadius: 26, style: .continuous)
                                    .stroke(
                                        LinearGradient(colors: [Color(hex: entry.avatarColor), .white.opacity(0.5)],
                                                       startPoint: .topLeading, endPoint: .bottomTrailing),
                                        lineWidth: 1.5
                                    )
                            )
                    )
                    .shadow(color: .black.opacity(0.25), radius: 12, y: 6)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("mood.spotlight.card")
    }
}

/// Le champ qui répond à l'humeur, en privé. Il monte avec le clavier
/// (`safeAreaInset`) et le bouton d'envoi n'existe que s'il y a de quoi envoyer.
struct MoodSpotlightReplyBar: View {
    @Binding var text: String
    let authorName: String
    let isSending: Bool
    let canSend: Bool
    var focus: FocusState<Bool>.Binding
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            TextField(
                String(localized: "mood.spotlight.reply.placeholder", defaultValue: "Répondre à \(authorName)…", bundle: .main),
                text: $text,
                axis: .vertical
            )
            .lineLimit(1...4)
            .focused(focus)
            .submitLabel(.send)
            .onSubmit { if canSend { onSend() } }
            .foregroundStyle(.white)
            .tint(.white)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous))
            .accessibilityIdentifier("mood.spotlight.reply.field")

            Button(action: onSend) {
                Group {
                    if isSending {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "arrow.up")
                            .font(MeeshyFont.relative(17, weight: .bold))
                    }
                }
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(MeeshyColors.brandGradient))
                .opacity(canSend || isSending ? 1 : 0.4)
            }
            .disabled(!canSend)
            .accessibilityLabel(String(localized: "mood.spotlight.reply.send", defaultValue: "Envoyer la réponse", bundle: .main))
            .accessibilityIdentifier("mood.spotlight.reply.send")
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.smPlus)
    }
}
