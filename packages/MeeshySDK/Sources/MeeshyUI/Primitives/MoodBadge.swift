import SwiftUI

// MARK: - Pastille de mood (atome de présentation partagé)

/// L'emoji d'humeur posé au coin d'un avatar — **une** écriture, **une**
/// animation, **un** portillon d'accessibilité.
///
/// Elle vivait en propre dans `MeeshyAvatar.moodBadge` (glyphe, ressort
/// `repeatForever`, délai de départ aléatoire, garde anti-double-animation) et
/// une SECONDE fois, statique, dans `StoriesVivantsRail` (pastille « moi »).
/// Le rail devant maintenant animer le mood de CHAQUE auteur, la recopier une
/// troisième fois aurait figé trois écritures du même objet — promises à
/// diverger au premier réglage de ressort.
///
/// Atome agnostique au sens de `packages/MeeshySDK/CLAUDE.md` : trois
/// paramètres opaques (`emoji`, `diameter`, `animates`), aucun singleton nommé
/// Meeshy, aucune règle de « quand » un avatar mérite un mood. Le contexte
/// d'avatar (`AvatarContext.animatesMoodBadge`) et la peau Lentille décident
/// chacun de leur côté ; l'atome exécute.
///
/// **Reduce Motion — le trou que cette extraction ferme.** Le ressort
/// `repeatForever` de `MeeshyAvatar` ne consultait NI
/// `accessibilityReduceMotion`, NI l'override in-app
/// (`meeshyForceReduceMotion`) : une animation qui ne s'arrête jamais
/// d'elle-même, sur l'écran de la trail de stories, restait hors de portée du
/// réglage (WCAG 2.3.3, HIG). Le portillon vit désormais DANS l'atome —
/// aucun appelant ne peut l'oublier.
public struct MeeshyMoodBadge: View {

    public let emoji: String
    public let diameter: CGFloat
    /// Intention de l'appelant. Le réglage système (ou son override in-app)
    /// peut seulement la RETIRER, jamais l'ajouter — cf. `shouldAnimate`.
    public let animates: Bool
    /// Position GLOBALE du centre de la pastille, pour ancrer un popover de
    /// statut. `nil` ⇒ pastille décorative.
    public var onTap: ((CGPoint) -> Void)?

    // MARK: - Trame et loi du ressort
    //
    // Exposées pour que les tests mesurent la trame plutôt que de la
    // recopier — mêmes valeurs, trait pour trait, que le ressort historique
    // de `MeeshyAvatar.moodBadge`.

    public static let restingScale: CGFloat = 1.0
    public static let pulsedScale: CGFloat = 1.18
    public static let springResponse: Double = 0.5
    public static let springDamping: Double = 0.4
    /// Départ décalé au hasard : sans lui, N pastilles montées ensemble
    /// respirent à l'unisson — un battement de troupe, pas une foule.
    public static let maximumStartDelay: Double = 1.5
    /// Fenêtre de respiration après l'apparition (~4 cycles de ressort), puis
    /// la pastille SE POSE. Le ressort tournait sans fin : dans la bande de
    /// stories — premier enfant NON lazy du scroll de la liste de
    /// conversations — chaque mood continuait de respirer hors écran, pendant
    /// toute la lecture de la liste (audit chauffe 2026-08-26 ; précédent
    /// « hog device 2026-07-03 » cité plus bas). L'annonce respire, le repos
    /// se tait — même arbitrage que `SyncPillRotator.maxCycles` et le halo
    /// d'annonce de `NotificationBadge`.
    public static let breathingDuration: Double = 8
    /// Le glyphe est rendu à cette fraction du cadre ; le cadre porte la
    /// place visuelle complète et la zone de tap.
    public static let glyphRatio: CGFloat = 0.65

    /// Le portillon, exposé PUR pour être testable sans monter de vue.
    /// Reduce Motion (système OU override in-app) ÉTEINT l'animation — il ne
    /// la raccourcit pas : un ressort répété plus court ne s'arrête pas
    /// davantage.
    public nonisolated static func shouldAnimate(animates: Bool, reduceMotion: Bool) -> Bool {
        animates && !reduceMotion
    }

    public init(emoji: String, diameter: CGFloat, animates: Bool, onTap: ((CGPoint) -> Void)? = nil) {
        self.emoji = emoji
        self.diameter = diameter
        self.animates = animates
        self.onTap = onTap
    }

    @State private var scale: CGFloat = MeeshyMoodBadge.restingScale
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion

    public var body: some View {
        // Frame explicite sur le `GeometryReader` : sans elle il s'effondre à
        // 0×0 en contexte d'overlay et l'emoji disparaît.
        GeometryReader { geo in
            Text(emoji)
                .font(.system(size: diameter * Self.glyphRatio))
                .frame(width: diameter, height: diameter)
                .scaleEffect(scale)
                .contentShape(Circle())
                .onTapGesture {
                    HapticFeedback.light()
                    let frame = geo.frame(in: .global)
                    onTap?(CGPoint(x: frame.midX, y: frame.midY))
                }
                // `.task` et non `.onAppear` : une seule séquence par identité
                // de vue — respirer la fenêtre d'annonce, puis se poser. Un
                // `.onAppear` re-tiré par re-parenting relancerait un ressort
                // qu'aucun apaisement ne viendrait plus clore.
                .task {
                    startPulse()
                    try? await Task.sleep(for: .seconds(Self.maximumStartDelay + Self.breathingDuration))
                    guard !Task.isCancelled else { return }
                    settlePulse()
                }
                .onDisappear {
                    withTransaction(Transaction(animation: nil)) { scale = Self.restingScale }
                }
        }
        .frame(width: diameter, height: diameter)
    }

    /// `scale == restingScale` = aucun ressort en vol pour cette identité de
    /// vue. Un `.onAppear` peut re-tirer sans `.onDisappear` intermédiaire
    /// (ScrollView, re-parenting) ; relancer un `repeatForever` par-dessus un
    /// autre les fait COMBINER par le moteur — aucun des deux ne se termine
    /// jamais et chaque frame les évalue tous, pour toujours (hog device
    /// 2026-07-03 : `DefaultCombiningAnimation` à ~90 % du thread
    /// `ViewGraphDisplayLink`).
    private func startPulse() {
        let reduceMotion = MeeshyMotion.shouldReduce(
            system: systemReduceMotion,
            userForced: userForcedReduceMotion
        )
        guard Self.shouldAnimate(animates: animates, reduceMotion: reduceMotion) else { return }
        guard scale == Self.restingScale else { return }
        withAnimation(
            .spring(response: Self.springResponse, dampingFraction: Self.springDamping)
                .repeatForever(autoreverses: true)
                .delay(Double.random(in: 0...Self.maximumStartDelay))
        ) {
            scale = Self.pulsedScale
        }
    }

    /// Fin de la fenêtre d'annonce : le ressort répété est REMPLACÉ par une
    /// détente unique vers le repos — jamais un arrêt sec au milieu d'un
    /// cycle, jamais un `repeatForever` qui survivrait posé à 1.18.
    private func settlePulse() {
        guard scale != Self.restingScale else { return }
        withAnimation(.spring(response: Self.springResponse, dampingFraction: Self.springDamping)) {
            scale = Self.restingScale
        }
    }
}
