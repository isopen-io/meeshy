import Foundation

// MARK: - L'horloge des décorations, en COMPOSITION

/// **Le temps que voit une décoration animée pendant qu'on compose** (#4999,
/// directive porteur 2026-09-03 : « sur la scène les stickers doivent être
/// vivants tout comme les vidéos et audios »).
///
/// ## Pourquoi une horloge à part, et pas le playhead
///
/// En `.edit` il n'existe AUCUN playhead : `currentTime` ne bouge pas, parce
/// qu'aucun display-link de LECTURE ne l'avance — c'est le sens exact de la
/// note de `StoryCanvasUIView+Rendering` (« l'`.edit` n'a pas de display-link »),
/// qui parle du lien de lecture et non d'`editDisplayLink`, lequel existe et
/// tourne. Le composer montre la scène telle qu'elle est POSÉE, pas telle
/// qu'elle se DÉROULE, et il ne faut pas confondre les deux : faire avancer
/// `currentTime` en édition ferait disparaître tout objet dont la fenêtre
/// temporelle serait passée.
///
/// Une décoration animée n'a pourtant pas besoin du déroulé de la slide :
/// `StickerAnimation.pose(at:)` est une fonction pure du temps écoulé DEPUIS
/// SON APPARITION. Cette horloge fournit ce temps-là, et rien d'autre.
///
/// ## Ce qu'elle ne fait pas
///
/// Elle ne LIT aucune horloge : elle reçoit les instants qu'on lui donne,
/// exactement comme `StickerAnimation` reçoit le sien. C'est ce qui la rend
/// testable à la milliseconde, sans display-link ni attente.
///
/// ## Les deux propriétés qui décident du rendu
///
/// - **elle n'avance qu'entre deux ticks CONSÉCUTIFS.** Un trou — l'écran mis
///   au repos par `EditClockThrottle`, l'application passée en arrière-plan,
///   une feuille présentée par-dessus — ne s'accumule pas : la décoration
///   reprend où elle s'est arrêtée au lieu de sauter d'un quart d'heure de
///   phase. `maximumStep` est ce qui distingue un intervalle d'un trou, et
///   c'est une RÈGLE plutôt qu'un appel à ne pas oublier : rien n'a besoin de
///   prévenir l'horloge d'une pause pour qu'elle soit juste ;
/// - **chaque décoration a sa NAISSANCE.** `pose(at: 0)` étant l'identité,
///   une décoration qu'on vient de poser part de la pose exacte que l'auteur a
///   choisie — et un `.pop` ou un `.tada`, qui jouent en UN COUP, jouent au
///   moment de la POSE, jamais une seule fois à l'ouverture du composer.
/// `nonisolated` : la cible `MeeshyUI` isole par défaut sur l'acteur
/// principal, ce qu'une valeur pure du temps n'a aucune raison d'être. Sans ce
/// mot, l'horloge ne serait mesurable que depuis un test `@MainActor` — une
/// contrainte de plateforme sur un type qui ne connaît ni écran ni couche.
public nonisolated struct StoryStickerMotionClock: Equatable, Sendable {

    /// **Au-delà de ce délai, deux ticks ne bornent plus un intervalle : ils
    /// encadrent un TROU.** À 60 Hz un intervalle vaut 17 ms et à 120 Hz 8 ms ;
    /// 250 ms, c'est déjà quinze images perdues — plus une saccade, une reprise.
    public static let maximumStep: Double = 0.25

    /// Le temps CUMULÉ des intervalles réellement vus, en secondes. Jamais
    /// l'heure murale : deux compositions ouvertes à deux minutes d'écart
    /// montrent la même phase au même geste.
    public private(set) var elapsed: Double = 0

    /// **Des couches portent-elles une pose issue de cette horloge ?**
    ///
    /// La question n'est pas « l'horloge tourne-t-elle » mais « y a-t-il
    /// quelque chose à DÉFAIRE » — quand le mouvement réduit s'active en cours
    /// de composition, il faut rendre aux décorations la pose de l'auteur, et
    /// une seule fois. Sans ce témoin, la remise à plat se rejouerait à chaque
    /// tick, ou pire, ne se jouerait jamais et la décoration resterait figée de
    /// travers.
    public private(set) var isPosing: Bool = false

    private var lastTick: Double?
    private var births: [String: Double] = [:]

    public init() {}

    /// Avance jusqu'à `now`, en n'ajoutant que ce qui sépare deux ticks
    /// consécutifs. Un premier tick n'avance rien : il pose seulement l'origine.
    public mutating func advance(to now: Double) {
        defer { lastTick = now }
        guard let last = lastTick else { return }
        let step = now - last
        guard step > 0, step <= Self.maximumStep else { return }
        elapsed += step
    }

    /// Enregistre les décorations PRÉSENTES : celles qui arrivent naissent
    /// maintenant, celles qui sont parties s'oublient — sinon un identifiant
    /// réutilisé hériterait de la phase d'une décoration supprimée.
    public mutating func synchronize(ids: some Sequence<String>) {
        let presentes = Set(ids)
        for id in presentes where births[id] == nil { births[id] = elapsed }
        births = births.filter { presentes.contains($0.key) }
    }

    /// Le temps de CETTE décoration. `0` pour une décoration qu'on n'a jamais
    /// annoncée — donc la pose d'identité, jamais une phase arbitraire.
    public func time(forId id: String) -> Double {
        guard let birth = births[id] else { return 0 }
        return max(0, elapsed - birth)
    }

    /// Déclaré par l'appelant après avoir posé les couches, pour que
    /// `isPosing` dise le vrai.
    public mutating func markPosed() { isPosing = true }

    /// Déclaré après avoir rendu aux couches la pose de l'auteur.
    public mutating func markRested() { isPosing = false }
}
