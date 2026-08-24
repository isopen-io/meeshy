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
///
/// `feedComposer` n'y est plus routé depuis le lot 3, et il RESTE dans l'énum :
/// ce n'est pas un cas mort à balayer. `FeedComposerSheet` existe toujours et
/// le fil la monte encore ; surtout, la garde négative qui interdit à toute
/// porte d'y retomber (`ComposerIntentTests.test_aucunePorte_neRetombeSurLaFeuilleDuFil`)
/// doit pouvoir NOMMER son interdit. La supprimer rendrait cette garde
/// inécrivable, et le retour du routage passerait alors sans un mot — le mode
/// d'extinction silencieuse propre aux gardes négatives.
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
    /// Elle ignore la GRAINE — les identifiants qu'une porte transporte : deux
    /// reposts de deux posts DU MÊME FORMAT ouvrent le même composer. Elle ne
    /// les ignore pas tous : le FORMAT qu'une porte porte fait partie de son
    /// identité, et un repost de story n'ouvre pas ce qu'ouvre un repost de
    /// post. C'est la loi du miroir, et elle a précisé celle de C1 — qui
    /// disait « fonction de l'ORIGINE SEULE » et devenait fausse dès qu'une
    /// porte s'est mise à porter son format.
    ///
    /// Quatre lois la traversent, et `ComposerIntentTests` les éprouve une par
    /// une :
    ///
    /// - **les diapositives et la timeline suivent le FORMAT** — une story et un
    ///   post ont des pages, un réel est une prise continue, un mood une carte
    ///   unique sans scène donc sans timeline ;
    /// - **la capture est refusée à ce qui reprend un contenu DÉJÀ PUBLIÉ**
    ///   (repost, édition — la caméra n'a rien à y ajouter) **et au mood** (qui
    ///   n'a pas de média). Un brouillon, lui, n'est pas publié : son atelier
    ///   reste entier ;
    /// - **une porte qui FIXE son format annonce celui que son composer
    ///   historique produit** — annoncer autre chose promettrait une surface
    ///   qui n'existe pas ;
    /// - **une porte qui PORTE son format annonce le format porté**, et c'est
    ///   alors la CHAÎNE COMPLÈTE qui doit savoir le produire. Le maillon est
    ///   posé depuis que les appelants du repost envoient le type de leur carte
    ///   (`RepostTargeting`).
    ///
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
            // Rév. 6 (lot 3, 2026-08-24) : la porte la plus utilisée cesse de
            // router. Le motif de la rév. 4 — « le meuble n'a pas de surface
            // *document sans scène* » — est TOMBÉ au lot 2 :
            // `ComposerDocumentSurface` existe, `MeeshyComposerHost` la monte,
            // et `ComposerSurfaceRouting` fait atterrir `.keyboardOnContent` +
            // `.post` sur elle. Une porte ne reste pas sur sa feuille
            // historique par habitude : elle y reste tant qu'une raison la
            // retient, et celle-là n'existe plus.
            //
            // Ce que cette ligne change, EXACTEMENT : la table cesse de
            // désigner `FeedComposerSheet`. Elle ne recâble aucun écran, et il
            // ne faut pas la lire comme si elle l'avait fait. Aucun site de
            // production ne construit `ComposerIntent(origin: .feedComposer)` :
            // les trois montages de la feuille (`RootViewComponents` pour le
            // fil et la citation, `FeedView` pour la citation iPad) et le
            // composer INLINE de l'iPad (`FeedView.composerOverlay`, que
            // `LegacyComposer` ne nomme même pas) partent chacun de leur propre
            // booléen. Le jour où une porte lira cette table, elle trouvera le
            // meuble ; aujourd'hui, sur ce chemin, personne ne la lit.
            //
            // DETTE CONSIGNÉE, jamais acquis : la surface ainsi désignée tient
            // UNE des quatre capacités que la rév. 4 énumérait. Le clavier sur
            // `content` est tenu de bout en bout. Ne le sont pas — la rangée
            // photo·caméra·emoji·document·lieu·micro, qui ne se peint pas
            // (`servedDocumentTools` rend `[]`, le meuble n'ayant pas de chemin
            // d'ingestion, loi 4) ; l'envoi durable offline, dont la table
            // (`ComposerDocumentSendRouting`) n'a aucun appelant et qu'une
            // garde de source exige de n'en avoir aucun ; la bascule réel
            // `forcePlainPost`, absente du dossier `Composer/`. L'éventail des
            // formats, lui, ne descend pas non plus sous le document — le
            // paragraphe de `MeeshyComposerHost.documentSurface` dit le blocage
            // SDK qui l'y retient. Basculer les écrans du fil AVANT ces
            // capacités serait la régression sèche que la rév. 4 retenait ; ce
            // lot déplace la TABLE et laisse les portes de présentation en
            // place.
            //
            // Et cette dette n'est pas qu'écrite : elle est GARDÉE. Un site de
            // production qui construirait cette intention pendant que le
            // document n'a ni rangée servie, ni issue pour sa saisie, ni
            // publieur atteignable fait rougir
            // `MeeshyComposerHostGuardTests`
            // `.test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`.
            // Sans elle, la valeur `nil` posée ici aurait promis au lot suivant
            // une surface que le meuble ne sait pas encore tenir.
            return ComposerProfile(
                initialFormat: .post,
                offeredFormats: plusReel([.post, .story]),
                showsSlides: true,
                showsTimeline: true,
                opensWith: .keyboardOnContent,
                allowsCapture: true,
                routesToLegacy: nil
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
            // Rév. 3 (revue d'intégration I5) : `.post` est un état TRANSITOIRE
            // — la table reste une fonction de l'origine, elle n'ouvre pas le
            // document pour le deviner.
            //
            // Rév. 5 (revue adversariale du 2026-08-23) : la rév. 3 promettait
            // ici que « le host rebascule au format du document une fois
            // celui-ci chargé ». **Cet écrivain n'existe pas.** Rien ne
            // réaffecte `currentFormat` après la construction du host, et un
            // commentaire qui énonce un invariant que le code ne tient pas
            // devient la loi que lira la session suivante — celle qui aurait
            // monté `.draft` en confiance.
            //
            // Ce qui tient VRAIMENT la conséquence est ailleurs, et c'est
            // volontaire : `ComposerSurfaceRouting` fait de `.resume` une
            // SCÈNE quel que soit le format, parce que le seul mécanisme de
            // reprise du meuble (`adoptDraft`) repeuple l'atelier. Le `.post`
            // transitoire ne décide donc plus d'aucune surface, et reprendre un
            // brouillon ne peut plus ouvrir un éditeur de texte vide pendant
            // que le brouillon adopté attend derrière.
            //
            // La bascule au format du document reste À ÉCRIRE (V3+) ; elle est
            // consignée comme dette, plus promise comme acquise.
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

/// Ce que vise un repost : la RACINE, et le format de la CARTE.
///
/// Deux choses différentes, qu'il est naturel de confondre — la confusion a
/// été faite puis rattrapée en revue le 2026-08-23, et c'est pour qu'elle ne
/// se refasse pas que la règle vit ici plutôt que recopiée sur six sites.
///
/// - La RÉFÉRENCE remonte à la racine (`originalRepostOfId`), sans quoi le
///   repost d'un repost embarquerait une carte de partage vide.
/// - Le FORMAT reste celui de la carte sur laquelle l'utilisateur a agi. Il ne
///   suit PAS la racine : reposter depuis son fil le repost-de-story de
///   quelqu'un doit donner un post dans son fil, jamais une story de 20 h dans
///   son tray. L'utilisateur a agi sur une carte de fil ; il veut son fil.
nonisolated struct RepostTarget: Equatable {
    let postId: String
    /// Le vocabulaire du SDK (`PostType`), pas celui du composer : c'est ce que
    /// `PostService.repost(postId:targetType:…)` attend, et donc ce qui part
    /// sur le fil. `nil` laisse le repli du gateway décider (`?? POST`) — c'est
    /// le FILET, jamais l'intention.
    let targetType: PostType?
}

nonisolated enum RepostTargeting {
    /// - Parameters:
    ///   - cardId: la carte sur laquelle l'utilisateur a agi.
    ///   - cardType: son type tel que le fil l'a servi. `nil` laisse le repli
    ///     du gateway décider — c'est le filet, jamais l'intention.
    ///   - repostOfId: la publication que la carte repartage, s'il y en a une.
    ///   - originalRepostOfId: la racine de la chaîne, si le serveur l'a
    ///     hydratée. Elle prime, parce qu'une chaîne se replie sur sa racine.
    static func target(
        cardId: String,
        cardType: String?,
        repostOfId: String? = nil,
        originalRepostOfId: String? = nil
    ) -> RepostTarget {
        let reference = originalRepostOfId ?? repostOfId ?? cardId
        let brut = cardType?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        // Un type que le SDK ne connaît pas retombe sur `nil` plutôt que
        // d'inventer un format : le filet du gateway vaut mieux qu'une
        // supposition.
        return RepostTarget(postId: reference, targetType: PostType(rawValue: brut))
    }
}
