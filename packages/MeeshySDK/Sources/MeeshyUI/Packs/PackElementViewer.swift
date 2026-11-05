import SwiftUI
import MeeshySDK

// MARK: - Le plein écran d'un élément de pack (#16268)

/// Ce que la fiche et le plein écran lisent de la vitrine : ses rangées vivantes, les gestes en
/// cours, l'essayeur et le bouton d'installation.
struct PackShowcaseContext {
    let rows: [PackRow]
    let pending: Set<String>
    let wearer: PackStageWearer
    let onToggle: (String) -> Void

    func row(_ slug: String) -> PackRow? { rows.first { $0.slug == slug } }
}

/// **Le plein écran** : l'élément posé sur ce qu'il décore, les autres éléments du pack d'un glissement
/// horizontal (n / N), le pincement de ×1 à ×4, le double toucher ×1 ⇄ ×2, « Équiper » et les autres
/// propositions. On revient à la boutique par ✕, en glissant vers le bas ou depuis le bord.
struct PackElementViewer: View {
    @ObservedObject var model: PackShowcaseModel
    let context: PackShowcaseContext
    let onClose: () -> Void

    @State private var zoom = PackZoom()
    @State private var pan: CGSize = .zero
    @State private var dismissDrag: CGFloat = 0

    private var target: PackViewerTarget? { model.viewer }

    private var elements: [PackElement] {
        guard let target, case .ready(let elements) = model.elements(domain: target.domain, pack: target.slug) else { return [] }
        return elements
    }

    private var pager: PackViewerPager { PackViewerPager(index: target?.index ?? 0, count: elements.count) }

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground)
                .opacity(FullscreenDismissDrag.backdropOpacity(translation: dismissDrag))
                .ignoresSafeArea()
            pages
                .offset(y: dismissDrag)
            VStack(spacing: 0) {
                FullscreenTopBar(tone: .adaptive, onClose: onClose) {
                    EmptyView()
                } trailing: {
                    positionBadge
                }
                Spacer(minLength: 0)
                PackViewerFooter(model: model, context: context, element: elements[safe: pager.index], target: target)
            }
            .opacity(dismissDrag > 0 ? 0 : 1)
            edgeStrip
        }
        .accessibilityAction(.escape) { onClose() }
        .adaptiveOnChange(of: target?.slug) { _, _ in resetZoom() }
    }

    // MARK: Pages

    @ViewBuilder
    private var pages: some View {
        if elements.isEmpty {
            PackDownloadRequiredView()
                .padding(MeeshySpacing.xl)
                .simultaneousGesture(dismissGesture)
        } else {
            TabView(selection: selection) {
                ForEach(Array(elements.enumerated()), id: \.element.id) { index, element in
                    page(element, isCurrent: index == pager.index)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .scrollDisabled(!zoom.allowsPaging)
            .ignoresSafeArea()
        }
    }

    private var selection: Binding<Int> {
        Binding(get: { pager.index }, set: { index in
            resetZoom()
            model.select(index: index)
        })
    }

    private func page(_ element: PackElement, isCurrent: Bool) -> some View {
        PackElementStage(element: element, wearer: context.wearer, animates: isCurrent)
            .padding(.vertical, isWallpaper(element) ? 0 : 140)
            .scaleEffect(isCurrent ? zoom.scale : 1)
            .offset(isCurrent ? pan : .zero)
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { toggleZoom() }
            .gesture(pinchGesture)
            .simultaneousGesture(dismissGesture, including: zoom.allowsPaging ? .all : .subviews)
            .highPriorityGesture(panGesture, including: zoom.allowsPaging ? .subviews : .all)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(element.name)
            .accessibilityValue(String(format: String(localized: "shop.viewer.position.a11y",
                                                      defaultValue: "Élément %1$lld sur %2$lld", bundle: .module),
                                       pager.index + 1, pager.count))
            .accessibilityHint(String(localized: "shop.viewer.zoom.hint",
                                      defaultValue: "Pince ou touche deux fois pour zoomer", bundle: .module))
            .accessibilityAction(named: Text(String(localized: "shop.viewer.next", defaultValue: "Suivant", bundle: .module))) {
                step(pager.next())
            }
            .accessibilityAction(named: Text(String(localized: "shop.viewer.previous", defaultValue: "Précédent", bundle: .module))) {
                step(pager.previous())
            }
            .accessibilityIdentifier("shop.viewer.page.\(element.item)")
    }

    private func isWallpaper(_ element: PackElement) -> Bool {
        if case .wallpaper = element.art { return true }
        return false
    }

    private var positionBadge: some View {
        Text(pager.position)
            .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .padding(.horizontal, MeeshySpacing.md)
            .frame(minHeight: 32)
            .background(Capsule().fill(.regularMaterial))
            .opacity(elements.count > 1 ? 1 : 0)
            .accessibilityHidden(true)
            .accessibilityIdentifier("shop.viewer.position")
    }

    // MARK: Gestes

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in zoom = zoom.pinching(value) }
            .onEnded { _ in
                zoom = zoom.settled()
                if zoom.allowsPaging { withAnimation(.spring(response: 0.3)) { pan = .zero } }
            }
    }

    private var panGesture: some Gesture {
        DragGesture()
            .onChanged { value in pan = value.translation }
    }

    private var dismissGesture: some Gesture {
        DragGesture(minimumDistance: 20)
            .onChanged { value in
                guard abs(value.translation.height) > abs(value.translation.width) else { return }
                dismissDrag = max(0, value.translation.height)
            }
            .onEnded { value in
                if FullscreenDismissDrag.shouldDismiss(translation: dismissDrag,
                                                       predictedEnd: value.predictedEndTranslation.height) {
                    onClose()
                    return
                }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { dismissDrag = 0 }
            }
    }

    /// Le geste de bord : une bande au bord d'attaque, au-dessus des pages, ramène à la boutique.
    private var edgeStrip: some View {
        HStack {
            Color.clear
                .frame(width: 20)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 10)
                        .onEnded { value in
                            if value.translation.width > 60 || value.predictedEndTranslation.width > 160 { onClose() }
                        }
                )
                .accessibilityHidden(true)
            Spacer(minLength: 0)
        }
        .ignoresSafeArea()
    }

    private func toggleZoom() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            zoom = zoom.doubleTapped()
            if zoom.allowsPaging { pan = .zero }
        }
    }

    private func resetZoom() {
        zoom = PackZoom()
        pan = .zero
    }

    private func step(_ next: PackViewerPager) {
        guard next.index != pager.index else { return }
        resetZoom()
        withAnimation { model.select(index: next.index) }
    }
}

