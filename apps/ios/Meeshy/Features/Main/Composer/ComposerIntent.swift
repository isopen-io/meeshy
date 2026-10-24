import Foundation
import MeeshySDK

/// L'intention d'écrire, réduite à ce qui la détermine : sa PORTE.
///
/// « Le composer ne s'ouvre jamais nu : il s'ouvre déjà déterminé par son point
/// d'entrée » (planche `docs/superpowers/specs/2026-08-19-meeshy-composer-design.md`
/// §3). L'utilisateur ne choisit pas « je fais une story » dans un menu : il
/// tape sur le tray, et le composer sait.
///
/// Modèle PUR — aucune vue, aucun service, aucun état. Le meuble et les portes
/// le consomment comme une interface gelée.
///
/// Tout y est `nonisolated` : la cible app compile avec l'isolation MainActor
/// par défaut (Swift 6.2), qui rendrait jusqu'aux conformances `Equatable` de
/// ces valeurs inutilisables hors du main actor. Une intention ne s'exécute
/// pas — elle se lit, depuis n'importe où.
nonisolated struct ComposerIntent: Equatable {
    let origin: ComposerOrigin

    /// **Le format sur lequel l'auteur veut ATTERRIR**, quand un geste l'a déjà
    /// dit. `nil` — le cas de huit portes sur neuf — laisse la table décider.
    ///
    /// ## Ce n'est PAS une porte par format
    ///
    /// Le produit n'a pas de porte `.reelTab`, pour une
    /// raison qu'il faut lire au mot près : « une porte qui déclare son format
    /// d'avance, **là où la décision doit se prendre APRÈS**, quand l'auteur voit
    /// ce qu'il compose ». Elle vise une porte qui PRÉSUME — le `+` d'un onglet
    /// « réel » suppose que l'auteur veut un réel avant qu'il ait rien composé.
    ///
    /// Ici l'auteur a choisi EXPLICITEMENT, dans le menu : « Éditer et republier
    /// **en post** ». Lui rouvrir sur le format de la source lui demanderait de
    /// redire ce qu'il vient de dire. Et l'éventail reste peint : le choix est
    /// pré-rempli, jamais verrouillé — ce qui est exactement la loi 9, le format
    /// est un CHAMP.
    ///
    /// > La différence entre les deux cas n'est pas « avant / après » mais
    /// > **« deviné / dit »**. Une porte qui devine impose ; une porte qui
    /// > transporte un choix explicite obéit.
    ///
    /// Un format hors de l'éventail de la porte est IGNORÉ, jamais honoré : il
    /// ouvrirait sur une surface que l'éventail ne permet pas de quitter, donc
    /// sur un cul-de-sac. `openingFormat(compositionQualifiesAsReel:)` est le
    /// site unique de cette borne.
    let opening: ComposerFormat?

    init(origin: ComposerOrigin, opening: ComposerFormat? = nil) {
        self.origin = origin
        self.opening = opening
    }

    /// Le format que le meuble MONTE à l'ouverture — la table, sauf si un geste
    /// a nommé un format qu'elle offre.
    ///
    /// La borne est ici et nulle part ailleurs : un appelant qui la referait
    /// aurait le droit de l'oublier, et un `opening` non offert ouvrirait alors
    /// une surface sans sortie.
    func openingFormat(compositionQualifiesAsReel: Bool) -> ComposerFormat {
        let profil = ComposerProfile.profile(
            for: origin,
            compositionQualifiesAsReel: compositionQualifiesAsReel
        )
        guard let opening, profil.offeredFormats.contains(opening) else {
            return profil.initialFormat
        }
        return opening
    }
}

