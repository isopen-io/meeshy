import SwiftUI
import MeeshyE2EE
import MeeshyUI

/// Un de mes autres appareils (#13009) : ses deux sens d'approbation, puis les
/// retraits. « Lire son code » approuve CET appareil-là ici ; « Montrer mon
/// code » le laisse m'approuver là-bas.
struct EncryptedDeviceSheet: View {
    private enum Confirmation: Identifiable {
        case revoke, retire
        var id: Self { self }
    }

    let device: EndToEndOwnDevice
    @ObservedObject var model: EncryptedDevicesViewModel
    let onScan: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var confirmation: Confirmation?
    private var theme: ThemeManager { ThemeManager.shared }

    /// La ligne fraîche de cet appareil si la liste s'est rechargée, sinon celle reçue.
    private var current: EndToEndOwnDevice { model.devices.first { $0.deviceId == device.deviceId } ?? device }
    private var title: String { EncryptedDevicePresentation.title(of: current) }
    private var shown: EncryptedDevicesViewModel.ShownCode? { model.shownCode?.device.deviceId == device.deviceId ? model.shownCode : nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    EncryptedDeviceRow(device: current, isBusy: model.busyDeviceId == device.deviceId)
                    readTheirCode
                    showMyCode
                    removal
                }
                .padding(MeeshySpacing.lg)
            }
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "Terminé", bundle: .main)) { dismiss() }
                }
            }
        }
        .onDisappear { model.shownCode = nil }
        .confirmationDialog(confirmationTitle, isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible, presenting: confirmation) { kind in
            Button(confirmationAction(kind), role: .destructive) {
                Task { await perform(kind) }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: { kind in
            Text(confirmationMessage(kind))
        }
        .alert(
            EncryptedDeviceNoticeText.title(model.notice, devices: model.devices),
            isPresented: Binding(get: { model.notice == .actionFailed }, set: { if !$0 { model.notice = nil } }),
            actions: { Button(String(localized: "common.ok", defaultValue: "OK", bundle: .main), role: .cancel) {} },
            message: { Text(EncryptedDeviceNoticeText.message(model.notice)) }
        )
    }

    // MARK: - Les deux sens

    @ViewBuilder
    private var readTheirCode: some View {
        step(
            number: 1,
            title: String(format: String(localized: "e2ee.devices.step.read.title", defaultValue: "Approuver « %@ » sur cet appareil", bundle: .main), title),
            text: current.trust == .approved
                ? String(localized: "e2ee.devices.step.read.done", defaultValue: "C’est fait : cet appareil lui écrit et le lit.", bundle: .main)
                : String(format: String(localized: "e2ee.devices.step.read.text", defaultValue: "Sur « %@ », ouvrez Réglages › Sécurité › Mes appareils chiffrés, choisissez cet appareil et touchez « Montrer mon code ». Lisez ce code ici.", bundle: .main), title)
        ) {
            if current.trust != .approved {
                actionButton(String(localized: "e2ee.devices.step.read.action", defaultValue: "Lire son code", bundle: .main), systemImage: "qrcode.viewfinder", prominent: true) {
                    onScan()
                }
            }
        }
    }

    @ViewBuilder
    private var showMyCode: some View {
        step(
            number: 2,
            title: String(format: String(localized: "e2ee.devices.step.show.title", defaultValue: "Me faire approuver par « %@ »", bundle: .main), title),
            text: String(format: String(localized: "e2ee.devices.step.show.text", defaultValue: "Sur « %@ », touchez « Lire son code » face à cet appareil et lisez le code ci-dessous.", bundle: .main), title)
        ) {
            if let shown {
                EncryptedDeviceCodeView(shown: shown)
            } else {
                actionButton(String(localized: "e2ee.devices.step.show.action", defaultValue: "Montrer mon code", bundle: .main), systemImage: "qrcode", prominent: false) {
                    Task { await model.showCode(towards: current) }
                }
                .disabled(model.busyDeviceId != nil)
            }
        }
    }

    private func step<Actions: View>(number: Int, title: String, text: String, @ViewBuilder actions: () -> Actions) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                .foregroundStyle(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityLabel(String(format: String(localized: "e2ee.devices.step.a11y", defaultValue: "Étape %d : %@", bundle: .main), number, title))
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            actions()
        }
    }

    private func actionButton(_ title: String, systemImage: String, prominent: Bool, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Label(title, systemImage: systemImage)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                .foregroundStyle(prominent ? .white : MeeshyColors.indigo500)
                .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .fill(prominent ? MeeshyColors.indigo500 : MeeshyColors.indigo500.opacity(MeeshyOpacity.light))
                )
        }
    }

    // MARK: - Retraits

    private var removal: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if current.trust == .approved {
                destructiveButton(String(localized: "e2ee.devices.revoke", defaultValue: "Ne plus approuver", bundle: .main)) { confirmation = .revoke }
            }
            destructiveButton(String(localized: "e2ee.devices.retire", defaultValue: "Retirer du compte", bundle: .main)) { confirmation = .retire }
        }
        .padding(.top, MeeshySpacing.sm)
    }

    private func destructiveButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(role: .destructive) {
            HapticFeedback.medium()
            action()
        } label: {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                .foregroundStyle(MeeshyColors.error)
                .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
        }
        .disabled(model.busyDeviceId != nil)
    }

    private var confirmationTitle: String {
        switch confirmation {
        case .revoke: String(format: String(localized: "e2ee.devices.revoke.confirm", defaultValue: "Ne plus approuver « %@ » ?", bundle: .main), title)
        case .retire, nil: String(format: String(localized: "e2ee.devices.retire.confirm", defaultValue: "Retirer « %@ » du compte ?", bundle: .main), title)
        }
    }

    private func confirmationAction(_ kind: Confirmation) -> String {
        switch kind {
        case .revoke: String(localized: "e2ee.devices.revoke", defaultValue: "Ne plus approuver", bundle: .main)
        case .retire: String(localized: "e2ee.devices.retire", defaultValue: "Retirer du compte", bundle: .main)
        }
    }

    private func confirmationMessage(_ kind: Confirmation) -> String {
        switch kind {
        case .revoke:
            String(localized: "e2ee.devices.revoke.message", defaultValue: "Cet appareil-ci ne lui enverra plus vos messages chiffrés et ne lira plus les siens. Vous pourrez l’approuver de nouveau en lisant son code.", bundle: .main)
        case .retire:
            String(localized: "e2ee.devices.retire.message", defaultValue: "Il ne recevra plus aucun message chiffré. Pour chiffrer de nouveau, il devra se réinscrire sous une nouvelle identité, puis être approuvé.", bundle: .main)
        }
    }

    private func perform(_ kind: Confirmation) async {
        switch kind {
        case .revoke:
            await model.revokeApproval(of: current)
        case .retire:
            await model.retire(current)
            if model.notice != .actionFailed { dismiss() }
        }
    }
}
