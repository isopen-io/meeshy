import Foundation
import MeeshySDK

/// L'intention d'écrire, réduite à ce qui la détermine : sa PORTE.
///
/// « Le composer ne s'ouvre jamais nu : il s'ouvre déjà déterminé par son point
/// d'entrée » (planche `docs/superpowers/specs/2026-08-19-meeshy-composer-design.md`
/// §3). L'utilisateur ne choisit pas « je fais une story » dans un menu : il
/// tape sur le tray, et le composer sait.
///
/// Modèle PUR — aucune vue, aucun service, aucun état. C2 (le meuble) et C3
/// (les portes) le consomment comme une interface gelée.
///
/// Tout y est `nonisolated` : la cible app compile avec l'isolation MainActor
/// par défaut (Swift 6.2), qui rendrait jusqu'aux conformances `Equatable` de
/// ces valeurs inutilisables hors du main actor. Une intention ne s'exécute
/// pas — elle se lit, depuis n'importe où.
nonisolated struct ComposerIntent: Equatable {
    let origin: ComposerOrigin
}

/// Les neuf portes du composer. La GRAINE qu'une porte apporte n'a pas de champ
/// à elle : elle est matérialisée par les valeurs associées ci-dessous.
nonisolated enum ComposerOrigin: Equatable {
    case storyTray, feedComposer, reelTab, moodChip
    /// Deux portes PORTENT leur format au lieu de le deviner : l'appelant l'a
    /// déjà en main, puisqu'on tape « reposter » ou « modifier » sur une carte
    /// RENDUE. Ce format n'est pas une graine — il fait partie de l'identité de
    /// la porte, et deux reposts de formats différents ouvrent deux composers.
    case repost(ofPostId: String, sourceFormat: ComposerFormat)
    case edit(postId: String, documentFormat: ComposerFormat)
    case draft(id: String), share
    case conversationMedia(messageId: String, attachmentId: String)
}

/// Les quatre contenus que Meeshy publie. Le format reste CHANGEABLE après
/// l'ouverture — c'est un champ, pas une identité (loi 9 de la spec).
nonisolated enum ComposerFormat: Equatable { case story, post, reel, status }

/// Le composer n'invente pas son vocabulaire : ses quatre formats sont les
/// quatre `PostType` du SDK, ceux sous lesquels le serveur range ce qu'on lui
/// envoie. Les deux `switch` sont exhaustifs — un cinquième type de publication
/// casse la compilation ici, avant de pouvoir diverger en silence.
nonisolated extension ComposerFormat {
    init(_ postType: PostType) {
        switch postType {
        case .story: self = .story
        case .post: self = .post
        case .reel: self = .reel
        case .status: self = .status
        }
    }

    var postType: PostType {
        switch self {
        case .story: return .story
        case .post: return .post
        case .reel: return .reel
        case .status: return .status
        }
    }
}

/// L'état dans lequel la porte livre le composer — jamais un écran d'attente.
nonisolated enum ComposerOpening: Equatable { case cameraReady, keyboardOnContent, videoCameraReady, moodGrid, resume }

/// Les composers historiques que ce lot ROUTE sans les migrer (périmètre v1).
nonisolated enum LegacyComposer: Equatable { case statusComposer, repostComposer, storyEdit, feedComposer }

/// Ce que la porte décide, et rien de plus.
///
/// C'est un état INITIAL : les capacités visibles sont ensuite recalculées au
/// format COURANT à chaque bascule S↔P↔R (loi 9). Le host dérive son affichage
/// de `f(formatCourant, graine)`, jamais de ce profil figé.
nonisolated struct ComposerProfile: Equatable {
    let initialFormat: ComposerFormat
    /// Les formats ATTEIGNABLES depuis l'ouverture. Contient TOUJOURS
    /// `initialFormat` — on ne peut pas ouvrir sur un format qu'on n'offre pas.
    ///
    /// Contrainte de la loi 4 pour le consommateur : un format absent d'ici
    /// n'est pas grisé, il n'est **pas affiché**. Un éventail à une seule
    /// entrée ne montre donc aucun sélecteur.
    let offeredFormats: [ComposerFormat]
    let showsSlides: Bool
    let showsTimeline: Bool
    let opensWith: ComposerOpening
    let allowsCapture: Bool
    let routesToLegacy: LegacyComposer?
}