/// Les huit portes du composer. La GRAINE qu'une porte apporte n'a pas de champ
/// à elle : elle est matérialisée par les valeurs associées ci-dessous.
///
/// ## Il n'y a PAS de porte par FORMAT
///
/// > « On choisit de faire un réel à partir du Feed principal ou à partir du
/// > **+** de story. On choisit **dans le composer** si on fait un post, une
/// > story ou un réel / mood. »
///
/// Il n'y a donc pas de porte `.reelTab` : elle nommerait une entrée que le
/// produit ne veut pas — une porte qui déclare son format d'avance, là où la
/// décision doit se prendre APRÈS, quand l'auteur voit ce qu'il compose.
///
/// C'est la loi 9 tenue à la lettre — **le format est un CHAMP, pas une
/// identité**. Une porte par format ferait de chaque format une identité qu'on
/// choisit avant d'avoir composé.
///
/// Le réel reste atteignable : `plusReel` l'ajoute à
/// l'éventail de `.storyTray` et de `.feedComposer` dès que la composition
/// qualifie. **La capacité existe ; c'est l'entrée dédiée dont le produit ne
/// veut pas.**
nonisolated enum ComposerOrigin: Equatable {
    case storyTray, feedComposer, moodChip
    /// Deux portes PORTENT leur format au lieu de le deviner : l'appelant l'a
    /// déjà en main, puisqu'on tape « reposter » ou « modifier » sur une carte
    /// RENDUE. Ce format n'est pas une graine — il fait partie de l'identité de
    /// la porte, et deux reposts de formats différents ouvrent deux composers.
    case repost(ofPostId: String, sourceFormat: ComposerFormat)
    case edit(postId: String, documentFormat: ComposerFormat)
    case draft(id: String), share
    /// `attachmentId` est OPTIONNEL : la même origine sert un message TEXTE, qui
    /// n'a aucune pièce jointe. Aucun lecteur
    /// n'en est affecté — les `switch` du dépôt matchent `case .conversationMedia:`
    /// sans jamais lier l'identifiant, qui voyage comme contexte et non comme
    /// donnée de décision.
    case conversationMedia(messageId: String, attachmentId: String?)
    /// **Le média d'un POST ou la slide d'une STORY** : on peut composer les pièces
    /// jointes d'une conversation, d'un poste ou d'une story.
    ///
    /// Une porte DISTINCTE de `.conversationMedia`, et pas un réemploi : le
    /// contexte qui voyage n'est pas le même — un post n'a pas de `messageId`,
    /// et une origine qui MENT sur ce qu'elle transporte est ce que le
    /// doc-comment de `repostedPostId` interdit quelques lignes plus bas. Le
    /// PROFIL, lui, est le même que celui du média reçu : la question produite
    /// est identique (« que fait-on d'un média qu'on vient de voir ? »), et
    /// c'est la table — pas la porte — qui la tranche.
    ///
    /// `mediaId` est optionnel, comme `attachmentId` ci-dessus : une story ou un
    /// post sans média sème sa seule description.
    case socialMedia(postId: String, mediaId: String?)
}

nonisolated extension ComposerFormat {

    /// **Le format d'une publication RENDUE**, pour rouvrir un composer dessus.
    ///
    /// `FeedPost.type` est une CHAÎNE du fil ; `ComposerFormat` est une somme
    /// fermée. La traduction vit ici, une fois, plutôt qu'au site qui ouvre la
    /// porte : citer un post, le reposter et le modifier posent la même
    /// question, et trois `switch` recopiés auraient divergé sur la valeur
    /// inconnue — celle qu'un serveur plus récent peut servir.
    ///
    /// **Le défaut est `.post`, et il est le seul sûr.** Un type inconnu
    /// traité en `.story` ouvrirait un atelier de scène sur un contenu qui
    /// n'en est pas un ; en `.post`, il ouvre le composer le plus général, qui
    /// sait tout porter. Se tromper vers le plus capable coûte un format
    /// inattendu ; se tromper vers le plus étroit coûte une composition
    /// impossible.
    init(postType: String?) {
        switch (postType ?? "").uppercased() {
        case "STORY": self = .story
        case "REEL": self = .reel
        case "STATUS": self = .status
        default: self = .post
        }
    }
}

