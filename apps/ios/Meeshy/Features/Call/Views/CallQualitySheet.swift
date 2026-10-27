import SwiftUI
import MeeshyUI

// MARK: - Call Quality Sheet

struct CallQualitySheet: View {
    @StateObject private var model: CallQualityDetailViewModel
    @Environment(\.dismiss) private var dismiss

    init(model: CallQualityDetailViewModel? = nil) {
        _model = StateObject(wrappedValue: model ?? CallQualityDetailViewModel())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            header
            if model.isWaitingForFirstReading {
                Text(String(localized: "call.quality.waiting", defaultValue: "Mesure en cours…", bundle: .main))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 88)
            } else {
                VStack(spacing: 0) {
                    ForEach(model.rows) { row in
                        CallQualityRowView(row: row)
                        if row.metric != model.rows.last?.metric {
                            Divider()
                        }
                    }
                    if let network = model.network {
                        CallQualityNetworkRowsView(context: network)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(MeeshySpacing.xl)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(String(localized: "call.quality.detail", defaultValue: "Qualité de l’appel", bundle: .main))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            if let overall = model.overall {
                Text(overall.label)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(overall.tint)
                    .padding(.horizontal, MeeshySpacing.sm)
                    .padding(.vertical, MeeshySpacing.xxs)
                    .background(Capsule().fill(overall.tint.opacity(MeeshyOpacity.light)))
            }
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(String(localized: "call.quality.close", defaultValue: "Fermer le détail de la qualité", bundle: .main))
        }
    }
}

struct CallQualityRowView: View {
    let row: CallQualityRow

    var body: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Text(row.metric.title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 8)
            Text(row.value)
                .font(.subheadline.weight(.semibold).monospacedDigit())
            Circle()
                .fill(row.grade?.tint ?? .clear)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(row.metric.title)
        .accessibilityValue(row.accessibilityValue)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

struct CallQualityNetworkRowsView: View {
    let context: CallQualityNetworkContext

    var body: some View {
        if let profile = context.profile {
            Divider()
            CallQualityLabelRow(title: CallQualityNetworkContext.profileTitle, value: profile.label)
        }
        if let route = context.routeLabel {
            Divider()
            CallQualityLabelRow(title: CallQualityNetworkContext.routeTitle, value: route)
        }
    }
}

struct CallQualityLabelRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 8)
            Text(value)
                .font(.subheadline.weight(.semibold))
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(value)
    }
}

extension CallQualityGrade {
    var tint: Color {
        switch self {
        case .good: return MeeshyColors.success
        case .medium: return MeeshyColors.warning
        case .poor: return MeeshyColors.error
        }
    }
}

// MARK: - Presentation

extension View {
    func callQualityDetailTrigger(isPresented: Binding<Bool>) -> some View {
        self
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .onTapGesture { isPresented.wrappedValue = true }
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(String(localized: "call.quality.open.hint", defaultValue: "Affiche la latence, la perte et les débits en direct", bundle: .main))
            .accessibilityAction { isPresented.wrappedValue = true }
    }

    func callQualityDetailSheet(isPresented: Binding<Bool>) -> some View {
        sheet(isPresented: isPresented) {
            CallQualitySheet()
        }
    }
}
