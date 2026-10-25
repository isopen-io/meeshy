import SwiftUI
import MeeshyE2EE
import MeeshySDK
import MeeshyUI

/// Sécurité › Mes appareils chiffrés (#13009). Cet appareil en tête, puis
/// chacun de mes autres appareils, approuvé ou en attente ; une ligne ouvre
/// l'appareil (montrer mon code, lire le sien, retirer). « Lire le code d'un
/// appareil » est le geste nominal : le code désigne lui-même l'appareil.
struct EncryptedDevicesView: View {
    enum ActiveSheet: Identifiable, Equatable {
        case device(EndToEndOwnDevice)
        /// Ouvert depuis la feuille d'un appareil : seul son code s'approuve.
        case scanner(expecting: EndToEndOwnDevice?)

        var id: String {
            switch self {
            case .device(let device): "device-\(device.deviceId)"
            case .scanner(let expected): "scanner-\(expected?.deviceId ?? 0)"
            }
        }
    }

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var model: EncryptedDevicesViewModel
    @State private var activeSheet: ActiveSheet?

    init(model: @autoclosure @escaping () -> EncryptedDevicesViewModel = .live()) {
        _model = StateObject(wrappedValue: model())
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            CollapsibleHeaderPage(
                title: String(localized: "e2ee.devices.title", defaultValue: "Mes appareils chiffrés", bundle: .main),
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary
            ) {
                content
            }
        }
        .onAppear { model.showCached() }
        .task { await model.load() }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .device(let device):
                EncryptedDeviceSheet(device: device, model: model) { activeSheet = .scanner(expecting: device) }
            case .scanner(let expected):
                EncryptedDeviceScannerSheet(model: model, expected: expected)
            }
        }
        .alert(
            noticeTitle,
            isPresented: Binding(get: { activeSheet == nil && model.notice != nil }, set: { _ in }),
            actions: { Button(String(localized: "common.ok", defaultValue: "OK", bundle: .main), role: .cancel) { model.notice = nil } },
            message: { Text(noticeMessage) }
        )
    }

    private var noticeTitle: String { EncryptedDeviceNoticeText.title(model.notice, devices: model.devices) }
    private var noticeMessage: String { EncryptedDeviceNoticeText.message(model.notice) }

    // MARK: - Contenu

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            explanation
            statusBanner
            if model.devices.isEmpty {
                emptyContent
            } else {
                devicesList
            }
            scanButton
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.xxxl)
    }

    private var explanation: some View {
        Text(String(
            localized: "e2ee.devices.explanation",
            defaultValue: "Vos messages chiffrés de bout en bout ne parviennent qu’aux appareils que vous avez approuvés. Pour approuver un appareil, lisez son code depuis celui-ci, puis faites l’inverse.",
            bundle: .main
        ))
        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
        .foregroundStyle(theme.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private var statusBanner: some View {
        switch model.loadState {
        case .offline where !model.devices.isEmpty:
            banner(systemImage: "wifi.slash", text: String(localized: "e2ee.devices.offline.banner", defaultValue: "Hors ligne — dernières informations connues.", bundle: .main))
        case .failed where !model.devices.isEmpty:
            banner(systemImage: "exclamationmark.triangle", text: String(localized: "e2ee.devices.error.banner", defaultValue: "Actualisation impossible pour le moment.", bundle: .main))
        default:
            EmptyView()
        }
    }

    private func banner(systemImage: String, text: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
            .foregroundStyle(theme.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.md)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(MeeshyColors.warning.opacity(MeeshyOpacity.light)))
            .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var emptyContent: some View {
        switch model.loadState {
        case .idle, .loading, .loaded:
            EncryptedDevicesSkeleton()
        case .offline:
            unavailable(
                title: String(localized: "e2ee.devices.offline.title", defaultValue: "Vous êtes hors ligne", bundle: .main),
                systemImage: "wifi.slash",
                description: String(localized: "e2ee.devices.offline.subtitle", defaultValue: "Vos appareils s’afficheront au retour du réseau.", bundle: .main)
            )
        case .failed:
            unavailable(
                title: String(localized: "e2ee.devices.error.title", defaultValue: "Impossible de lire vos appareils", bundle: .main),
                systemImage: "exclamationmark.triangle",
                description: String(localized: "e2ee.devices.error.subtitle", defaultValue: "Vérifiez votre connexion, puis réessayez.", bundle: .main)
            )
        }
    }

    private func unavailable(title: String, systemImage: String, description: String) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            AdaptiveContentUnavailableView(title, systemImage: systemImage, description: Text(description))
            Button {
                Task { await model.load() }
            } label: {
                Text(String(localized: "e2ee.devices.retry", defaultValue: "Réessayer", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.indigo500)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xl)
    }

    private var devicesList: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if let current = model.currentDevice {
                sectionTitle(String(localized: "e2ee.devices.section.current", defaultValue: "Cet appareil", bundle: .main))
                EncryptedDeviceRow(device: current, isBusy: false)
            }
            sectionTitle(String(localized: "e2ee.devices.section.others", defaultValue: "Mes autres appareils", bundle: .main))
                .padding(.top, MeeshySpacing.sm)
            if model.otherDevices.isEmpty {
                Text(String(
                    localized: "e2ee.devices.others.empty",
                    defaultValue: "Aucun autre appareil chiffré. Ouvrez Meeshy sur votre autre appareil : il apparaîtra ici.",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(model.otherDevices) { device in
                Button {
                    HapticFeedback.light()
                    activeSheet = .device(device)
                } label: {
                    EncryptedDeviceRow(device: device, isBusy: model.busyDeviceId == device.deviceId)
                }
                .buttonStyle(.plain)
                .accessibilityHint(String(localized: "e2ee.devices.row.hint", defaultValue: "Ouvre cet appareil pour l’approuver, montrer votre code ou le retirer", bundle: .main))
            }
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundStyle(theme.textSecondary)
            .textCase(.uppercase)
            .padding(.leading, MeeshySpacing.xs)
            .accessibilityAddTraits(.isHeader)
    }

    private var scanButton: some View {
        Button {
            HapticFeedback.light()
            activeSheet = .scanner(expecting: nil)
        } label: {
            Label(String(localized: "e2ee.devices.scan", defaultValue: "Lire le code d’un appareil", bundle: .main), systemImage: "qrcode.viewfinder")
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.buttonHeight)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus).fill(MeeshyColors.indigo500))
        }
        .disabled(model.loadState == .offline)
        .accessibilityHint(String(localized: "e2ee.devices.scan.hint", defaultValue: "Ouvre la caméra pour lire le code affiché par votre autre appareil", bundle: .main))
    }
}

/// Le squelette d'une liste jamais chargée : trois lignes, une seule annonce.
private struct EncryptedDevicesSkeleton: View {
    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            ForEach(0..<3, id: \.self) { _ in
                HStack(spacing: MeeshySpacing.md) {
                    SkeletonShape(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact, cornerRadius: MeeshyRadius.xs)
                    VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                        SkeletonShape(width: 140, height: 14)
                        SkeletonShape(width: 100, height: 10)
                    }
                    Spacer(minLength: 0)
                }
                .padding(MeeshySpacing.md)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "e2ee.devices.loading", defaultValue: "Chargement de vos appareils", bundle: .main))
    }
}