nonisolated extension ComposerOrigin {
    /// **La publication que cette porte REPARTAGE**, quand elle en repartage
    /// une — sinon `nil`.
    ///
    /// C'est la lecture de la graine, et elle vit ici plutôt qu'au site de
    /// montage pour la raison que le commentaire de `ComposerOrigin` donne
    /// déjà : la graine n'a pas de champ à elle, elle est matérialisée par les
    /// valeurs associées. Un site qui recopierait l'identifiant dans un
    /// paramètre séparé en ferait une SECONDE source — deux « quel post
    /// republie-t-on » à faire diverger, alors que la porte le sait.
    ///
    /// Le `switch` est exhaustif : une dixième porte casse la compilation ici
    /// avant de pouvoir répondre `nil` par omission.
    var repostedPostId: String? {
        switch self {
        case .repost(let postId, _):
            return postId
        case .storyTray, .feedComposer, .moodChip, .edit, .draft, .share, .conversationMedia, .socialMedia:
            return nil
        }
    }

    /// **Le brouillon que cette porte REPREND**, quand elle en reprend un —
    /// sinon `nil`. Jumeau exact de `repostedPostId` ci-dessus, et pour la
    /// raison que son doc-comment donne déjà.
    ///
    /// ## Le piège que ce lecteur désarme
    ///
    /// `.draft(id:)` transporte un identifiant que le seul chemin d'adoption du
    /// meuble ne lit pas : l'adoption passe par un PARAMÈTRE séparé,
    /// `MeeshyComposerHost(draftId:)` — la « seconde source » que le
    /// doc-comment de `repostedPostId` existe pour interdire. Ce lecteur est le
    /// repli de ce paramètre.
    ///
    /// > Une porte non construite est une route morte ; une porte dont la
    /// > GRAINE n'a aucun lecteur est pire — elle compile, elle route, et elle
    /// > perd ce qu'on lui confie : le brouillon repris resterait intact à côté
    /// > d'un composer vierge.
    ///
    /// Le `switch` est exhaustif : une dixième porte casse la compilation ici
    /// avant de pouvoir répondre `nil` par omission.
    var resumedDraftId: String? {
        switch self {
        case .draft(let id):
            return id
        case .storyTray, .feedComposer, .moodChip, .edit, .repost, .share, .conversationMedia, .socialMedia:
            return nil
        }
    }
}

/// Les quatre contenus que Meeshy publie. Le format reste CHANGEABLE après
/// l'ouverture — c'est un champ, pas une identité (loi 9 de la spec).
nonisolated enum ComposerFormat: Equatable { case story, post, reel, status }

nonisolated extension ComposerFormat {
    /// **L'ordre du menu de bascule, écrit UNE fois.**
    ///
    /// Post d'abord : c'est la porte d'entrée du composer, celle depuis
    /// laquelle on bascule vers les trois autres. Ensuite la durée décroît —
    /// Story et Réel vivent une journée, le Mood une heure.
    ///
    /// Cet ordre ne dépend PAS de ce qui est disponible : un format qui devient
    /// choisissable parce qu'on vient d'ajouter une vidéo ne doit pas sauter de
    /// place sous le doigt.
    static let allComposable: [ComposerFormat] = [.post, .story, .reel, .status]
}

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
///
/// **C'est une CLÉ DE ROUTAGE, et rien d'autre.** Elle n'a que deux lecteurs de
/// production dans tout le dépôt — `ComposerSurfaceRouting.surface` et
/// `.focusesContentOnAppear` (plus `ComposerFormatFanPlacement`, qui la reçoit
/// en paramètre). `.cameraReady` n'ouvre AUCUNE caméra : c'est
/// `profile.allowsCapture` qui gate la capture. Un cas ajouté ici ne fait donc
/// rien de lui-même ; il choisit une surface et décide d'un foyer.
///
/// `.mediaSeeded` (lot 5) dit que la porte a DÉJÀ posé son média sur le canvas :
/// ni capture à ouvrir, ni champ à mettre au foyer, et **tous** les formats
/// atterrissent sur la scène — sans quoi choisir « Post » monterait un document
/// qui ne porte aucun média, et la photo semée disparaîtrait de l'écran comme de
/// la publication.
/// `CaseIterable` n'est pas décoratif : c'est ce qui permet à la garde de
/// corpus (`ComposerDocumentSurfaceTests`) de confronter son tableau à
/// l'ÉNUMÉRATION COMPLÈTE. Sans elle, la garde ne pouvait qu'écrire un compte en
/// dur — donc ne rougir que si on modifiait le tableau, jamais si on ajoutait un
/// cas.
nonisolated enum ComposerOpening: Equatable, CaseIterable {
    case cameraReady, keyboardOnContent, videoCameraReady, moodGrid, resume
    case mediaSeeded
}

