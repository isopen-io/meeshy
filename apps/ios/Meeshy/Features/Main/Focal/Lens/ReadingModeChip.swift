import SwiftUI
import MeeshyUI

/// F-086bis (WS-7, arbitrage coordinateur — §WS-7 était dans le périmètre,
/// initialement exclu à tort) — le chip de mode et le bouton « Aa » de la
/// coquille de conversation. Contrat §WS-7 travaux 3 (« Chip de mode inséré
/// dans headerButtonsCluster, APRÈS expandedHeaderSearchButton ») et 4
/// (« Bouton Aa (44×30, MeeshyRadius.full) → controller.select(mode
/// .toggledDensity) »).
///
/// **RE-PREUVE (§0)** : `ConversationReadingMode.toggledDensity` (contrat
/// §3.1) n'existe pas sur le miroir GELÉ réel
/// (`ReadingModeOrchestrator.ConversationReadingMode`, 5 cas bruts, aucune
/// computed property — RE-PREUVE identique à F-080/F-085 : `usesFlatRow`/
/// `usesPerspective` avaient le même sort). Ajoutée ICI (fichier propriété
/// WS-7), même patron que l'extension `usesFlatRow`/`usesPerspective` de
/// WS-6 (`MessageListViewController.swift`) : un simple regroupement de
/// cas, aucune loi, aucune constante numérique (garde R15).
extension ConversationReadingMode {
    var toggledDensity: ConversationReadingMode {
        switch self {
        case .focal: return .script
        case .script: return .focal
        default: return self
        }
    }
}

/// Modèle pur du chip de mode — contrat §WS-7 « Types purs à extraire »,
/// `Equatable` : `label`, `accentHex`, `isAuto`.
struct ReadingModeChipModel: Equatable {
    let label: String
    let accentHex: String
    /// `true` quand la décision vient de l'orchestrateur (§WS-1
    /// `OrchestratorDecisionReason` ∉ {`.sticky`, `.flagDisabled`}) — encoche
    /// visuelle « AUTO » distincte d'un choix manuel figé.
    let isAuto: Bool
}

/// Puce de mode dans le header du fil — ENTRÉE du menu Lentille
/// (`ReadingModeLensSheet`). Vue PURE : primitifs uniquement, aucun `@State`
/// (même règle que `FocalIdentityHeader`, WS-4).
struct ReadingModeChip: View {
    let model: ReadingModeChipModel
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 4) {
                if model.isAuto {
                    Text(String(localized: "reading_mode.chip.auto_prefix", defaultValue: "AUTO", bundle: .main))
                        .font(MeeshyFont.relative(9, weight: .heavy))
                        .foregroundColor(.white.opacity(0.65))
                }
                Text(model.label)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
            }
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
            .background(Capsule().fill(Color(hex: model.accentHex).opacity(0.28)))
            .overlay(Capsule().strokeBorder(Color(hex: model.accentHex).opacity(0.5), lineWidth: 0.5))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .meeshyTapTarget()
        .accessibilityLabel(
            String(
                format: String(
                    localized: "reading_mode.chip.a11y_label",
                    defaultValue: "Mode de lecture : %@",
                    bundle: .main
                ),
                model.label
            )
        )
        .accessibilityHint(String(localized: "reading_mode.chip.a11y_hint", defaultValue: "Ouvre le choix du mode de lecture", bundle: .main))
    }
}

/// Bouton « Aa » — bascule DIRECTE Focal ⇄ Script, sans passer par la feuille
/// (contrat §WS-7 travail 4, critère §7 « Aa bascule Focal ⇄ Script
/// instantanément » : `select` écrit la préférence ET publie le mode dans
/// la MÊME boucle — `ReadingModeController.select`, GELÉ F-080, le fait déjà).
/// Masqué hors `.focal`/`.script` (Résumé/Rivière n'ont pas de densité).
struct ReadingModeDensityButton: View {
    let isDark: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text("Aa")
                .font(MeeshyFont.relative(13, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 44, height: 30)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.full, style: .continuous)
                        .fill(Color.white.opacity(0.16))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "reading_mode.density_button.a11y_label", defaultValue: "Basculer la densité d'affichage", bundle: .main))
    }
}
