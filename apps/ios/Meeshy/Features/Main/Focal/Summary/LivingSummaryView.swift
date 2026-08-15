import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le Résumé Vivant — contrat §WS-9. L'ÉTAT d'abord (le digest en tête,
/// rendu IMMÉDIATEMENT, sans attendre l'agent), LA PREUVE à un tap (la
/// Rampe et les épisodes déroulent vers les messages réels qui les
/// prouvent). Deux étages, jamais mélangés visuellement (contrat §6.3,
/// interdit 4).
///
/// Vue-hôte pour le mode `.summary` — montée par `ConversationView` À LA
/// PLACE de `MessageListView` (contrat §WS-9 : « le mode 'summary' de la
/// coquille F-086 route vers cette UI »). `onResumeThread` rend la main à
/// Focal « à l'endroit vivant » — c'est le SITE DE MONTAGE (WS-7) qui fait
/// `controller.select(.focal)` + `scrollToMessage` sur le premier non-lu,
/// cette vue ne connaît ni l'un ni l'autre.
struct LivingSummaryView: View {
    @ObservedObject var viewModel: LivingSummaryViewModel
    let isDark: Bool
    var onReplyToPerson: (FaceRampEntry) -> Void
    var onOpenEpisode: (ConversationEpisode) -> Void
    var onResumeThread: () -> Void

    var body: some View {
        ZStack {
            (isDark ? Color.black : Color.white)
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                    if viewModel.showsSkeleton {
                        LivingSummarySkeleton(isDark: isDark)
                    } else {
                        stateHeader
                        if !viewModel.faceRamp.isEmpty {
                            FaceRampView(entries: viewModel.faceRamp, isDark: isDark, onTap: onReplyToPerson)
                        }
                        if !viewModel.digest.episodes.isEmpty {
                            EpisodeListView(episodes: viewModel.digest.episodes, isDark: isDark, onTap: onOpenEpisode)
                        }
                        if let summary = viewModel.agentSummary {
                            agentPanel(summary)
                        }
                    }
                }
                .padding(MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.xl)
            }

            VStack {
                Spacer()
                resumeButton
                    .padding(.bottom, MeeshySpacing.lg)
            }
        }
        .task { await viewModel.refreshAgentEnrichment() }
    }

    // MARK: - L'état d'abord

    private var stateHeader: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(String(localized: "focal.summary.header.title", defaultValue: "Résumé Vivant", bundle: .main))
                .font(MeeshyFont.relative(20, weight: .heavy))
                .foregroundColor(isDark ? .white : .black)

            Text(countsLine)
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.6))

            if !viewModel.digest.isComplete {
                Text(partialLine)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(MeeshyColors.indigo500)
            }
        }
    }

    /// « 312 messages · 9 personnes » — comptes réels, jamais fabriqués
    /// (§WS-8, transmis tels quels par le digest).
    private var countsLine: String {
        let messagesPart = String(
            format: String(localized: "focal.summary.header.messages_count", defaultValue: "%d messages", bundle: .main),
            viewModel.digest.messageCount
        )
        let peoplePart = String(
            format: String(localized: "focal.summary.header.people_count", defaultValue: "%d personnes", bundle: .main),
            viewModel.digest.participantCount
        )
        return "\(messagesPart) · \(peoplePart)"
    }

    /// Interdit 3 (§6.3) : « le partiel se dit partiel » — jamais un total
    /// présenté comme exhaustif quand la fenêtre ne l'est pas.
    private var partialLine: String {
        String(
            format: String(
                localized: "focal.summary.header.partial_window",
                defaultValue: "Sur les %d derniers messages",
                bundle: .main
            ),
            viewModel.digest.messageCount
        )
    }

    // MARK: - Panneau agent — SÉPARÉ, jamais mélangé aux comptes déterministes (C2)

    private func agentPanel(_ summary: ConversationSummaryAnalysis) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            HStack(spacing: 4) {
                Text("✦")
                    .font(MeeshyFont.relative(12, weight: .heavy))
                    .foregroundColor(MeeshyColors.indigo500)
                Text(String(localized: "focal.summary.agent.title", defaultValue: "Vue d'ensemble de l'agent", bundle: .main))
                    .font(MeeshyFont.relative(12, weight: .heavy))
                    .foregroundColor(MeeshyColors.indigo500)
            }
            Text(summary.text)
                .font(MeeshyFont.relative(13, weight: .regular))
                .foregroundColor(isDark ? .white.opacity(0.85) : .black.opacity(0.78))
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: FocalMetrics.Agent.radius, style: .continuous)
                .strokeBorder(MeeshyColors.indigo500, style: StrokeStyle(lineWidth: FocalMetrics.Agent.borderWidth, dash: [5, 4]))
        )
        .accessibilityElement(children: .combine)
    }

    // MARK: - Reprendre le fil

    private var resumeButton: some View {
        Button(action: onResumeThread) {
            Text(String(localized: "focal.summary.resume_thread", defaultValue: "Reprendre le fil", bundle: .main))
                .font(MeeshyFont.relative(15, weight: .bold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.md)
                .background(Capsule().fill(MeeshyColors.indigo500))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityLabel(String(localized: "focal.summary.resume_thread.a11y_label", defaultValue: "Reprendre le fil, retourner à la conversation", bundle: .main))
    }
}

/// Squelette — UNIQUEMENT sur cache vide (contrat §WS-9). Trois barres
/// génériques, aucune donnée affichée : ce n'est pas un état d'erreur, juste
/// « rien à digérer encore » (conversation neuve, première ouverture avant
/// le premier chargement de `MessageStore`).
private struct LivingSummarySkeleton: View {
    let isDark: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))
                    .frame(height: 16)
            }
        }
        .accessibilityLabel(String(localized: "focal.summary.skeleton.a11y_label", defaultValue: "Chargement du résumé", bundle: .main))
    }
}
