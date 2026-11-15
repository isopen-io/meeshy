import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - MessageViewsConsumptionCard

/// #7228 — la carte d'UNE pièce jointe dans les onglets « Écouté / Visionné /
/// Ouvert » : qui l'a consommée, combien de fois, jusqu'où, quand téléchargée.
/// La famille est PASSÉE, plus devinée depuis un booléen `isAudio`.
struct MessageViewsConsumptionCard: View {
    let attachment: MessageAttachment
    let family: MediaConsumptionFamily
    let accent: Color
    let users: [AttachmentStatusUser]
    let contactColor: String
    let members: [String: PaginatedParticipant]

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        let kind = AttachmentKind(mimeType: attachment.mimeType)
        // Audio et vidéo gardent leurs glyphes historiques ; tout le reste tire
        // le sien d'`AttachmentKind.sfSymbolName`, seule source des glyphes de
        // pièce jointe du dépôt (un PDF n'est pas un document Word).
        let icon = family == .listened ? "waveform" : family == .watched ? "film" : kind.sfSymbolName
        let name = attachment.originalName.isEmpty ? attachment.fileName : attachment.originalName

        return VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            // Attachment header
            HStack(spacing: MeeshySpacing.sm) {
                ZStack {
                    RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                        .fill(accent.opacity(isDark ? 0.15 : 0.1))
                        .frame(width: 32, height: 32)
                    Image(systemName: icon)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(accent)
                }

                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)

