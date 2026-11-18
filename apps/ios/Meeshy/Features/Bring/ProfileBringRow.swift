import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bring dans « Ensemble » sur la face Actions d'un autre (#13936, hiérarchie #19433, planche `Autre-Actions`) :
/// l'action libellée du kit (K32) porte son compteur « 2 / 3 aujourd'hui » et demande confirmation. Rien tant que la
/// passerelle ne l'ouvre pas — ni action grisée, ni raison : un blocage ne se devine pas.
struct ProfileBringAction: View {
    @ObservedObject var viewModel: ProfileBringViewModel
    let displayName: String
    let tint: Color
    @State private var confirming = false

    var body: some View {
        if let availability = viewModel.availability, availability.available {
            MeeshyLabeledAction(
                title: ProfileBringWording.action,
                systemImage: "bell.and.waves.left.and.right",
                value: ProfileBringWording.counter(availability) ?? ProfileBringWording.remaining(availability),
                valueKind: availability.isExhausted ? .quiet : .accent,
                isPending: viewModel.isSending,
                tint: tint,
                hint: availability.isExhausted ? ProfileBringWording.quota(name: displayName) : nil,
                label: ProfileBringWording.confirmTitle(name: displayName),
                action: {
                    HapticFeedback.medium()
                    confirming = true
                }
            )
            .disabled(viewModel.isSending || availability.isExhausted || viewModel.ringing != nil)
            .accessibilityIdentifier("bring.send")
            .confirmationDialog(
                ProfileBringWording.confirmTitle(name: displayName),
                isPresented: $confirming,
                titleVisibility: .visible
            ) {
                Button(ProfileBringWording.confirmSend, role: .destructive) {
                    Task { await viewModel.send(name: displayName) }
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            } message: {
                Text(ProfileBringWording.confirmBody(name: displayName))
            }
        }
    }
}

/// Sous la grille d'« Ensemble » : la phrase qui dit ce qu'est un Bring (le cas du silencieux derrière un (i)) et,
/// tant que ça sonne chez l'autre, « Annuler le Bring ».
struct ProfileBringRow: View {
    @ObservedObject var viewModel: ProfileBringViewModel
    let displayName: String
    @State private var openNoteID: String?
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        if viewModel.isOffered {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                MeeshyInfoNoted(note: ProfileBringWording.explainNote, openNoteID: $openNoteID, tint: theme.textSecondary) {
                    Text(ProfileBringWording.explain)
                        .font(.footnote)
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if viewModel.ringing != nil {
                    ringingLine
                }
            }
        }
    }

    private var ringingLine: some View {
        HStack(spacing: MeeshySpacing.md) {
            Text("🔔 " + ProfileBringWording.ringing(name: displayName))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.updatesFrequently)
            Button(ProfileBringWording.cancel) {
                HapticFeedback.medium()
                viewModel.cancel()
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(theme.error)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .accessibilityIdentifier("bring.cancel")
        }
    }
}
