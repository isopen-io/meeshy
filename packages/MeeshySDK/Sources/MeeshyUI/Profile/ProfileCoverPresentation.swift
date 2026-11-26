import SwiftUI

// MARK: - La fiche d'un profil s'ouvre en plein écran (#19674)
//
// Directive porteur : la fiche d'un autre prend tout l'écran, et le retour ramène à l'écran d'où elle
// s'est ouverte. Elle entre par le côté, comme un écran poussé (en fondu sous « Réduire les animations »). UN seul modificateur la présente, chez tous les appelants : `profileCover(item:)`. Il pose la fiche
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
        modifier(ProfileCoverItemHost(item: item, onDismiss: onDismiss, cover: content))
    }

    /// Variante booléenne, pour l'appelant qui garde la personne ailleurs.
    func profileCover<Cover: View>(
        isPresented: Binding<Bool>,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Cover
    ) -> some View {
        modifier(ProfileCoverFlagHost(isPresented: isPresented, onDismiss: onDismiss, cover: content))
    }
}

// MARK: - L'entrée latérale

/// La loi pure de l'entrée : la montée du plein écran d'iOS n'est pas jouée, la fiche entre par le bord de fin comme
/// un écran poussé ; sous « Réduire les animations », elle apparaît en fondu sur place. Tant que la largeur n'est pas
/// mesurée, elle reste invisible pour ne jamais montrer une image à sa place finale avant sa course.
public nonisolated enum ProfileCoverEntrance {
    public static func startOffset(width: CGFloat, reduceMotion: Bool) -> CGFloat {
        reduceMotion ? 0 : max(0, width)
    }

    public static func startOpacity(width: CGFloat, reduceMotion: Bool) -> Double {
        reduceMotion || width <= 0 ? 0 : 1
    }

    /// La transaction qui présente le plein écran sans sa montée.
    public static func presentationTransaction() -> Transaction {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        return transaction
    }
}

/// Recopie la personne demandée par l'appelant dans un état local, sous une transaction sans animation : le plein
/// écran se pose sans monter, et c'est la fiche qui joue son entrée. La fermeture revient à l'appelant.
private struct ProfileCoverItemHost<Item: Identifiable, Cover: View>: ViewModifier {
    @Binding var item: Item?
    let onDismiss: (() -> Void)?
    let cover: (Item) -> Cover
    @State private var shown: Item?

    func body(content: Content) -> some View {
        content
            .fullScreenCover(item: relay, onDismiss: onDismiss) { value in
                cover(value).modifier(ProfileCoverChrome())
            }
            .adaptiveOnChange(of: item?.id, initial: true) { _, _ in
                guard let item else { return shown = nil }
                withTransaction(ProfileCoverEntrance.presentationTransaction()) { shown = item }
            }
    }

    /// La personne montrée, et ses mises à jour quand l'appelant enrichit la même personne.
    private var relay: Binding<Item?> {
        Binding(get: {
            guard let shown else { return nil }
            return item?.id == shown.id ? item : shown
        }, set: { value in
            shown = value
            if value == nil { item = nil }
        })
    }
}

private struct ProfileCoverFlagHost<Cover: View>: ViewModifier {
    @Binding var isPresented: Bool
    let onDismiss: (() -> Void)?
    let cover: () -> Cover
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: relay, onDismiss: onDismiss) {
                cover().modifier(ProfileCoverChrome())
            }
            .adaptiveOnChange(of: isPresented, initial: true) { _, value in
                guard value else { return shown = false }
                withTransaction(ProfileCoverEntrance.presentationTransaction()) { shown = true }
            }
    }

    private var relay: Binding<Bool> {
        Binding(get: { shown }, set: { value in
            shown = value
            if !value { isPresented = false }
        })
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
    @State private var hasEntered = false

    func body(content: Content) -> some View {
        content
            .environment(\.profilePresentationStyle, .cover)
            .background(
                theme.backgroundPrimary
                    .shadow(color: .black.opacity(drag > 0 || !hasEntered ? ProfileCoverBackSwipe.shadowOpacity : 0),
                            radius: MeeshySpacing.md, x: -MeeshySpacing.xs)
                    .ignoresSafeArea()
            )
            .offset(x: hasEntered ? drag : ProfileCoverEntrance.startOffset(width: width, reduceMotion: reduceMotion))
            .opacity(hasEntered ? 1 : ProfileCoverEntrance.startOpacity(width: width, reduceMotion: reduceMotion))
            .overlay(alignment: .leading) { edge }
            .background(
                GeometryReader { proxy in
                    Color.clear
                        .onAppear { measure(proxy.size.width) }
                        .adaptiveOnChange(of: proxy.size.width) { _, new in measure(new) }
                }
            )
            .modifier(ProfileCoverSeeThrough())
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)
    }

    /// La largeur connue, la fiche entre : posée hors champ (ou transparente) à l'image d'avant, elle court à sa place
    /// à l'image suivante, pour que l'animation parte bien de son point de départ.
    private func measure(_ newWidth: CGFloat) {
        width = newWidth
        guard !hasEntered, newWidth > 0 else { return }
        Task { @MainActor in
            meeshyWithMotion(.rise, reduceMotion: reduceMotion) { hasEntered = true }
        }
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
