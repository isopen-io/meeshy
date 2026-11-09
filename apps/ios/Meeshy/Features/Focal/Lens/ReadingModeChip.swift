import SwiftUI
import MeeshyUI

/// P2 du chantier Focal (spec Magnificence 2026-08-17) — LE chip de mode,
/// seule affordance du header : **tap = cycle** des modes disponibles
/// (préférence collante via le contrôleur gelé F-080), **appui long = menu**
/// natif listant tous les modes (`Menu` à action primaire, comme le bouton
/// d'appel de l'en-tête — #17095). Le bouton « Aa » et la feuille Lentille ont disparu avec ce lot —
/// le catalogue (`ReadingModeLensCatalog`) reste la seule source des
/// libellés et des lignes.
///
/// Vue PURE : primitifs et value types uniquement, aucun `@State` (même
/// règle que `FocalIdentityHeader`, WS-4). Le chevauchement « AUTO »/mode
/// historique est réglé par `.fixedSize()` sur les deux textes — le chip ne
/// se comprime plus, il tronque proprement en amont (lineLimit).

/// Loi PURE du cycle de modes — le tap avance dans l'ordre du catalogue,
/// boucle en fin de liste, repart au premier si le mode courant n'est plus
/// listé, et rend `nil` (no-op) quand il n'y a rien vers quoi cycler.
nonisolated enum ReadingModeCycle {
    static func next(
        after current: ConversationReadingMode,
        availableInOrder: [ConversationReadingMode]
    ) -> ConversationReadingMode? {
        guard availableInOrder.count > 1 else { return nil }
        guard let index = availableInOrder.firstIndex(of: current) else {
            return availableInOrder.first
        }
        return availableInOrder[(index + 1) % availableInOrder.count]
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

struct ReadingModeChip: View {
    /// Mode clair : du blanc sur une capsule teintée à 28 % était illisible
    /// (capture 2026-08-21) — le libellé prend la couleur de texte du thème.
    @Environment(\.colorScheme) private var colorScheme
    private var labelColor: Color {
        colorScheme == .dark ? .white : MeeshyColors.textPrimary(isDark: false)
    }

    let model: ReadingModeChipModel
    /// Lignes du menu d'appui long — bâties par l'appelant depuis le
    /// catalogue et les capacités STOCKÉES (jamais une seconde résolution).
    let menuRows: [LensRowModel]
    let onCycle: () -> Void
    let onSelect: (ConversationReadingMode) -> Void
    let onAuto: () -> Void

    var body: some View {
        // Un `Menu` à action primaire, comme le bouton d'appel (#17095) : le
        // toucher fait défiler les modes, l'appui long ancre le menu à la puce
        // — la surbrillance et le verre interactif répondent dès le toucher, sans
        // l'aperçu soulevé ni le délai d'un `.contextMenu`.
        Menu {
            menuContent
        } label: {
            chipLabel
        } primaryAction: {
            onCycle()
        }
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
        .accessibilityHint(String(
            localized: "reading_mode.chip.a11y_hint_cycle",
            defaultValue: "Passe au mode suivant. Appui long pour la liste des modes.",
            bundle: .main
        ))
    }

    /// La capsule de la puce : le verre interactif teinté de l'en-tête
    /// (`ConversationHeaderGlassGlyph`), dans la forme d'une capsule.
    private var chipLabel: some View {
        HStack(spacing: MeeshySpacing.xs) {
            if model.isAuto {
                Text(String(localized: "reading_mode.chip.auto_prefix", defaultValue: "AUTO", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .heavy))
                    .foregroundStyle(labelColor.opacity(0.65))
                    .fixedSize()
            }
            Text(model.label)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundStyle(labelColor)
                .lineLimit(1)
                .fixedSize()
        }
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, MeeshySpacing.xs)
        .adaptiveGlass(in: Capsule(), tint: Color(hex: model.accentHex).opacity(ConversationHeaderGlassGlyph.glassTintOpacity), interactive: ConversationHeaderGlassGlyph.isGlassInteractive)
        .contentShape(Capsule())
    }

    /// Un mode indisponible reste LISTÉ mais désactivé — jamais retiré
    /// (amendement R : « un mode indisponible n'est jamais un écran vide »).
    /// Le mode courant porte sa coche.
    @ViewBuilder
    private var menuContent: some View {
        ForEach(menuRows) { row in
            Button {
                onSelect(row.mode)
            } label: {
                if row.isCurrent {
                    Label(ReadingModeLensCatalog.title(for: row.mode), systemImage: "checkmark")
                } else {
                    Text(ReadingModeLensCatalog.title(for: row.mode))
                }
            }
            .disabled(!row.isAvailable || row.isCurrent)
        }
        Divider()
        Button {
            onAuto()
        } label: {
            Label(
                String(localized: "reading_mode.menu.auto", defaultValue: "Automatique", bundle: .main),
                systemImage: "wand.and.stars"
            )
        }
    }
}
