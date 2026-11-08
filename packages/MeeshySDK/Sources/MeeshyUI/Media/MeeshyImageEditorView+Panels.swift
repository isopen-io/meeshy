import MeeshySDK
import SwiftUI
import UIKit

extension MeeshyImageEditorView {
    // MARK: Crop Panel

    var cropPanel: some View {
        VStack(spacing: MeeshySpacing.mdPlus) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    ForEach(cropRatios, id: \.label) { ratio in
                        ratioChip(ratio)
                    }
                }
                .padding(.horizontal, MeeshySpacing.xxs)
            }

            HStack(spacing: MeeshySpacing.smPlus) {
                geometryButton("rotate.left",
                               label: String(localized: "media.editor.rotateLeft", defaultValue: "Pivoter \u{00E0} gauche", bundle: .module)) {
                    rotate(clockwise: false)
                }
                geometryButton("rotate.right",
                               label: String(localized: "media.editor.rotateRight", defaultValue: "Pivoter \u{00E0} droite", bundle: .module)) {
                    rotate(clockwise: true)
                }
                if viewModel.mode.isPro {
                    geometryButton("arrow.left.arrow.right",
                                   label: String(localized: "media.editor.flipH", defaultValue: "Miroir horizontal", bundle: .module)) {
                        flip(horizontal: true)
                    }
                    geometryButton("arrow.up.arrow.down",
                                   label: String(localized: "media.editor.flipV", defaultValue: "Miroir vertical", bundle: .module)) {
                        flip(horizontal: false)
                    }
                }
            }

            Text(String(localized: "media.editor.cropHint",
                         defaultValue: "Faites glisser les poign\u{00E9}es pour recadrer",
                         bundle: .module))
                .font(.system(size: 11))
                .foregroundColor(theme.textMuted)
        }
    }

    private var cropRatios: [CropRatio] {
        viewModel.mode.isPro
            ? [.free, .square, .ratio4x3, .ratio16x9, .ratio9x16]
            : [.free, .square, .ratio4x3, .ratio16x9]
    }

    private func ratioChip(_ ratio: CropRatio) -> some View {
        let isSelected = cropRatio == ratio
        return Button {
            HapticFeedback.light()
            cropDirty = true
            withAnimation(.spring(response: 0.26, dampingFraction: 0.82)) {
                cropRatio = ratio
            }
        } label: {
            Text(ratio.label)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: isSelected ? .bold : .medium))
                .foregroundColor(isSelected ? .white : theme.textSecondary)
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.sm)
                .background(
                    Capsule().fill(isSelected
                                   ? AnyShapeStyle(theme.buttonGradient(color: accentColor))
                                   : AnyShapeStyle(theme.inputBackground))
                )
        }
        .buttonStyle(.plain)
    }

    private func geometryButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: MeeshyIconSize.sm, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous).fill(theme.inputBackground))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    // MARK: Filters Panel

    var filtersPanel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.md) {
                ForEach(visibleFilters) { filter in
                    filterCell(filter)
                }
            }
            .padding(.horizontal, MeeshySpacing.xxs)
            .padding(.bottom, MeeshySpacing.xs)
        }
    }

    private var visibleFilters: [ImageFilter] {
        viewModel.mode.isPro ? ImageFilter.allCases : ImageFilter.allCases.filter(\.isEssential)
    }

    private func filterCell(_ filter: ImageFilter) -> some View {
        let isSelected = viewModel.state.filter == filter
        return Button {
            HapticFeedback.light()
            viewModel.perform(filter.displayName) { $0.filter = filter }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                Group {
                    if let thumb = viewModel.filterThumbnails[filter] {
                        Image(uiImage: thumb)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else {
                        Rectangle()
                            .fill(theme.inputBackground)
                            .overlay(ProgressView().controlSize(.small))
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                        .strokeBorder(isSelected ? accent : .clear, lineWidth: MeeshyBorder.strong)
                )

                Text(filter.displayName)
                    .font(.system(size: MeeshyFont.captionSize, weight: isSelected ? .bold : .medium))
                    .foregroundColor(isSelected ? accent : theme.textSecondary)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: Adjust Panel

    var adjustPanel: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: MeeshySpacing.md) {
                ForEach(visibleAdjustments) { kind in
                    adjustmentRow(kind)
                }
                if viewModel.state.adjustments.activeCount > 0 {
                    Button {
                        viewModel.perform(String(localized: "media.editor.resetAdjust", defaultValue: "Ajustements r\u{00E9}initialis\u{00E9}s", bundle: .module)) {
                            $0.adjustments = .neutral
                        }
                        HapticFeedback.light()
                    } label: {
                        Text(String(localized: "media.editor.reset", defaultValue: "R\u{00E9}initialiser", bundle: .module))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .foregroundColor(accent)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, MeeshySpacing.xxs)
                }
            }
            .padding(.bottom, MeeshySpacing.xsPlus)
        }
        .frame(maxHeight: 230)
    }

    private var visibleAdjustments: [AdjustmentKind] {
        viewModel.mode.isPro ? AdjustmentKind.toneCases : AdjustmentKind.toneCases.filter(\.isEssential)
    }

    private func adjustmentRow(_ kind: AdjustmentKind) -> some View {
        let value = viewModel.state.adjustments[kind]
        let isActive = abs(value - kind.neutralValue) > 0.0001
        return HStack(spacing: MeeshySpacing.smPlus) {
            Image(systemName: kind.icon)
                .font(.system(size: MeeshyIconSize.xs))
                .foregroundColor(isActive ? accent : theme.textMuted)
                .frame(width: 18)

            Text(kind.label)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .frame(width: 78, alignment: .leading)

            Slider(
                value: adjustmentBinding(kind),
                in: kind.range,
                onEditingChanged: { editing in
                    if !editing { viewModel.commit(kind.label) }
                }
            )
            .tint(accent)

            Text(formatAdjustment(value, kind: kind))
                .font(.system(size: MeeshyFont.captionSize, weight: .semibold).monospacedDigit())
                .foregroundColor(theme.textMuted)
                .frame(width: 34, alignment: .trailing)
        }
    }

    private func adjustmentBinding(_ kind: AdjustmentKind) -> Binding<Float> {
        Binding(
            get: { viewModel.state.adjustments[kind] },
            set: { newValue in viewModel.update { $0.adjustments[kind] = newValue } }
        )
    }

    private func formatAdjustment(_ value: Float, kind: AdjustmentKind) -> String {
        String(format: "%+.1f", value - kind.neutralValue)
    }

    // MARK: Effects Panel

    var effectsPanel: some View {
        let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
        return ScrollView(.vertical, showsIndicators: false) {
            LazyVGrid(columns: columns, spacing: MeeshySpacing.smPlus) {
                ForEach(ImageEffect.allCases) { effect in
                    effectCell(effect)
                }
            }
            .padding(.bottom, MeeshySpacing.xsPlus)
        }
        .frame(maxHeight: 200)
    }

    private func effectCell(_ effect: ImageEffect) -> some View {
        let isSelected = viewModel.state.effect == effect
        return Button {
            HapticFeedback.light()
            viewModel.perform(effect.displayName) {
                $0.effect = ($0.effect == effect ? .none : effect)
            }
        } label: {
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: effect.iconName)
                    .font(.system(size: MeeshyIconSize.md))
                Text(effect.displayName)
                    .font(.system(size: MeeshyFont.captionSize, weight: .semibold))
            }
            .foregroundColor(isSelected ? accent : theme.textSecondary)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                    .fill(isSelected ? accent.opacity(isDark ? 0.16 : 0.1) : theme.inputBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                    .strokeBorder(isSelected ? accent : .clear, lineWidth: MeeshyBorder.emphasis)
            )
        }
        .buttonStyle(.plain)
    }
}
