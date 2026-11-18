import SwiftUI

/// Les formes d'une feuille ancrée (K15) : la feuille basse ordinaire, la forme `modal` haute
/// (voile, hôte flouté) et la forme `confirm` (médaillon, titre, valeur, deux actions, rôle de
/// dialogue d'alerte).
public nonisolated enum MeeshyAnchoredSheetForm: String, Sendable, Equatable, CaseIterable {
    case sheet
    case modal
    case confirm
}

/// **La loi des formes de K15** : ce que chaque forme décide de la hauteur, du voile, du toucher
/// hors de la feuille, du flou de l'hôte et de la poignée. Aucune vue, aucune couleur.
public nonisolated struct MeeshyAnchoredSheetFormLaw: Sendable, Equatable {
    /// Le flou de l'hôte derrière une feuille modale ou une confirmation.
    public static let hostBlurRadius: CGFloat = 8
    /// La part de la place que prend la forme modale.
    public static let modalFraction: CGFloat = 0.9

    public let height: MeeshyAnchoredSheetHeight
    public let maximumFraction: CGFloat
    public let scrim: Bool
    public let outside: MeeshyAnchoredSheetOutside
    public let hostBlur: CGFloat
    public let showsHandle: Bool
    public let isAlert: Bool

    public init(height: MeeshyAnchoredSheetHeight, maximumFraction: CGFloat, scrim: Bool,
                outside: MeeshyAnchoredSheetOutside, hostBlur: CGFloat, showsHandle: Bool, isAlert: Bool) {
        self.height = height
        self.maximumFraction = maximumFraction
        self.scrim = scrim
        self.outside = outside
        self.hostBlur = hostBlur
        self.showsHandle = showsHandle
        self.isAlert = isAlert
    }

    /// Sous « Réduire la transparence » ou « Réduire les animations », l'hôte ne se floute pas :
    /// le voile suffit à dire qu'il est en retrait.
    public static func resolve(_ form: MeeshyAnchoredSheetForm, reducesEffects: Bool = false) -> MeeshyAnchoredSheetFormLaw {
        let blur = reducesEffects ? 0 : hostBlurRadius
        switch form {
        case .sheet:
            return MeeshyAnchoredSheetFormLaw(height: .content, maximumFraction: MeeshyAnchoredSheetMetrics.maximumFraction,
                                              scrim: false, outside: .dismisses, hostBlur: 0, showsHandle: true,
                                              isAlert: false)
        case .modal:
            return MeeshyAnchoredSheetFormLaw(height: .fraction(modalFraction), maximumFraction: modalFraction,
                                              scrim: true, outside: .dismisses, hostBlur: blur, showsHandle: true,
                                              isAlert: false)
        case .confirm:
            return MeeshyAnchoredSheetFormLaw(height: .content, maximumFraction: MeeshyAnchoredSheetMetrics.maximumFraction,
                                              scrim: true, outside: .dismisses, hostBlur: blur, showsHandle: false,
                                              isAlert: true)
        }
    }
}

/// **Le corps de la forme `confirm`** (K15) : un médaillon (K45), un titre, une valeur en chasse
/// fixe, puis la paire d'actions du kit (K40). Le titre est l'en-tête que le lecteur d'écran lit
/// en premier ; la confirmation est une fenêtre modale.
public struct MeeshyAnchoredConfirm: View {
    private let systemImage: String
    private let title: String
    private let value: String?
    private let confirmTitle: String
    private let cancelTitle: String
    private let isDestructive: Bool
    private let tint: Color?
    private let onConfirm: () -> Void
    private let onCancel: () -> Void

    public init(systemImage: String,
                title: String,
                value: String? = nil,
                confirmTitle: String,
                cancelTitle: String,
                isDestructive: Bool = false,
                tint: Color? = nil,
                onConfirm: @escaping () -> Void,
                onCancel: @escaping () -> Void) {
        self.systemImage = systemImage
        self.title = title
        self.value = value
        self.confirmTitle = confirmTitle
        self.cancelTitle = cancelTitle
        self.isDestructive = isDestructive
        self.tint = tint
        self.onConfirm = onConfirm
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            MeeshyMedallion(systemImage: systemImage, kind: isDestructive ? .err : .accent, tint: tint, size: .s52)
                .accessibilityHidden(true)
            VStack(spacing: MeeshySpacing.xs) {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                if let value {
                    Text(verbatim: value)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            MeeshyButtonPair {
                MeeshyButton(confirmTitle, kind: isDestructive ? .danger : .primary, width: .fill, tint: tint,
                             isDestructive: isDestructive, action: onConfirm)
            } secondary: {
                MeeshyButton(cancelTitle, kind: .glass, width: .fill, action: onCancel)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.md)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}

/// Pose sur l'hôte le flou d'une forme modale, animé comme l'entrée de la feuille.
private struct MeeshyAnchoredSheetHostBlur: ViewModifier {
    let radius: CGFloat
    let isPresented: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        content
            .blur(radius: isPresented && !reduceMotion && !reduceTransparency ? radius : 0)
            .animation(MeeshyAnchoredSheetMetrics.motion(reduceMotion: reduceMotion).animation, value: isPresented)
    }
}

public extension View {
    /// Une feuille ancrée d'une FORME du kit : `modal` (haute, voile, hôte flouté) ou `confirm`
    /// (son corps est `MeeshyAnchoredConfirm`). La forme décide de la hauteur, du voile et de la
    /// poignée ; l'hôte garde le titre, la surface et le contenu.
    func meeshyAnchoredSheet<Sheet: View>(
        isPresented: Binding<Bool>,
        form: MeeshyAnchoredSheetForm,
        title: String? = nil,
        accessibilityLabel: String? = nil,
        surface: MeeshyAnchoredSheetSurface = .theme,
        maxWidth: CGFloat? = nil,
        reducesEffects: Bool = false,
        @ViewBuilder content: @escaping () -> Sheet
    ) -> some View {
        let law = MeeshyAnchoredSheetFormLaw.resolve(form, reducesEffects: reducesEffects)
        return modifier(MeeshyAnchoredSheetHostBlur(radius: law.hostBlur, isPresented: isPresented.wrappedValue))
            .meeshyAnchoredSheet(isPresented: isPresented, title: title, accessibilityLabel: accessibilityLabel,
                                 height: law.height, maximumFraction: law.maximumFraction, showsHandle: law.showsHandle,
                                 closeLabel: law.isAlert ? nil : MeeshyAnchoredSheetCopy.close, surface: surface,
                                 outside: law.outside, scrim: law.scrim, maxWidth: maxWidth, content: content)
    }
}
