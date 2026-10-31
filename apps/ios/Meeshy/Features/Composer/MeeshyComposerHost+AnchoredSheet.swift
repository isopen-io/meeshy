import SwiftUI
import MeeshySDK
import MeeshyUI

// **Les feuilles ANCRÉES du meuble, et la question avant de fermer** (#13839, L3).
//
// Une feuille du compositeur n'est plus une présentation système qui couvre la
// scène : elle se pose en bas de la pile, sans voile, et la scène se réduit au
// dessus d'elle (`ComposerSceneFraming`, `composerAnchoredSheetTop`). Une seule
// à la fois — c'est toujours `presentedPortal` qui la nomme.
extension MeeshyComposerHost {

    var anchoredPortal: ComposerPortal? {
        presentedPortal?.presentation == .anchored ? presentedPortal : nil
    }

    func closeAnchoredSheet() {
        presentedPortal = nil
    }

    /// Ce que la fermeture EFFECTIVE d'une feuille système faisait (`onDismiss`) :
    /// éteindre le contexte d'un son édité, puis reprendre l'importateur en
    /// attente. Une feuille ancrée se ferme sans présentateur à libérer — la
    /// reprise suit donc le changement d'état lui-même.
    func anchoredPortalDidChange(from ancien: ComposerPortal?, to nouveau: ComposerPortal?) {
        guard ancien?.presentation == .anchored, ancien != nouveau else { return }
        forgetEditedSound()
        // Refermer la feuille Sticker ou Lieu sans choisir n'arme rien pour
        // la prochaine pose (#13839, L5).
        if ancien == .sticker { stickerReplacementId = nil }
        if ancien == .location { placeRepointId = nil }
        if nouveau == nil { resumePendingPresentation() }
    }

    /// La pile, sa feuille ancrée et la question de fermeture.
    func withAnchoredSheet<Content: View>(_ content: Content) -> some View {
        content
            .overlay { ComposerHostAnchoredSheetLayer(host: self, observation: observation) }
            .onPreferenceChange(ComposerAnchoredSheetTopKey.self) { anchoredSheetTop = $0 }
            .environment(\.composerAnchoredSheetTop, anchoredPortal == nil ? nil : anchoredSheetTop)
            .adaptiveOnChange(of: presentedPortal) { ancien, nouveau in
                anchoredPortalDidChange(from: ancien, to: nouveau)
            }
            .confirmationDialog(ComposerCloseGuardCopy.title,
                                isPresented: Binding(get: { closeQuestion != nil },
                                                     set: { if !$0 { closeQuestion = nil } }),
                                titleVisibility: .visible,
                                presenting: closeQuestion) { question in
                if question.offersKeep {
                    Button(ComposerCloseGuardCopy.keep) { answerCloseQuestion(.keep) }
                }
                Button(ComposerCloseGuardCopy.discard, role: .destructive) { answerCloseQuestion(.discard) }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            }
    }

    @ViewBuilder
    var anchoredSheetLayer: some View {
        if let portail = anchoredPortal {
            ZStack(alignment: .bottom) {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { closeAnchoredSheet() }
                    .accessibilityHidden(true)
                ComposerAnchoredSheet(title: portail.anchoredTitle,
                                      size: portail.anchoredSize,
                                      forcesDark: portail.anchoredForcesDark,
                                      onClose: { closeAnchoredSheet() }) {
                    // La feuille ancrée vit HORS du présentateur des portails :
                    // elle reçoit les mêmes fournisseurs, par la même fonction.
                    portalView(portail)
                        .composerPortalProviders()
                }
                .id(portail)
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    // MARK: - Fermer le brouillon

    /// ✕ du compositeur : un brouillon non vide demande d'abord.
    func requestComposerClose() {
        switch ComposerCloseGuard.decide(hasContent: composedAutosaveState().hasContent,
                                         surfaceIsAutosaved: autosaveState() != nil,
                                         controllerKeeps: autosave.keepsDraft) {
        case .closes:
            onDismiss()
        case .asks(let offersKeep):
            closeQuestion = ComposerCloseQuestion(offersKeep: offersKeep)
        }
    }

    func answerCloseQuestion(_ choice: ComposerCloseGuard.Choice) {
        closeQuestion = nil
        switch ComposerCloseGuard.effect(choice) {
        case .flushThenClose:
            flushAutosave()
        case .purgeThenClose:
            // Le brouillon part AVANT la fermeture : `onDisappear` sauvegarde, et
            // `discard` est ce qui l'en empêche.
            discardAutosavedDraft()
        }
        onDismiss()
    }

    // MARK: - Fond et durée, en feuilles

    /// **Le Fond** : la couleur s'applique en direct, la feuille reste ouverte
    /// jusqu'à OK — on compare en regardant la scène au-dessus.
    var composerBackgroundSheet: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                BackgroundColorPalette(colors: StoryBackgroundPalette.colors) { hex in
                    documentBackground = hex
                    viewModel.applyBackground(hex: hex)
                    HapticFeedback.light()
                }
                OpeningEffectChips(selection: sceneTransitions.opening,
                                   onDarkSurface: true,
                                   onSelect: { chooseSceneEffect(.opening($0)) })
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.lg)
        }
    }

    /// **La durée de la diapo**, une rangée de choix ; le choix s'applique tout
    /// de suite, OK referme.
    var composerDurationSheet: some View {
        let menu = ComposerMoreMenuPolicy.durationMenu(current: TimeInterval(viewModel.currentSlideDuration))
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(menu.choices, id: \.self) { secondes in
                    durationChip(secondes, selected: secondes == menu.selected)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
        }
    }

    private func durationChip(_ secondes: TimeInterval, selected: Bool) -> some View {
        Button {
            viewModel.currentSlideDuration = Float(secondes)
            HapticFeedback.light()
        } label: {
            Text(ComposerMoreMenuCopy.seconds(secondes))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundStyle(selected ? Color.black.opacity(0.85) : .white)
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(minWidth: 56, minHeight: 44)
                .background(Capsule().fill(selected ? MeeshyColors.brandPrimary : Color.white.opacity(0.1)))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// La question posée avant de fermer un brouillon non vide.
nonisolated struct ComposerCloseQuestion: Equatable, Sendable {
    let offersKeep: Bool
}

/// La feuille ancrée, montée comme un NŒUD (#8387) : son contenu sort du type
/// de la pile.
struct ComposerHostAnchoredSheetLayer: View {
    let host: MeeshyComposerHost
    var observation: ComposerHostObservation

    var body: some View {
        host.anchoredSheetLayer
            .animation(UIAccessibility.isReduceMotionEnabled ? nil : .spring(response: 0.32, dampingFraction: 0.88),
                       value: host.anchoredPortal)
    }
}
