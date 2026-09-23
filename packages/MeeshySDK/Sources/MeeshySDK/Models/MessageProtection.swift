import Foundation

/// Le vocabulaire VISUEL des protections de message — **un pictogramme par
/// sens, et c'est celui du COMPOSEUR** (#7452).
///
/// L'utilisateur choisit la protection dans `EffectsPickerView` et dans la
/// barre du composeur ; c'est là qu'il apprend le mot et l'image. Les faire
/// diverger à la lecture oblige à réapprendre à chaque écran — dimension 6,
/// « même mot, même icône ».
///
/// Ce que ce type remplace, mesuré sur `dev` 3ff99d3aa3 : `flame` désignait la
/// VUE UNIQUE dans la liste de conversations (`LentilleConversationRow`,
/// `ThemedConversationRow`) et l'ÉPHÉMÈRE dans la bulle (`BubbleEphemeralBadge`)
/// — le même pictogramme pour deux sens opposés, et aucun des deux n'était
/// celui du choix (`hourglass`, `1.circle`).
public enum MessageProtectionSymbols {
    /// Éphémère — **la FLAMME** (directive porteur 2026-09-22 : « l'éphémère
    /// est la flamme avec la configuration de durée par défaut »).
    ///
    /// Le composeur se contredisait lui-même : sa BARRE montrait déjà
    /// `flame.fill`, sa FEUILLE des effets montrait `hourglass`, et un
    /// troisième glyphe — `timer.circle` — servait d'état inactif à la barre.
    /// Trois images pour un sens, dans l'écran même où l'utilisateur apprend
    /// le vocabulaire. #7452 avait suivi la feuille ; la directive tranche
    /// pour la flamme, et les trois sites se réconcilient ici.
    public static let ephemeral = "flame"
    /// Vue unique — le « 1 » cerclé
    /// (« vue unique c'est "1" cerclé plutôt », même directive).
    public static let viewOnce = "1.circle"
    /// Flou — **l'ŒIL** (« et l'œil représente le flou »). Barré, comme au
    /// composeur : c'est ce qui le distingue d'un œil de lecture.
    public static let blurred = "eye.slash"

    /// Variante pleine, pour un état ACTIF.
    public static let ephemeralFilled = "flame.fill"
    public static let viewOnceFilled = "1.circle.fill"
    public static let blurredFilled = "eye.slash.fill"

    /// **La table entière, pour les témoins.** Une garde qui énumère à la main
    /// resterait verte en oubliant une protection ; celle-ci se lit ici, et
    /// une quatrième protection devra s'y inscrire pour exister.
    public static let all: [String] = [ephemeral, viewOnce, blurred]
    public static let allFilled: [String] = [ephemeralFilled, viewOnceFilled, blurredFilled]
}

/// Ce qu'un message DÉSIGNE de sa protection, résolu une fois, hors de toute
/// vue — le modèle du chrome commun que les cinq modes de lecture consomment.
///
/// Les cinq modes (`focal`, `script`, `summary`, `river`, `bubbles`) rendent le
/// même message ; trois seulement portaient un décompte, et chacun relisait
/// `expiresAt` / `isViewOnce` / `isBlurred` à sa façon. Un descripteur partagé
/// ne rend pas les modes conformes — c'est la garde de source qui s'en charge —
/// mais il supprime la raison de leur divergence.
public struct MessageProtectionDescriptor: Equatable, Sendable {

    /// Une désignation à rendre. L'éphémère porte son état parce que son rendu
    /// en dépend (décompte vivant / durée en attente) ; les deux autres sont
    /// des faits stables.
    public enum Badge: Equatable, Sendable {
        case ephemeral(EphemeralDeadline.State)
        case viewOnce
        case blurred
    }

    public let badges: [Badge]
    /// L'état de l'horloge, même quand aucun badge n'en découle (expiré).
    public let ephemeralState: EphemeralDeadline.State

    public var isEmpty: Bool { badges.isEmpty }
    public var isExpired: Bool { ephemeralState == .expired }
    public var isViewOnce: Bool { badges.contains(.viewOnce) }

    /// Le CONTENU doit-il être voilé jusqu'à un geste du lecteur ?
    ///
    /// La vue unique compte, et c'est le correctif : jusqu'au 2026-09-22 le
    /// masquage ne lisait que `isBlurred`, si bien qu'un TEXTE à vue unique
    /// s'affichait en clair, sans même une mention — « Voir une fois »
    /// n'existait que sur les médias. Un message qu'on ne peut lire qu'une
    /// fois doit être un CHOIX : le voile est ce qui rend ce choix possible.
    public var requiresVeil: Bool {
        badges.contains(.viewOnce) || badges.contains(.blurred)
    }

    /// Aucune protection — le cas de l'écrasante majorité des messages.
    /// Nommé `unprotected` plutôt que `none` : `none` entrerait en collision de
    /// lecture avec `Optional.none` sur chaque site de comparaison.
    public static let unprotected = MessageProtectionDescriptor(
        badges: [], ephemeralState: .notEphemeral
    )

    public init(badges: [Badge], ephemeralState: EphemeralDeadline.State) {
        self.badges = badges
        self.ephemeralState = ephemeralState
    }

    /// Résout le chrome depuis les drapeaux du message et les deux sources
    /// d'échéance du contrat #7451.
    ///
    /// **Un éphémère EXPIRÉ ne porte aucun badge** : le message quitte l'écran,
    /// il n'a pas à s'annoncer une dernière fois. `isExpired` reste lisible
    /// pour l'hôte, qui est celui qui retire la ligne.
    ///
    /// L'ordre est stable — éphémère, vue unique, flou — pour que deux modes ne
    /// présentent pas les mêmes badges dans deux ordres.
    public static func resolve(
        flags: MessageEffectFlags,
        servedExpiresAt: Date?,
        ephemeralDuration: Int?,
        localReceivedAt: Date?,
        now: Date = Date()
    ) -> MessageProtectionDescriptor {
        // Un message peut porter une échéance sans porter le drapeau (charge
        // héritée d'avant `effectFlags`) : les deux entrées concourent.
        let declaresEphemeral = flags.contains(.ephemeral)
            || servedExpiresAt != nil
            || (ephemeralDuration ?? 0) > 0

        let ephemeralState: EphemeralDeadline.State = declaresEphemeral
            ? EphemeralDeadline.resolve(
                servedExpiresAt: servedExpiresAt,
                ephemeralDuration: ephemeralDuration,
                localReceivedAt: localReceivedAt,
                now: now
            )
            : .notEphemeral

        var badges: [Badge] = []
        switch ephemeralState {
        case .running, .imminent, .awaitingReception:
            // `.running` et `.imminent` portent tous deux un badge : c'est le
            // CHIFFRE qui distingue les deux, pas la présence de la flamme
            // (#7467). Un éphémère s'annonce dès sa réception.
            badges.append(.ephemeral(ephemeralState))
        case .notEphemeral, .expired:
            break
        }
        if flags.contains(.viewOnce) { badges.append(.viewOnce) }
        if flags.contains(.blurred) { badges.append(.blurred) }

        return MessageProtectionDescriptor(badges: badges, ephemeralState: ephemeralState)
    }
}
