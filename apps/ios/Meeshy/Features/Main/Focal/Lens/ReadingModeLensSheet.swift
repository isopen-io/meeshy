import SwiftUI
import MeeshyUI

/// F-086bis (WS-7, arbitrage coordinateur) — la feuille Lentille du fil
/// (contrat §WS-7 travail 5). Catalogue construit DIRECTEMENT depuis
/// `ReadingModeOrchestrator.resolveCapabilities` (miroir GELÉ), jamais
/// depuis un `ReadingModeCatalog` — **RE-PREUVE (§0)** : ce type, cité par
/// le contrat, N'EXISTE PAS dans `Focal/Core/` réel (`ls` à l'ouverture de
/// F-086bis : seuls `FocalFocusCurve`/`FocalMetrics`/`FocalRowInput`/
/// `ReadingModeOrchestrator`/`ScrollTimePillLaw` y sont livrés). Écart
/// contrat↔code signalé, résolu en consommant directement `resolveCapabilities`
/// — exactement ce que l'arbitrage demande (« catalogue via le miroir gelé »).
///
/// **i18n** : aucune clé `reading_mode.*` n'existe dans
/// `apps/ios/Meeshy/Localizable.xcstrings` (3097 clés scannées à l'ouverture
/// de ce lot, aucune ne matche). Chaque `String(localized:defaultValue:)`
/// ci-dessous porte donc un texte français EXPLICITE en repli — même patron
/// que `MessageDayLabel`/`date.today` ailleurs dans le dépôt — et non un
/// texte inventé/fabriqué : la clé est nommée, prête à être enregistrée par
/// un futur lot i18n (S-005 en est le domicile naturel côté web ; côté iOS,
/// aucun équivalent n'a encore tourné). Signalé, pas improvisé.

/// Une ligne de la feuille — contrat §WS-7 « Types purs à extraire ».
/// Un mode INDISPONIBLE porte `reasonKey` ET, quand elles ont un sens,
/// `thresholdValue`/`currentValue` (critère §7 « Un mode indisponible n'est
/// jamais un écran vide »).
///
/// AMENDEMENT S1 (REV-3/B3) : `thresholdValue`/`currentValue` sont désormais
/// `nil` de façon SIGNIFIANTE, pas seulement « ligne disponible ».
/// `reasonKey` porte la trifurcation :
///   - `reading_mode.river.never` — jamais éligible (`direct`), aucun nombre ;
///   - `reading_mode.river.threshold_only` — compte inconnu, le SEUIL seul ;
///   - `reading_mode.river.unavailable_reason` — les deux nombres, inchangé.
struct LensRowModel: Equatable, Identifiable {
    let mode: ConversationReadingMode
    var id: ConversationReadingMode { mode }
    let isCurrent: Bool
    let isAvailable: Bool
    let reasonKey: String?
    let thresholdValue: Int?
    let currentValue: Int?
}

/// Catalogue + libellés — SEUL domicile des titres/sous-titres (le chip ET
/// la feuille lisent d'ici, jamais une seconde résolution).
enum ReadingModeLensCatalog {
    /// Ordre d'affichage. `.bubbles` n'apparaît JAMAIS : c'est le mode de
    /// repli drapeau OFF (`resolveCapabilities` ne le rend que si le
    /// drapeau est OFF — cas où cette feuille n'est de toute façon jamais
    /// présentée, le chip qui l'ouvre étant lui-même sous drapeau).
    static let displayOrder: [ConversationReadingMode] = [.focal, .script, .summary, .river]

    /// Rivière TOUJOURS présente (amendement R du workshop) — grisée avec sa
    /// raison et son seuil RÉELS quand `resolveCapabilities` ne l'a pas
    /// ouverte (`riviere_mode` OFF ou < 5 actifs), jamais retirée de la liste.
    static func rows(
        capabilities: ReadingModeOrchestrator.ReadingModeCapabilities,
        currentMode: ConversationReadingMode
    ) -> [LensRowModel] {
        displayOrder.map { mode in
            if mode == .river {
                let available = capabilities.availableModes.contains(.river)
                let reason = capabilities.riverEligibilityReason
                guard !available else {
                    return LensRowModel(
                        mode: mode,
                        isCurrent: currentMode == .river,
                        isAvailable: true,
                        reasonKey: nil,
                        thresholdValue: nil,
                        currentValue: nil
                    )
                }
                // AMENDEMENT S1 (REV-3/B3) — même trifurcation que
                // `LentilleModeLabels.riverReason` côté liste : le fil et la
                // liste ne racontent pas deux histoires de la même Rivière.
                if reason.riverReason == .neverEligible {
                    return LensRowModel(
                        mode: mode,
                        isCurrent: currentMode == .river,
                        isAvailable: false,
                        reasonKey: "reading_mode.river.never",
                        thresholdValue: nil,
                        currentValue: nil
                    )
                }
                return LensRowModel(
                    mode: mode,
                    isCurrent: currentMode == .river,
                    isAvailable: false,
                    reasonKey: reason.current == nil
                        ? "reading_mode.river.threshold_only"
                        : "reading_mode.river.unavailable_reason",
                    thresholdValue: reason.threshold,
                    currentValue: reason.current
                )
            }
            let available = capabilities.availableModes.contains(mode)
            return LensRowModel(
                mode: mode,
                isCurrent: currentMode == mode,
                isAvailable: available,
                reasonKey: available ? nil : "reading_mode.unavailable_generic",
                thresholdValue: nil,
                currentValue: nil
            )
        }
    }