/// Les composers historiques que la table ROUTE sans les migrer.
///
/// **Des cas qui ne sont plus routés RESTENT dans l'énum.** Ce ne sont pas des
/// cas morts à balayer.
///
/// - `feedComposer` : `FeedComposerSheet` existe toujours et le fil la monte
///   encore ;
/// - `statusComposer` : plus aucune porte ne le désigne et plus aucune feuille
///   ne le monte — le cas, lui, reste.
///
/// Surtout : les deux gardes négatives qui interdisent à toute porte d'y
/// retomber (`ComposerIntentTests.test_aucunePorte_neRetombeSurLaFeuilleDuFil`
/// et `.test_aucunePorte_neRetombeSurLeComposerDeMood`) doivent pouvoir NOMMER
/// leur interdit. Supprimer l'un de ces cas rendrait sa garde inécrivable, et le
/// retour du routage passerait alors sans un mot — le mode d'extinction
/// silencieuse propre aux gardes négatives.
///
/// **`editPostSheet` désigne l'édition d'un POST ou d'un RÉEL.** `.storyEdit`
/// désigne `storyEditComposerCover` (`StoryTrayView`, quatre montages), qui
/// monte `StoryComposerView` sur une `StoryEditSession` : c'est l'atelier d'une
/// STORY. Éditer un POST ou un RÉEL — ce que font les CINQ montages
/// d'`EditPostSheet` (`PostDetailView`, `ProfileUserPostsList`,
/// `ReelsPlayerView`, `RootViewComponents`, `FeedView`) — a sa propre
/// représentation : une valeur manquante se voit ; une valeur voisine qui tient
/// la place a l'air d'avoir été décidée, et c'est le pire des deux.
///
/// **Ce que ce cas n'est PAS.** Aucun site de production ne construit
/// `ComposerIntent(origin: .edit(...))` : les deux feuilles sont montées
/// directement, hors du routeur. Le cas est STRUCTUREL, et se juge en fonction
/// pure.
///
/// La doctrine du « cas qui reste déclaré » vaut pour CINQ valeurs, et
/// l'inventaire de parité qui gouverne le retrait d'`EditPostSheet.swift` vit
/// dans `EditParityInventoryTests` — pas ici. Ce fichier ROUTE ; il ne décide
/// pas d'un retrait.
///
/// **`feedInlineComposer` NOMME l'overlay inline iPad**
/// (`FeedView.composerOverlay`) que rien ne surveillerait — `.feedComposer` ne
/// le désigne pas, il part de son propre booléen. Le nommer le rend gardable
/// (`FeedInlineComposerGuardTests`) SANS le migrer : l'overlay reste NOMMÉ et
/// GARDÉ — strictement mieux qu'un composer que rien ne mesure.
nonisolated enum LegacyComposer: Equatable {
    case statusComposer, repostComposer, storyEdit, editPostSheet, feedComposer, feedInlineComposer
}

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
    /// post. C'est la loi du miroir : la table est fonction de l'ORIGINE, graine
    /// exceptée, et le format porté en est un morceau.
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
    ///   posé : les appelants du repost envoient le type de leur carte
    ///   (`RepostTargeting`).
    ///
    /// - Parameter compositionQualifiesAsReel: `qualifiesAsReel` de la
    ///   composition COURANTE. Le gate AJOUTE le réel, il ne RETIRE jamais le
    ///   format propre d'une porte — sans quoi l'invariant « l'éventail
    ///   contient toujours le format initial » tomberait pour l'onglet réels,
    ///   dont la composition n'existe pas encore quand la caméra s'ouvre.
    ///
    /// - Parameter compositionQualifiesAsMood: `qualifiesAsMood` de la
    ///   composition COURANTE. Jumeau du précédent, et EXCLUSIF de lui
    ///   par le prédicat : le réel exige un média, le mood exige qu'il n'y en
    ///   ait aucun. Il n'ouvre le quatrième format que sur le FIL — une porte
    ///   qui gagnerait le mood sans l'avoir demandé publierait un format que sa
    ///   chaîne ne sait pas produire.
    static func profile(
        for origin: ComposerOrigin,
        compositionQualifiesAsReel: Bool = false,
        compositionQualifiesAsMood: Bool = false
    ) -> ComposerProfile {
        func plusReel(_ base: [ComposerFormat]) -> [ComposerFormat] {
            compositionQualifiesAsReel ? base + [.reel] : base
        }

        /// N'est appliqué qu'au fil (`.feedComposer`) — voir le paramètre.
        func plusMood(_ base: [ComposerFormat]) -> [ComposerFormat] {
            compositionQualifiesAsMood ? base + [.status] : base
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
            // La porte la plus utilisée route vers le meuble : la table ne désigne pas
            // `FeedComposerSheet`. Le meuble a une surface document —
            // `ComposerDocumentSurface`, que `MeeshyComposerHost` monte, et sur laquelle
            // `ComposerSurfaceRouting` fait atterrir `.keyboardOnContent` + `.post`. Une
            // porte ne reste pas sur sa feuille historique par habitude : elle y reste
            // tant qu'une raison la retient.
            //
            // Le PLEIN composer du fil LIT cette table : `RootViewComponents` construit
            // `ComposerIntent(origin: .feedComposer)` (via `DocumentComposerDoor`) et
            // atterrit sur le meuble. Restent HORS table, chacun sur son propre booléen :
            // les deux CITATIONS de la feuille (`RootViewComponents` et `FeedView`,
            // retenues tant que le repost n'a pas d'écrivain durable) et le composer
            // INLINE de l'iPad (`FeedView.composerOverlay`, nommé
            // `LegacyComposer.feedInlineComposer` ; il reste nommé et gardé).
            //
            // Les capacités du document sont tenues : la rangée
            // photo·caméra·emoji·document·lieu·micro se peint en entier (fichiers, bascule
            // réel `forcePlainPost`, lieu, micro ; la langue est déclarée), et l'ENVOI
            // DURABLE existe : `DocumentComposerDoor` monte le meuble,
            // `ComposerDocumentSendPlan` interroge la table, et l'envoi part par la
            // branche texte de `FeedViewModel.createPost`. C'est cette triple couverture
            // qui permet au fil de lire la table.
            //
            // La garde de source `MeeshyComposerHostGuardTests`
            // `.test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`
            // exige un appelant UNIQUE (le fil) et ARME les trois assertions qu'elle
            // porte.
            //
            // **Le quatrième format est dans l'éventail du fil.** Le mood ne serait
            // atteignable que par sa porte (`.moodChip`) : écrire deux lignes ici puis
            // vouloir en faire un mood obligerait à fermer, revenir et retaper — la loi 9
            // tomberait sur le seul format qu'aucune bascule n'atteindrait. `plusMood` et
            // `plusReel` ne se cumulent jamais (l'un exige un média, l'autre l'interdit) ;
            // la composition est jugée par `ComposerMoodGate`, que le meuble nourrit comme
            // il nourrit déjà le gate du réel.
            return ComposerProfile(
                initialFormat: .post,
                offeredFormats: plusMood(plusReel([.post, .story])),
                showsSlides: true,
                showsTimeline: true,
                opensWith: .keyboardOnContent,
                allowsCapture: true,
                routesToLegacy: nil
            )

        case .moodChip:
            // La porte du mood ne route pas : la table ne désigne pas
            // `StatusComposerView`. Les trois conditions qu'on exige d'une porte-document
            // avant de la recâbler — une surface, une issue pour sa saisie, un publieur
            // atteignable — sont TOUTES tenues pour le mood, et par des choses qui
            // existent, pas par des promesses :
            //
            // - la SURFACE est `ComposerMoodSurface`, et `ComposerSurfaceRouting` fait
            //   atterrir `.moodGrid` + `.status` dessus ;
            // - l'ISSUE est `onClose`, que le meuble lui remet ;
            // - le PUBLIEUR est le socle : `ComposerChromeOwnership.owner(for:
            //   .mood)` rend `.host`, sa flèche est un vrai bouton gaté sur
            //   `ComposerMoodPolicy.canPublish`, et son brouillon part par
            //   `MeeshyComposerHost.onPublishDocument`.
            //
            // Les feuilles qui montaient le composer de mood montent `MoodComposerDoor`.
            // Le mood n'a pas de pièce jointe, donc pas de rangée d'outils, donc rien qui
            // le retienne.
            //
            // Le cas `.statusComposer` de la table reste : c'est l'interdit que les deux
            // gardes négatives doivent pouvoir NOMMER.
            return ComposerProfile(
                initialFormat: .status,
                offeredFormats: [.status],
                showsSlides: false,
                showsTimeline: false,
                opensWith: .moodGrid,
                allowsCapture: false,
                routesToLegacy: nil
            )

        case .repost(_, let sourceFormat):
            // Le format d'un repost MIROITE celui de sa source. Changer de
            // format est le geste d'ANCRAGE — « garder la chose pour de bon » :
            // l'éphémère reste éphémère par défaut (story 20 h, statut 1 h), et
            // le post est la seule cible permanente, donc la seule option
            // ajoutée. Reposter un post ne le propose pas deux fois : il est
            // déjà son propre ancrage, et un éventail à une entrée n'affiche
            // aucun sélecteur (loi 4).
            //
            // Le routage de cette porte est fonction du FORMAT PORTÉ, ce que la
            // doctrine de la table autorise en toutes lettres plus haut — « le
            // FORMAT qu'une porte porte fait partie de son identité ». Faire passer
            // `.repost` à `nil` en bloc dirait que le meuble sert AUSSI les reposts
            // de post et de réel, ce qui est faux. Le mood et la story vont au
            // meuble, chacun pour une raison qui existe :
            //
            // - le mood n'a besoin ni d'une graine `StoryItem`, ni d'un canal de
            //   scène : sa graine est un emoji et une phrase, son envoi est celui du
            //   mood (`StatusViewModel.setStatus`, qui prend déjà `repostOfId`), et
            //   son audience est celle que sa propre surface choisit ;
            // - la story reçoit de `ComposerHydration` sa graine `StoryItem` ET le
            //   plafond d'audience de la loi 10 (les deux ensemble, pour qu'on ne
            //   puisse pas passer l'une sans l'autre) ; son canal de scène,
            //   `onPublishAllInBackground`, est une fermeture fournie par la porte,
            //   qui CAPTURE l'identifiant de la source : une signature qui ne nomme
            //   pas une valeur ne l'empêche pas de voyager.
            //
            // Le meuble donne en plus à la story l'ANCRAGE en post, déclaré par
            // `offeredFormats` : l'atelier nu n'a pas de plateau, donc pas
            // d'éventail.
            // L'ANCRAGE en post, offert par `offeredFormats` ci-dessous, atteint un
            // ÉCRAN. Le plateau — donc l'éventail — est monté par le `body` du
            // meuble sous `ComposerFormatFanPlacement`, une règle PURE : il se
            // peint là où tous les formats offerts atterrissent sur une surface
            // qui partage l'état du meuble. Cette porte offre `[.status, .post]`,
            // deux surfaces sans atelier ; `.feedComposer` offre `.story`, que
            // le routage envoie à la scène, et reste donc hors de l'éventail.
            //
            // Le PUBLIEUR vient en PREMIER : descendre l'éventail sans lui
            // armerait une flèche qui, pressée, ne ferait rien — « le pire des
            // deux mondes, puisqu'il aurait l'air de marcher ». L'ordre est donc :
            // `StatusViewModel.anchorStatusAsPost`, puis `repostOfId` sur le
            // brouillon du document, puis l'éventail, puis l'aiguillage de
            // `MoodComposerDoor.publish`.
            //
            // CE QUI RESTE OUVERT — et qui ne retient PAS l'éventail : le
            // plafond d'ÉLARGISSEMENT de la loi 10. Plafonner exige la
            // visibilité de l'ORIGINAL ; `ComposerIntent.repost` ne porte qu'un
            // identifiant, et le canal supposé de la graine
            // (`ComposerMoodSeed.visibility`) est mort UNE COUCHE plus bas que
            // là où on le cherche : `StatusEntry` porte bien un `visibility`,
            // mais `APIPost.toStatusEntry()` ne le lui passe pas — il vaut `nil`
            // pour TOUTE humeur que l'app affiche. Semer `visibility:` dans les
            // deux graines ne donnerait donc que
            // `StoryRepostAudience.allowed(fromRawValue: nil)`, c'est-à-dire
            // `[.private]` : un sélecteur à UN chip, la loi 4 défaite dans
            // l'autre sens.
            //
            // POURQUOI CE TROU NE RETIENT RIEN. Ce qui peut être fermé sans
            // connaître la source l'est : `ComposerAudienceOffer` retire d'une
            // republication les deux audiences dont la PORTÉE appartient à la
            // source (`ONLY`/`EXCEPT`, dont le serveur écrase la liste), et le
            // socle comme le ruban lisent cette offre. L'ÉLARGISSEMENT, seul
            // reliquat, pèse EXACTEMENT autant sur le ruban du mood — peint sur
            // un écran RÉEL — que sur le chip d'audience de l'ancrage. L'ancrage
            // hérite donc d'un trou déjà nommé et déjà gardé ; il n'en ajoute
            // aucun. Retenir l'éventail pour ce motif sacrifierait le contrôle
            // PRÉSENT à un plafond raisonné pour un contrôle FUTUR.
            //
            // Ce que l'ancrage apporte en revanche, et que le miroir n'a pas :
            // un refus qui SE DIT. Un 403 `REPOST_AUDIENCE_WIDENING` fait rendre
            // `false` à `anchorStatusAsPost`, et le composer reste ouvert avec
            // sa saisie ; `setStatus` avale ce refus.
            // Condition de levée, en DEUX parties et dans cet ordre : (1)
            // `APIPost.toStatusEntry()` transmet `visibility`, PUIS les deux
            // sites de republication le sèment dans leur `ComposerMoodSeed` —
            // les deux hors du dossier Composer ; (2) `ComposerAudienceOffer`
            // intersecte son offre avec `StoryRepostAudience.allowed(from:)`.
            //
            // Deux gardes tiennent ce constat, et il faut les lire ENSEMBLE :
            // `ComposerDocumentSurfaceTests`
            // `.test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint` (le fait,
            // retourné) et
            // `.test_lAncrageDUnMood_nAToujoursAucunPlafondDAudience_etLEventailDescendQuandMeme`
            // (le reliquat, et le fait qu'il ne contraint plus).
            return ComposerProfile(
                initialFormat: sourceFormat,
                offeredFormats: sourceFormat == .post ? [.post] : [sourceFormat, .post],
                showsSlides: true,
                showsTimeline: true,
                opensWith: .keyboardOnContent,
                allowsCapture: false,
                // `.post` et `.reel` restent déclarés sur `.repostComposer`. Aucun
                // site du dépôt ne les construit ; les router vers le meuble
                // affirmerait qu'il les sert, ce qui n'est vérifié par rien.
                routesToLegacy: (sourceFormat == .status || sourceFormat == .story)
                    ? nil
                    : .repostComposer
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
            // Le routage de cette porte est fonction du FORMAT PORTÉ — la même
            // doctrine que `.repost`. `.storyEdit` désigne
            // `storyEditComposerCover` : l'atelier d'une STORY, monté sur une
            // `StoryEditSession` qu'un post n'a pas. Faire passer un post pour une
            // story serait un mensonge, et éditer un POST ou un RÉEL a sa feuille,
            // qui compte CINQ montages de production.
            //
            // Les deux branches nomment des surfaces qui EXISTENT, et c'est la
            // condition à laquelle une table a le droit de router :
            //
            // - `.story` monte le meuble (voir plus bas) ;
            // - `.post` et `.reel` montent `EditPostSheet` — cinq montages
            //   (`PostDetailView`, `ProfileUserPostsList`, `ReelsPlayerView`,
            //   `RootViewComponents`, `FeedView`), et c'est la seule surface du
            //   dépôt qui sache basculer POST vers RÉEL.
            //
            // `.status` REJOINT la seconde branche, et il faut dire pourquoi
            // plutôt que de le laisser tomber par défaut : aucun site du dépôt
            // n'offre d'éditer un mood — zéro état d'édition de statut, zéro
            // montage. La branche nomme la seule feuille du dépôt qui édite une
            // ligne de post qui n'est pas une story ; c'est un ROUTAGE, jamais la
            // promesse qu'une affordance existe. Le faire retomber sur
            // `.storyEdit` reconduirait le mensonge ci-dessus, et sur `nil`
            // dirait que le meuble sert l'édition d'un mood — ce qu'aucune de ses
            // trois surfaces ne fait.
            //
            // CE QUE CETTE LIGNE NE CHANGE PAS : aucun site de production ne
            // construit `ComposerIntent(origin: .edit(...))`. Les deux feuilles
            // sont présentées directement par leurs hôtes, hors du routeur. Le
            // routage est STRUCTUREL et se juge en fonction pure ; il ne recâble
            // aucun écran.
            //
            // Le RETRAIT d'`EditPostSheet.swift` n'a PAS lieu ici. Ses sept
            // capacités sont inventoriées, mesurées et gardées par
            // `EditParityInventoryTests` — deux tenues, cinq manquantes.
            return ComposerProfile(
                initialFormat: documentFormat,
                offeredFormats: offerts,
                showsSlides: true,
                showsTimeline: true,
                opensWith: .resume,
                allowsCapture: false,
                // `.story` va au MEUBLE : `storyEditComposerCover` monte
                // `MeeshyComposerHost` (`StoryEditComposer`), hydraté par
                // `ComposerHydration.editingStory`. La table n'a donc pas de legacy à
                // nommer pour ce format : la porte du dépôt qui édite une story EST le
                // meuble.
                //
                // Le nom `LegacyComposer.storyEdit` reste DÉCLARÉ, comme
                // `.statusComposer` : un cas d'énumération qui perd son dernier
                // routeur ne se supprime pas dans le même lot que le recâblage —
                // `EditParityInventoryTests` compte encore par ce vocabulaire, et
                // retirer le mot ferait rougir un inventaire pour une raison sans
                // rapport avec ce qu'il mesure.
                //
                // `.post` / `.reel` / `.status` restent sur `EditPostSheet` : c'est la
                // seule surface du dépôt qui sache basculer POST vers RÉEL, et le
                // meuble ne la remplace pas ici.
                routesToLegacy: documentFormat == .story ? nil : .editPostSheet
            )

        case .draft, .share:
            // **Deux portes DÉCLARÉES SANS APPELANT** — dites ici pour qu'aucune
            // session ne les monte en croyant qu'elles sont servies :
            //
            // - `.draft` : la reprise VIVANTE marche, et elle traverse bien le
            //   meuble — `openComposer(resumingDraftId:)` pose `pendingDraftId`,
            //   `StoryTrayActions` le remet en PARAMÈTRE (`draftId:`), le meuble
            //   adopte. Cette porte est une SECONDE expression de la même
            //   intention, et c'est elle qui n'a pas d'appelant. Son `id` est lu
            //   en repli du paramètre (`ComposerOrigin.resumedDraftId`) : la
            //   monter marcherait, elle ne perd pas ce qu'on lui confie.
            // - `.share` : l'extension de partage ne fait que router vers des
            //   conversations. Publier une pièce reçue est la vue `2a` de la
            //   planche.
            //
            // Inventaire gardé : `ComposerDoorInventoryGuardTests`.
            //
            // `.post` est un état TRANSITOIRE — la table reste une fonction de
            // l'origine, elle n'ouvre pas le document pour le deviner. Le host ne
            // rebascule pas au format du document une fois celui-ci chargé : rien
            // ne réaffecte `currentFormat` après la construction du host, et un
            // commentaire qui énoncerait un invariant que le code ne tient pas
            // deviendrait la loi que lirait la session suivante.
            //
            // Ce qui tient VRAIMENT la conséquence est ailleurs :
            // `ComposerSurfaceRouting` fait de `.resume` une SCÈNE quel que soit
            // le format, parce que le seul mécanisme de reprise du meuble
            // (`adoptDraft`) repeuple l'atelier. Le `.post` transitoire ne décide
            // donc d'aucune surface, et reprendre un brouillon ne peut pas ouvrir
            // un éditeur de texte vide pendant que le brouillon adopté attend
            // derrière.
            //
            // La bascule au format du document reste À ÉCRIRE ; elle est consignée
            // comme dette, jamais promise comme acquise.
            return ComposerProfile(
                initialFormat: .post,
                offeredFormats: plusReel([.post, .story]),
                showsSlides: true,
                showsTimeline: true,
                opensWith: .resume,
                allowsCapture: true,
                routesToLegacy: nil
            )

        case .conversationMedia, .socialMedia:
            // Le média reçu est DÉJÀ posé par la porte
            // (`MediaComposerDoor` → `StoryComposerViewModel(seeding:)`).
            //
            // Le format d'ouverture est une STORY, pas un post. Le coût de
            // l'erreur est ASYMÉTRIQUE : ouvrir une story quand l'utilisateur
            // voulait un post se répare d'un tap dans l'éventail, tandis qu'un
            // post publié ne se dé-publie pas. Le défaut tombe donc du côté
            // réversible, et le geste courant sur un média reçu est bref.
            //
            // L'ouverture est `.mediaSeeded` et non `.keyboardOnContent`, qui
            // promettrait un CLAVIER : `focusesContentOnAppear` n'a qu'un
            // consommateur de production — `ComposerDocumentSurface`. Sous la
            // scène, personne ne le lit, et l'atelier n'a aucun champ « contenu »
            // à mettre au foyer : on écrit dans une story en posant un OBJET
            // TEXTE. Promettre un clavier que rien ne lève serait un mensonge de
            // la table.
            return ComposerProfile(
                initialFormat: .story,
                offeredFormats: plusReel([.story, .post]),
                showsSlides: true,
                showsTimeline: true,
                opensWith: .mediaSeeded,
                allowsCapture: true,
                routesToLegacy: nil
            )
        }
    }
}

/// Ce que vise un repost : la RACINE, et le format de la CARTE.
///
/// Deux choses différentes, qu'il est naturel de confondre : c'est pour que la
/// confusion ne se fasse pas que la règle vit ici plutôt que recopiée sur six
/// sites.
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
