#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK05 = MeeshyKitCatalogEntry(
        key: "K05",
        name: "MeeshyLabeledSlider",
        states: [
            MeeshyKitCatalogState(id: "valeur", boardView: "A2", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "sans-valeur", boardView: "O5", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "borne-basse", boardView: "O5", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "neutre", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "teinte", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "desactive", backdrop: .media),
            MeeshyKitCatalogState(id: "piste-seule", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "grille", boardView: "O5", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK05(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyLabeledSliderSample(stateID: state.id)
            .environment(\.meeshyLabeledSliderForcesPressed, isPressed)
    }
}

/// Un réglage du catalogue : ce que l'hôte passerait au curseur.
private nonisolated struct MeeshyLabeledSliderSampleSetting: Sendable, Equatable {
    let label: String
    let initial: Double
    let range: ClosedRange<Double>
    let unit: String
    let neutral: Double?

    init(_ label: String, _ initial: Double, in range: ClosedRange<Double> = 0...100, unit: String = "", neutral: Double? = nil) {
        self.label = label
        self.initial = initial
        self.range = range
        self.unit = unit
        self.neutral = neutral
    }

    func valueText(_ value: Double) -> String {
        let rounded = Int(value.rounded())
        let signed = neutral != nil && rounded > 0 ? "+\(rounded)" : "\(rounded)"
        return unit.isEmpty ? signed : "\(signed) \(unit)"
    }

    /// Les onze réglages d'O5, dans l'ordre de la planche, rangés par deux.
    static let photoAdjustmentRows: [[MeeshyLabeledSliderSampleSetting]] = [
        [.init("Exposition", 10, in: -100...100, neutral: 0), .init("Luminosité", 24, in: -100...100, neutral: 0)],
        [.init("Contraste", 16, in: -100...100, neutral: 0), .init("Saturation", 40, in: -100...100, neutral: 0)],
        [.init("Vibrance", 0, in: -100...100, neutral: 0), .init("Température", -12, in: -100...100, neutral: 0)],
        [.init("Netteté", 30), .init("Flou", 0)],
        [.init("Vignette", 20), .init("Bloom", 10)],
        [.init("Grain", 15)],
    ]
}

/// Un curseur du catalogue, vivant : il garde sa propre valeur.
private struct MeeshyLabeledSliderSampleRow: View {
    let setting: MeeshyLabeledSliderSampleSetting
    let showsValue: Bool
    let tint: Color?

    @State private var value: Double

    init(_ setting: MeeshyLabeledSliderSampleSetting, showsValue: Bool = true, tint: Color? = nil) {
        self.setting = setting
        self.showsValue = showsValue
        self.tint = tint
        _value = State(initialValue: setting.initial)
    }

    var body: some View {
        MeeshyLabeledSlider(
            setting.label,
            value: $value,
            in: setting.range,
            step: 1,
            valueText: setting.valueText(value),
            showsValue: showsValue,
            neutral: setting.neutral,
            resetLabel: setting.neutral == nil ? nil : "Remettre à zéro",
            tint: tint
        )
    }
}

/// La piste seule du catalogue : nom et valeur annoncés, aucun en-tête visible.
private struct MeeshySliderTrackSample: View {
    @State private var value = 0.6

    var body: some View {
        MeeshySliderTrack("Intensité", value: $value, in: 0...1, valueText: "\(Int((value * 100).rounded())) %")
    }
}

/// L'échantillon d'un état, à la largeur d'un panneau de la planche.
private struct MeeshyLabeledSliderSample: View {
    let stateID: String

    var body: some View {
        content
            .frame(width: stateID == "grille" ? Self.gridWidth : Self.panelWidth, alignment: .leading)
            .meeshyGlassTone(stateID == "theme" ? .theme : .deep)
    }

    @ViewBuilder
    private var content: some View {
        switch stateID {
        case "valeur": MeeshyLabeledSliderSampleRow(.init("Taille", 40, in: 14...160, unit: "pt"))
        case "sans-valeur": MeeshyLabeledSliderSampleRow(.init("Luminosité", 24, in: -100...100, neutral: 0), showsValue: false)
        case "borne-basse": MeeshyLabeledSliderSampleRow(.init("Flou", 0), showsValue: false)
        case "neutre": MeeshyLabeledSliderSampleRow(.init("Contraste", 0, in: -100...100, neutral: 0))
        case "teinte": MeeshyLabeledSliderSampleRow(.init("Volume", 70, unit: "%"), tint: MeeshyColors.brandPrimary)
        case "theme": MeeshyLabeledSliderSampleRow(.init("Volume", 70, unit: "%"))
        case "desactive": MeeshyLabeledSliderSampleRow(.init("Épaisseur", 2, in: 1...24, unit: "pt")).disabled(true)
        case "piste-seule": MeeshySliderTrackSample()
        default: grid
        }
    }

    private var grid: some View {
        Grid(alignment: .leading, horizontalSpacing: MeeshySpacing.lg, verticalSpacing: MeeshySpacing.md) {
            ForEach(MeeshyLabeledSliderSampleSetting.photoAdjustmentRows, id: \.first?.label) { row in
                GridRow {
                    ForEach(row, id: \.label) { setting in
                        MeeshyLabeledSliderSampleRow(setting, showsValue: false)
                            .frame(width: Self.columnWidth)
                    }
                }
            }
        }
    }

    private static let panelWidth: CGFloat = 300
    private static let columnWidth: CGFloat = 162
    private static let gridWidth: CGFloat = columnWidth * 2 + MeeshySpacing.lg
}
#endif