                    if let duration = attachment.duration {
                        Text(MediaFormat.duration(duration / 1000))
                            .font(.system(.caption2, design: .monospaced).weight(.medium))
                            .foregroundStyle(theme.textMuted)
                    }
                }

                Spacer()

                Text("\(users.count)")
                    .font(.system(.caption2, design: .monospaced).weight(.bold))
                    .foregroundColor(accent)
                    .padding(.horizontal, MeeshySpacing.xsPlus)
                    .padding(.vertical, MeeshySpacing.xxs)
                    .background(Capsule().fill(accent.opacity(0.12)))
            }

            if users.isEmpty {
                Text(Self.notConsumedLabel(for: family))
                    .font(.caption)
                    .foregroundStyle(theme.textMuted)
                    .padding(.vertical, MeeshySpacing.xs)
            } else {
                // User consumption rows
                ForEach(Array(users.enumerated()), id: \.element.id) { index, user in
                    let reading = MessageViewsConsumption.reading(for: user, in: family)
                    let fraction = family.showsProgress
                        ? Self.positionFraction(positionMs: reading.positionMs, complete: reading.isComplete, durationMs: attachment.duration)
                        : 0

                    VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                        HStack(spacing: MeeshySpacing.smPlus) {
                            LivePresence { MeeshyAvatar(
                                name: user.username,
                                context: .userListItem,
                                accentColor: contactColor,
                                avatarURL: user.avatar,
                                presenceState: MessageViewsMemberPresence.state(of: user.participantId, in: members),
                                ring: members[user.participantId]?.avatarRing
                            ) }

                            VStack(alignment: .leading, spacing: 1) {
                                Text(user.username)
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(theme.textPrimary)

                                if let date = reading.consumedAt {
                                    Text(RelativeTimeFormatter.longString(for: date))
                                        .font(.caption2)
                                        .foregroundStyle(theme.textMuted)
                                }
                            }

                            Spacer()

                            // Compteur de consommations — écoutes, visionnages
                            // ou OUVERTURES (`viewCount`, servi par la
                            // passerelle et jeté par le décodeur avant #7228).
                            if let c = reading.count, c > 1 {
                                Text("\(c)x")
                                    .font(.system(.caption2, design: .monospaced).weight(.bold))
                                    .foregroundColor(accent.opacity(0.8))
                                    .padding(.horizontal, MeeshySpacing.xs)
                                    .padding(.vertical, MeeshySpacing.xxs)
                                    .background(
                                        Capsule().fill(accent.opacity(0.08))
                                    )
                            }

                            // Téléchargement — servi pour toutes les familles
                            // et affiché nulle part avant #7228. Il occupe la
                            // place que la progression laisse libre sur ce qui
                            // n'a pas de piste.
                            if let downloadedAt = reading.downloadedAt {
                                HStack(spacing: MeeshySpacing.xxs) {
                                    Image(systemName: "arrow.down.circle.fill")
                                        .font(.caption2)
                                    Text(RelativeTimeFormatter.longString(for: downloadedAt))
                                        .font(.caption2.weight(.semibold))
                                }
                                .foregroundStyle(theme.textMuted)
                                .accessibilityElement(children: .combine)
                                .accessibilityLabel(
                                    String(
                                        format: String(localized: "message-detail.views.downloaded.a11y", defaultValue: "Téléchargé %@", bundle: .main),
                                        RelativeTimeFormatter.longString(for: downloadedAt)
                                    )
                                )
                            }

                            // Progression — seulement pour un média à piste.
                            if family.showsProgress {
                                if reading.isComplete {
                                    HStack(spacing: MeeshySpacing.xxs) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.caption2)
                                        Text(String(localized: "message-detail.complete", defaultValue: "complet", bundle: .main))
                                            .font(.caption2.weight(.semibold))
                                    }
                                    .foregroundStyle(MeeshyColors.success)
                                } else if let pos = reading.positionMs, pos > 0 {
                                    Text(MediaFormat.duration(pos / 1000))
                                        .font(.system(.caption2, design: .monospaced).weight(.semibold))
                                        .foregroundStyle(theme.textMuted)
                                        .padding(.horizontal, MeeshySpacing.xsPlus)
                                        .padding(.vertical, MeeshySpacing.xxs)
                                        .background(
                                            Capsule()
                                                .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                                        )
                                }
                            }
                        }

                        // La barre ne s'affiche que pour un média à piste : une
                        // image ouverte n'est ni « à 40 % » ni « complète ».
                        if family.showsProgress, !reading.isComplete, fraction > 0 {
                            HStack(spacing: MeeshySpacing.xsPlus) {
                                ProgressView(value: fraction)
                                    .progressViewStyle(.linear)
                                    .tint(accent)
                                Text("\(Int((fraction * 100).rounded()))%")
                                    .font(.system(.caption2, design: .monospaced).weight(.semibold))
                                    .foregroundStyle(theme.textMuted)
                                    .frame(minWidth: 30, alignment: .trailing)
                            }
                            .padding(.leading, 54)
                        }
                    }
                    .padding(.vertical, MeeshySpacing.xs)
                }
            }
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04), lineWidth: MeeshyBorder.hairline)
                )
        )
    }

    /// « Personne n'a encore … » — le verbe suit la famille, et il est
    /// LOCALISÉ : les deux libellés d'origine étaient des littéraux français
    /// sans accents (« Pas encore ecoute »), donc servis tels quels aux sept
    /// langues.
    private static func notConsumedLabel(for family: MediaConsumptionFamily) -> String {
        switch family {
        case .listened:
            return String(localized: "message-detail.views.not-listened", defaultValue: "Pas encore écouté", bundle: .main)
        case .watched:
            return String(localized: "message-detail.views.not-watched", defaultValue: "Pas encore visionné", bundle: .main)
        case .opened:
            return String(localized: "message-detail.views.not-opened", defaultValue: "Pas encore ouvert", bundle: .main)
        }
    }

    /// Fraction (`0...1`) of an attachment consumed by a participant — ported
    /// from the (now-deleted) `MessageInfoSheet.mediaFraction`. `complete`
    /// always wins: a media marked complete reads as fully consumed
    /// regardless of the last reported position (matches the server's own
    /// `listenedComplete`/`watchedComplete` semantics).
    static func positionFraction(positionMs: Int?, complete: Bool, durationMs: Int?) -> Double {
        if complete { return 1 }
        guard let durationMs, durationMs > 0, let positionMs else { return 0 }
        return min(1, max(0, Double(positionMs) / Double(durationMs)))
    }
}
