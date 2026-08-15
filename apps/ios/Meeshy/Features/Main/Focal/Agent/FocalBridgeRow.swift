import SwiftUI
import MeeshyUI

/// La rangée « pont ✦ » — contrat §WS-10/§3.8. **Rendue uniquement** quand
/// un appelant possède un `AgentBridgeLine` RÉEL (`provider.bridge(for:)`
/// non-nil) — cette vue ne consulte JAMAIS le provider elle-même, elle ne
/// fait que RENDRE une ligne déjà résolue. Avec `NullAgentAssistProvider`
/// (le seul provider de cette branche), aucun appelant ne peut produire ce
/// `AgentBridgeLine` non-nil — cette vue reste donc du CODE MORT ET ASSUMÉ
/// (contrat §WS-10 : « avec le provider nul : jamais rendue »), posée ici
/// pour que le jour où un chemin non écrivant existera côté serveur (C3),
/// il n'y ait qu'un provider à brancher, aucune vue à écrire.
///
/// Cotes `FocalMetrics.Agent` (§4.3 des maquettes, `.pont`/`.agent` de
/// `docs/design/2026-08-15-focal-spec-integration.html`) : bord pointillé
/// `1.5`, radius `14` — MÊME paire de cotes que l'anneau d'avatar
/// (`AgentAuthoredAvatarRing`), une seule grammaire pointillée pour toute la
/// surface agent (garde R15).
struct FocalBridgeRow: View {
    let line: AgentBridgeLine
    let isDark: Bool
    var onTap: (() -> Void)? = nil

    var body: some View {
        Button {
            onTap?()
        } label: {
            HStack(alignment: .top, spacing: MeeshySpacing.xs) {
                AgentSparkGlyph()
                Text(line.text)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(isDark ? .white.opacity(0.85) : .black.opacity(0.78))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                RoundedRectangle(cornerRadius: FocalMetrics.Agent.radius, style: .continuous)
                    .strokeBorder(
                        MeeshyColors.indigo500,
                        style: StrokeStyle(lineWidth: FocalMetrics.Agent.borderWidth, dash: [5, 4])
                    )
            )
            .contentShape(RoundedRectangle(cornerRadius: FocalMetrics.Agent.radius, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(line.text)
    }
}