    static func title(for mode: ConversationReadingMode) -> String {
        switch mode {
        case .focal: return String(localized: "reading_mode.focal.title", defaultValue: "Focal", bundle: .main)
        case .script: return String(localized: "reading_mode.script.title", defaultValue: "Script", bundle: .main)
        case .summary: return String(localized: "reading_mode.summary.title", defaultValue: "Résumé", bundle: .main)
        case .river: return String(localized: "reading_mode.river.title", defaultValue: "Rivière", bundle: .main)
        case .bubbles: return String(localized: "reading_mode.bubbles.title", defaultValue: "Bulles", bundle: .main)
        }
    }

    static func defaultSubtitle(for mode: ConversationReadingMode) -> String {
        switch mode {
        case .focal: return String(localized: "reading_mode.focal.subtitle", defaultValue: "Rangée vivante, mise en scène du présent", bundle: .main)
        case .script: return String(localized: "reading_mode.script.subtitle", defaultValue: "Rangée plate, densité uniforme", bundle: .main)
        case .summary: return String(localized: "reading_mode.summary.subtitle", defaultValue: "L'essentiel d'abord, la preuve à un tap", bundle: .main)
        case .river: return String(localized: "reading_mode.river.subtitle", defaultValue: "Les couloirs de la conversation", bundle: .main)
        case .bubbles: return ""
        }
    }

    /// Le sous-titre d'une ligne indisponible dit la VRAIE raison (critère
    /// §7), jamais un placeholder — et depuis l'amendement S1 (REV-3/B3), il
    /// dit LAQUELLE des trois :
    ///
    /// 1. « Jamais en conversation directe » — la Rivière n'a pas de porte ici,
    ///    aucun nombre n'a de sens. Annoncer « s'ouvrira à 5 » à un duo était
    ///    une promesse fabriquée.
    /// 2. « S'ouvrira à 5 personnes actives » — le compte d'actifs est
    ///    INCONNU (`currentValue == nil`, G-123 non livré) : on cite le seuil,
    ///    on se tait sur le reste plutôt qu'afficher « 0 aujourd'hui ».
    /// 3. « S'ouvrira à 5 personnes actives — 3 aujourd'hui » — les deux
    ///    nombres réels, INCHANGÉ.
    static func subtitle(for row: LensRowModel) -> String {
        guard !row.isAvailable, let reasonKey = row.reasonKey else {
            return defaultSubtitle(for: row.mode)
        }

        if reasonKey == "reading_mode.river.never" {
            return String(
                localized: "reading_mode.river.never",
                defaultValue: "Jamais en conversation directe",
                bundle: .main
            )
        }

        guard let threshold = row.thresholdValue else {
            return defaultSubtitle(for: row.mode)
        }

        guard let current = row.currentValue else {
            return String(
                format: String(
                    localized: "reading_mode.river.threshold_only",
                    defaultValue: "S'ouvrira à %d personnes actives",
                    bundle: .main
                ),
                threshold
            )
        }

        return String(
            format: String(
                localized: "reading_mode.river.unavailable_reason",
                defaultValue: "S'ouvrira à %d personnes actives — %d aujourd'hui",
                bundle: .main
            ),
            threshold, current
        )
    }
}

/// Feuille de choix de mode — contrat §WS-7 travail 5. Sélection PAR
/// `ReadingModeController` (préférence collante, F-080 GELÉ) : `onSelect`
/// écrit la préférence ET publie le mode dans la même boucle (critère §7).
/// « Revenir en mode auto » réengage l'orchestrateur
/// (`ReadingModeController.resetToAuto()`).
struct ReadingModeLensSheet: View {
    let rows: [LensRowModel]
    let isDark: Bool
    let onSelect: (ConversationReadingMode) -> Void
    let onResetToAuto: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(rows) { row in
                        Button {
                            guard row.isAvailable else { return }
                            onSelect(row.mode)
                            dismiss()
                        } label: {
                            rowLabel(row)
                        }
                        .buttonStyle(.plain)
                        .disabled(!row.isAvailable)
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(row.isCurrent ? [.isSelected] : [])
                    }
                }
                Section {
                    Button {
                        onResetToAuto()
                        dismiss()
                    } label: {
                        Text(String(localized: "reading_mode.lens.reset_to_auto", defaultValue: "Revenir en mode auto", bundle: .main))
                            .foregroundColor(MeeshyColors.indigo500)
                    }
                    .buttonStyle(.plain)
                }
            }
            .navigationTitle(String(localized: "reading_mode.lens.title", defaultValue: "Mode de lecture", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private func rowLabel(_ row: LensRowModel) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(ReadingModeLensCatalog.title(for: row.mode))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(row.isAvailable ? .primary : .secondary)
                Text(ReadingModeLensCatalog.subtitle(for: row))
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(.secondary)
            }
            Spacer()
            if row.isCurrent {
                Image(systemName: "checkmark")
                    .foregroundColor(MeeshyColors.indigo500)
            }
        }
        .contentShape(Rectangle())
        .opacity(row.isAvailable ? 1 : 0.6)
    }
}
