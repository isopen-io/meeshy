import SwiftUI

// MARK: - La fiche d'un profil s'ouvre en plein écran (#19674)
//
// Directive porteur : la fiche d'un autre prend tout l'écran, et le retour ramène à l'écran d'où elle
// s'est ouverte. UN seul modificateur la présente, chez tous les appelants : `profileCover(item:)`. Il pose la fiche
// en `fullScreenCover` à fond transparent — l'écran d'origine reste dessous — et lui donne le retour d'iOS : le chevron
// ‹ de la tête, et le glissement depuis le bord gauche, PROGRESSIF et ANNULABLE (la fiche suit le doigt et découvre
// l'écran d'origine ; ramenée avant la fin, elle revient).

/// Comment la fiche est présentée : en plein écran, la tête dit « Retour » (‹) ; en feuille, « Fermer » (⌄).
public nonisolated enum ProfilePresentationStyle: Sendable, Equatable {
    case sheet
    case cover

    /// Le glyphe du bouton de tête.
    public var leadingSymbol: String {
        switch self {
        case .sheet: return "chevron.down"
        case .cover: return "chevron.backward"
        }
    }
}

private struct ProfilePresentationStyleKey: EnvironmentKey {
    static let defaultValue: ProfilePresentationStyle = .sheet
}

public extension EnvironmentValues {
    /// Posé par `profileCover` ; une fiche montée ailleurs (feuille, pile) reste en `.sheet`.
    var profilePresentationStyle: ProfilePresentationStyle {
        get { self[ProfilePresentationStyleKey.self] }
        set { self[ProfilePresentationStyleKey.self] = newValue }
    }
}

public extension View {
    /// La fiche d'un profil en plein écran, avec le retour d'iOS (chevron et glissement depuis le bord gauche).
    func profileCover<Item: Identifiable, Cover: View>(
        item: Binding<Item?>,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping (Item) -> Cover
    ) -> some View {
        fullScreenCover(item: item, onDismiss: onDismiss) { value in
            content(value).modifier(ProfileCoverChrome())
        }
    }

    /// Variante booléenne, pour l'appelant qui garde la personne ailleurs.
    func profileCover<Cover: View>(
        isPresented: Binding<Bool>,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Cover
    ) -> some View {
        fullScreenCover(isPresented: isPresented, onDismiss: onDismiss) {
            content().modifier(ProfileCoverChrome())
        }
    }
}

// MARK: - Le retour par glissement

/// La loi pure du glissement de retour : la fiche suit le doigt vers la droite, jamais vers la gauche ; le doigt levé
/// ne referme qu'au-delà des trois quarts de la largeur, ou sur une lancée qui l'emmènerait au bord. En deçà, le geste
/// n'a rien fait (directive des glissements progressifs et annulables).
public nonisolated enum ProfileCoverBackSwipe {
    /// La bande du bord gauche qui reçoit le doigt, comme le retour d'une pile ; elle s'arrête avant le bouton « Retour ».
    public static let edgeWidth: CGFloat = 16
    /// La part de la largeur au-delà de laquelle le doigt levé referme.
    public static let commitFraction: CGFloat = 0.75
    /// L'ombre portée par la fiche sur l'écran qu'elle découvre, au repos du geste.
    public static let shadowOpacity: Double = 0.18

    /// Le décalage rendu pour une course du doigt.
    public static func offset(translation: CGFloat) -> CGFloat {
        max(0, translation)
    }

    /// Le doigt levé referme-t-il la fiche ?
    public static func commits(translation: CGFloat, predictedEnd: CGFloat, width: CGFloat) -> Bool {
        guard width > 0, translation > 0 else { return false }
        return translation >= width * commitFraction || predictedEnd >= width
    }
}

/// Ce que `profileCover` ajoute à la fiche : le fond transparent de la présentation, le style « Retour », un fond
/// opaque sous la fiche, et le glissement depuis le bord gauche.
struct ProfileCoverChrome: ViewModifier {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    @ResolvedThemePalette private var theme
    @State private var drag: CGFloat = 0
    @State private var width: CGFloat = 0
    @State private var isLeaving = false

    func body(content: Content) -> some View {
        content
            .environment(\.profilePresentationStyle, .cover)
            .background(
                theme.backgroundPrimary
                    .shadow(color: .black.opacity(drag > 0 ? ProfileCoverBackSwipe.shadowOpacity : 0),
                            radius: MeeshySpacing.md, x: -MeeshySpacing.xs)
                    .ignoresSafeArea()
            )
            .offset(x: drag)
            .overlay(alignment: .leading) { edge }
            .background(
                GeometryReader { proxy in
                    Color.clear
                        .onAppear { width = proxy.size.width }
                        .adaptiveOnChange(of: proxy.size.width) { _, new in width = new }
                }
            )
            .modifier(ProfileCoverSeeThrough())
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)
    }

    /// La bande du bord : elle seule reçoit le doigt, le reste de la fiche garde ses défilements et ses faces.
    private var edge: some View {
        Color.clear
            .frame(width: ProfileCoverBackSwipe.edgeWidth)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(backSwipe)
            .accessibilityHidden(true)
    }

    private var backSwipe: some Gesture {
        DragGesture(minimumDistance: 8, coordinateSpace: .global)
            .onChanged { value in
                guard !isLeaving else { return }
                drag = ProfileCoverBackSwipe.offset(translation: value.translation.width)
            }
            .onEnded { value in
                guard !isLeaving else { return }
                let commits = ProfileCoverBackSwipe.commits(translation: value.translation.width,
                                                            predictedEnd: value.predictedEndTranslation.width,
                                                            width: width)
                if commits { leave() } else { settle() }
            }
    }

    /// Ramenée avant la fin : la fiche revient à sa place, rien n'est fermé.
    private func settle() {
        meeshyWithMotion(.morph, reduceMotion: reduceMotion) {
            drag = 0
        }
    }

    /// Le retour est décidé : la fiche finit sa course vers la droite, puis la présentation se retire sans rejouer sa
    /// descente — l'écran d'origine est déjà découvert. Sans fin d'animation lisible (iOS 16), elle se retire aussitôt.
    private func leave() {
        isLeaving = true
        HapticFeedback.light()
        guard #available(iOS 17, *) else { return dismissWithoutMotion() }
        withAnimation(MeeshyMotion.animation(.rise, reduce: reduceMotion), completionCriteria: .logicallyComplete) {
            drag = max(width, drag)
        } completion: {
            dismissWithoutMotion()
        }
    }

    private func dismissWithoutMotion() {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { dismiss() }
    }
}

/// Le fond de la présentation est transparent (iOS 16.4+) : l'écran d'origine se voit sous la fiche pendant le geste.
private struct ProfileCoverSeeThrough: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content.presentationBackground(.clear)
        } else {
            content
        }
    }
}
