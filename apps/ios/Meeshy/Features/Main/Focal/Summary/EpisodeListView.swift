import SwiftUI
import MeeshyUI

/// Liste des épisodes — LA PREUVE à un tap (contrat §WS-9 : « chaque ligne
/// s'ouvre sur les messages qui la prouvent »). Chaque rangée porte
/// `episode.messageIds` ; le tap remonte l'épisode entier au site de
/// montage, qui décide de la navigation (`scrollToMessage` sur le premier
/// id — WS-7).
///
/// `displayTitle` bascule silencieusement vers `agentTitle` s'il existe —
/// jamais de mélange typographique (contrat §6.3, interdit 4 : « le
/// déterministe et l'agent ne se mélangent pas visuellement ») : SEULE la
/// pastille ✦ discrète marque un titre d'agent, jamais le poids/la couleur
/// du texte lui-même, qui reste identique dans les deux cas.
struct EpisodeListView: View {
    let episodes: [ConversationEpisode]
    let isDark: Bool
    var onTap: (ConversationEpisode) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "focal.summary.episodes.title", defaultValue: "Ce qui s'est passé", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .heavy))
                .foregroundColor(isDark ? .white.opacity(0.92) : .black.opacity(0.88))

            VStack(spacing: MeeshySpacing.xs) {
                ForEach(episodes) { episode in
                    EpisodeRow(episode: episode, isDark: isDark) { onTap(episode) }
                }
            }
        }
    }
}

private struct EpisodeRow: View {
    let episode: ConversationEpisode
    let isDark: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: MeeshySpacing.sm) {
                if episode.isAgentTitled {
                    Text("✦")
                        .font(MeeshyFont.relative(12, weight: .heavy))
                        .foregroundColor(MeeshyColors.indigo500)
                }
                Text(episode.displayTitle)
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(isDark ? .white.opacity(0.9) : .black.opacity(0.85))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(isDark ? .white.opacity(0.4) : .black.opacity(0.32))
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                    .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(episode.displayTitle)
        .accessibilityHint(String(localized: "focal.summary.episodes.entry.a11y_hint", defaultValue: "Ouvre les messages de cet épisode", bundle: .main))
    }
}
