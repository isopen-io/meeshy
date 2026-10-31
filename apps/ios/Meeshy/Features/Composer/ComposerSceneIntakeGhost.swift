import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'espace réservé d'un élément qui entre dans la scène** (#13864, R5) —
/// miroir d'Android `IncomingMediaPlaceholderLayer`.
///
/// Posé sur la CARTE par `ComposerSceneSurface` : il la couvre quand le média
/// en fondera le fond, sinon il se centre là où le prochain objet se posera.
/// Une forme neutre (la vignette n'existe pas encore), son anneau, ce qu'il dit,
/// et ✕ dessous pour annuler. Un échec ne garde de lui qu'une ligne discrète au bas de
/// la carte, avec « Réessayer ».
struct ComposerSceneIntakeGhost: View {
    let intake: ComposerSceneIntake
    let onCancel: () -> Void
    let onRetry: () -> Void
    let onDismissFailure: () -> Void

    private static let ringSize: CGFloat = 44
    private static let ringStroke: CGFloat = 3
    private static let placeholderShare: CGFloat = 0.45

    var body: some View {
        GeometryReader { geo in
            if intake.isFailed {
                failureLine
                    .padding(MeeshySpacing.md)
                    .frame(width: geo.size.width, height: geo.size.height, alignment: .bottom)
            } else {
                placeholder
                    .frame(width: side(in: geo.size).width, height: side(in: geo.size).height)
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
            }
        }
        .onAppear { announce() }
        .adaptiveOnChange(of: intake.phase) { _, _ in announce() }
    }

    private func side(in size: CGSize) -> CGSize {
        guard !intake.foundsScene else { return size }
        let cote = min(size.width, size.height) * Self.placeholderShare
        return CGSize(width: cote, height: cote)
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: intake.foundsScene ? MeeshyRadius.xlPlus : MeeshyRadius.lg, style: .continuous)
            .fill(Color.white.opacity(0.08))
            .overlay {
                // Le ✕ sous l'anneau, jamais dans un coin : la colonne des outils
                // se pose sur le bord droit de la carte.
                VStack(spacing: MeeshySpacing.xs) {
                    progress
                    cancelButton
                }
            }
            .accessibilityElement(children: .contain)
    }

    private var progress: some View {
        VStack(spacing: MeeshySpacing.xs) {
            ring
            Text(ComposerSceneIntakeCopy.status(intake))
                .font(.footnote.weight(.semibold))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, MeeshySpacing.sm)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(ComposerSceneIntakeCopy.title(intake.kind)))
        .accessibilityValue(Text(ComposerSceneIntakeCopy.status(intake)))
        .accessibilityAddTraits(.updatesFrequently)
    }

    @ViewBuilder
    private var ring: some View {
        if intake.isWaiting {
            Image(systemName: "hourglass")
                .font(.title3.weight(.semibold))
                .foregroundColor(.white)
                .frame(width: Self.ringSize, height: Self.ringSize)
        } else if let part = intake.ringFraction {
            ZStack {
                Circle().stroke(Color.white.opacity(0.25), lineWidth: Self.ringStroke)
                Circle()
                    .trim(from: 0, to: part)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: Self.ringStroke, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: Self.ringSize, height: Self.ringSize)
            .animation(.easeOut(duration: 0.2), value: part)
        } else {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(.white)
                .frame(width: Self.ringSize, height: Self.ringSize)
        }
    }

    private var cancelButton: some View {
        Button(action: onCancel) {
            Image(systemName: "xmark")
                .font(.footnote.weight(.bold))
                .foregroundColor(.white)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .background(Circle().fill(Color.black.opacity(0.55)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerSceneIntakeCopy.cancel))
        .accessibilityIdentifier("composer.intake.cancel")
    }

    private var failureLine: some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "exclamationmark.circle")
                .accessibilityHidden(true)
            Text(ComposerSceneIntakeCopy.failed(intake.kind))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button(ComposerSceneIntakeCopy.retry, action: onRetry)
                .font(.footnote.weight(.bold))
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .accessibilityIdentifier("composer.intake.retry")
            Button(action: onDismissFailure) {
                Image(systemName: "xmark")
                    .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)))
        }
        .font(.footnote)
        .foregroundColor(.white)
        .buttonStyle(.plain)
        .padding(.leading, MeeshySpacing.md)
        .background(Capsule().fill(Color.black.opacity(0.6)))
        .accessibilityElement(children: .contain)
    }

    private func announce() {
        UIAccessibility.post(notification: .announcement, argument: ComposerSceneIntakeCopy.status(intake))
    }
}

/// **Le voile d'un ajout** (#13864, R5) : ce qu'il couvre ne prend plus le
/// doigt ni le curseur de VoiceOver, et s'estompe — sauf la scène, qui reste
/// lisible sous l'espace réservé (`dims: false`). Sans animation : la fin de
/// l'ajout libère tout dans la même image.
struct ComposerIntakeVeil: ViewModifier {
    let veiled: Bool
    var dims: Bool = true

    func body(content: Content) -> some View {
        content
            .opacity(veiled && dims ? 0.35 : 1)
            .allowsHitTesting(!veiled)
            .accessibilityHidden(veiled && dims)
    }
}

/// La carte de la scène pendant un ajout : voilée au doigt, l'espace réservé
/// posé par-dessus, à la taille du dessin, et seul touchable.
struct ComposerIntakeLayer: ViewModifier {
    let ghost: AnyView?
    let blocks: Bool
    let aspectRatio: CGFloat

    func body(content: Content) -> some View {
        content
            .modifier(ComposerIntakeVeil(veiled: blocks, dims: false))
            .overlay {
                if let ghost {
                    Color.clear
                        .aspectRatio(aspectRatio, contentMode: .fit)
                        .overlay { ghost }
                }
            }
    }
}