nonisolated extension ComposerProfile {
    /// La table. Des DONNÉES, pas un calcul : chaque porte est écrite en toutes
    /// lettres, et le `switch` exhaustif interdit d'en ajouter une sans profil.
    ///
    /// Elle est fonction de l'ORIGINE SEULE — jamais de ce que l'origine
    /// apporte : deux reposts de deux posts différents ouvrent le même
    /// composer. Trois lois la traversent, et la suite `ComposerIntentTests`
    /// les éprouve une par une :
    ///
    /// - **les diapositives et la timeline suivent le FORMAT** — une story et un
    ///   post ont des pages, un réel est une prise continue, un mood une carte
    ///   unique sans scène donc sans timeline ;
    /// - **la capture est refusée à ce qui reprend un contenu DÉJÀ PUBLIÉ**
    ///   (repost, édition — la caméra n'a rien à y ajouter) **et au mood** (qui
    ///   n'a pas de média). Un brouillon, lui, n'est pas publié : son atelier
    ///   reste entier ;
    /// - **ce qui route vers un composer historique annonce le format que ce
    ///   composer sait produire** — annoncer autre chose promettrait une surface
    ///   qui n'existe pas.
    /// - Parameter compositionQualifiesAsReel: `qualifiesAsReel` de la
    ///   composition COURANTE. Le gate AJOUTE le réel, il ne RETIRE jamais le
    ///   format propre d'une porte — sans quoi l'invariant « l'éventail
    ///   contient toujours le format initial » tomberait pour l'onglet réels,
    ///   dont la composition n'existe pas encore quand la caméra s'ouvre.
    static func profile(
        for origin: ComposerOrigin,
        compositionQualifiesAsReel: Bool = false
    ) -> ComposerProfile {
        func plusReel(_ base: [ComposerFormat]) -> [ComposerFormat] {
            compositionQualifiesAsReel ? base + [.reel] : base
        }

        switch origin {
        case .storyTray:
            return ComposerProfile(
                initialFormat: .story,
                offeredFormats: plusReel([.story, .post]),
                showsSlides: true,
                showsTimeline: true,
                opensWith: .cameraReady,
                allowsCapture: true,
                routesToLegacy: nil
            )

        case .feedComposer:
            // Rév. 4 (revue totale C4) : le meuble n'a pas de surface « document
            // sans scène » — clavier sur `content`, rangée
            // photo·caméra·emoji·document·lieu·micro, envoi durable offline,
            // bascule réel `forcePlainPost`. Recâbler la porte la plus utilisée
            // sans elle serait une régression sèche : la bascule est post-v1.
            return ComposerProfile(
                initialFormat: .post,
                offeredFormats: plusReel([.post, .story]),
                showsSlides: true,
                showsTimeline: true,
                opensWith: .keyboardOnContent,
                allowsCapture: true,
                routesToLegacy: .feedComposer
            )

        case .reelTab:
            // Profil DÉFINI, câblage HORS v1 : aucun point d'entrée réels
            // n'existe au dépôt — les Réels sont un overlay lancé depuis le fil,
            // sans bouton de création (revue Fable n°5).
            return ComposerProfile(
                initialFormat: .reel,
                offeredFormats: [.reel, .post],
                showsSlides: false,
                showsTimeline: true,
                opensWith: .videoCameraReady,
                allowsCapture: true,
                routesToLegacy: nil
            )

        case .moodChip:
            return ComposerProfile(
                initialFormat: .status,
                offeredFormats: [.status],
                showsSlides: false,
                showsTimeline: false,
                opensWith: .moodGrid,
                allowsCapture: false,
                routesToLegacy: .statusComposer
            )

        case .repost(_, let sourceFormat):
            // Le format d'un repost MIROITE celui de sa source. Changer de
            // format est le geste d'ANCRAGE — « garder la chose pour de bon » :
            // l'éphémère reste éphémère par défaut (story 20 h, statut 1 h), et
            // le post est la seule cible permanente, donc la seule option
            // ajoutée. Reposter un post ne le propose pas deux fois : il est
            // déjà son propre ancrage, et un éventail à une entrée n'affiche
            // aucun sélecteur (loi 4).
            return ComposerProfile(
                initialFormat: sourceFormat,
                offeredFormats: sourceFormat == .post ? [.post] : [sourceFormat, .post],
                showsSlides: true,
                showsTimeline: true,
                opensWith: .keyboardOnContent,
                allowsCapture: false,
                routesToLegacy: .repostComposer
            )

        case .edit(_, let documentFormat):
            // L'édition ne convertit qu'entre POST et RÉEL : `UpdatePostSchema`
            // type est un `z.enum(['POST','REEL'])`, le serveur refuse le reste.
            // Changer le format d'un contenu déjà publié est le rôle du REPOST,
            // pas de l'édition — éditer une story ou un statut n'offre donc
            // AUCUN choix.
            let offerts: [ComposerFormat]
            switch documentFormat {
            case .story, .status: offerts = [documentFormat]
            case .reel: offerts = [.reel, .post]
            case .post: offerts = plusReel([.post])
            }
            return ComposerProfile(
                initialFormat: documentFormat,
                offeredFormats: offerts,
                showsSlides: true,
                showsTimeline: true,
                opensWith: .resume,
                allowsCapture: false,
                routesToLegacy: .storyEdit
            )

        case .draft, .share:
            // Rév. 3 (revue d'intégration I5) : `.post` est un état TRANSITOIRE.
            // Le host rebascule au format du document une fois celui-ci chargé —
            // la table reste une fonction de l'origine, elle n'ouvre pas le
            // document pour le deviner.
            return ComposerProfile(
                initialFormat: .post,
                offeredFormats: plusReel([.post, .story]),
                showsSlides: true,
                showsTimeline: true,
                opensWith: .resume,
                allowsCapture: true,
                routesToLegacy: nil
            )

        case .conversationMedia:
            // e9/O13 : le média reçu est déjà posé par la porte, il ne reste que
            // le mot à écrire. Profil DÉFINI, câblage lot G.
            //
            // Le format d'ouverture est une STORY, pas un post (directive du
            // 2026-08-23, doctrine alignée en rév. 3). Le coût de l'erreur est
            // ASYMÉTRIQUE : ouvrir une story quand l'utilisateur voulait un post
            // se répare d'un tap dans l'éventail, tandis qu'un post publié ne se
            // dé-publie pas. Le défaut tombe donc du côté réversible, et le
            // geste courant sur un média reçu est bref.
            return ComposerProfile(
                initialFormat: .story,
                offeredFormats: plusReel([.story, .post]),
                showsSlides: true,
                showsTimeline: true,
                opensWith: .keyboardOnContent,
                allowsCapture: true,
                routesToLegacy: nil
            )
        }
    }
}