// MARK: - Le pied du plein écran

/// Le nom, « Équiper » (ou installer le pack), et les autres propositions de la même catégorie.
struct PackViewerFooter: View {
    @ObservedObject var model: PackShowcaseModel
    let context: PackShowcaseContext
    let element: PackElement?
    let target: PackViewerTarget?

    private var row: PackRow? { target.flatMap { context.row($0.slug) } }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack(alignment: .center, spacing: MeeshySpacing.md) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(element?.name ?? row?.name ?? "")
                        .font(MeeshyFont.relative(17, weight: .semibold, design: .rounded))
                        .lineLimit(2)
                    if let row {
                        Text(row.name)
                            .font(MeeshyFont.relative(13))
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                action
            }
            if model.equipFailed {
                Text(String(localized: "shop.viewer.equip.failed", defaultValue: "Impossible d’équiper cet élément. Réessaie.", bundle: .module))
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundStyle(MeeshyColors.error)
            }
            alternatives
        }
        .padding(MeeshySpacing.lg)
        .background(Rectangle().fill(.regularMaterial).ignoresSafeArea(edges: .bottom))
        .adaptiveOnChange(of: model.equipFailed) { _, failed in
            guard failed else { return }
            UIAccessibility.post(notification: .announcement,
                                 argument: String(localized: "shop.viewer.equip.failed", defaultValue: "Impossible d’équiper cet élément. Réessaie.", bundle: .module))
        }
    }

    @ViewBuilder
    private var action: some View {
        if let element, let row, PackDetailFacts.canEquip(element, in: row) {
            equipButton(element)
        } else if let row, PackShopView.showsLocked(row) {
            Text(PackUnlockCopy.lockedTitle)
                .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        } else if let row, !row.installed || (element?.equipSide != nil && row.needsPurchase) {
            PackInstallButton(row: row, busy: context.pending.contains(row.slug), onToggle: context.onToggle)
        }
    }

    private func equipButton(_ element: PackElement) -> some View {
        let equipped = model.isEquipped(element)
        return Button {
            HapticFeedback.light()
            Task { await model.equip(element) }
        } label: {
            Label(equipped ? String(localized: "shop.viewer.equipped", defaultValue: "Équipé", bundle: .module)
                           : String(localized: "shop.viewer.equip", defaultValue: "Équiper", bundle: .module),
                  systemImage: equipped ? "checkmark.circle.fill" : "sparkles")
                .font(MeeshyFont.relative(15, weight: .semibold, design: .rounded))
                .foregroundStyle(equipped ? Color.primary : Color.white)
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(minHeight: 44)
                .background {
                    if equipped {
                        Capsule().fill(Color.primary.opacity(0.08))
                    } else {
                        Capsule().fill(MeeshyColors.brandGradient)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(equipped)
        .accessibilityAddTraits(equipped ? .isSelected : [])
        .accessibilityIdentifier("shop.viewer.equip")
    }

    @ViewBuilder
    private var alternatives: some View {
        let others = target.map { PackDetailFacts.alternatives(to: $0.slug, among: context.rows) } ?? []
        if !others.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(String(localized: "shop.viewer.alternatives", defaultValue: "Autres propositions", bundle: .module))
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityAddTraits(.isHeader)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: MeeshySpacing.md) {
                        ForEach(others) { other in alternative(other) }
                    }
                }
            }
        }
    }

    private func alternative(_ other: PackRow) -> some View {
        Button {
            HapticFeedback.light()
            model.showAlternative(other.slug)
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                PackCoverView(cover: other.cover, side: 56)
                    .frame(width: 56, height: 56)
                Text(other.name)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .frame(width: 76)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(other.name)
        .accessibilityIdentifier("shop.viewer.alternative.\(other.slug)")
    }
}

/// Le bouton Installer / Retirer / Acheter d'un pack, partagé par la rangée, la fiche et le plein écran.
struct PackInstallButton: View {
    let row: PackRow
    let busy: Bool
    let onToggle: (String) -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            onToggle(row.slug)
        } label: {
            Text(PackShopView.buttonTitle(for: row))
                .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                .foregroundStyle(row.installed ? Color.primary : Color.white)
                .padding(.horizontal, 14)
                .frame(minHeight: 32)
                .background {
                    if row.installed {
                        Capsule().fill(Color.primary.opacity(0.08))
                    } else {
                        Capsule().fill(MeeshyColors.brandGradient)
                    }
                }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .opacity(busy ? 0.6 : 1)
        .accessibilityLabel(PackShopView.voiceOverLabel(for: row))
    }
}
