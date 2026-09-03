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

/// Les huit portes du composer. La GRAINE qu'une porte apporte n'a pas de champ
/// à elle : elle est matérialisée par les valeurs associées ci-dessous.
///
/// ## Il n'y a PAS de porte par FORMAT (décision porteur 2026-08-31, #4623)
///
/// > « On choisit de faire un réel à partir du Feed principal ou à partir du
/// > **+** de story. On choisit **dans le composer** si on fait un post, une
/// > story ou un réel / mood. »
///
/// `.reelTab` a donc été RETIRÉE. Elle nommait une entrée que le produit ne veut
/// pas : une porte qui déclare son format d'avance, là où la décision doit se
/// prendre APRÈS, quand l'auteur voit ce qu'il compose.
///
/// C'est la loi 9 tenue à la lettre — **le format est un CHAMP, pas une
/// identité**. Une porte par format ferait de chaque format une identité qu'on
/// choisit avant d'avoir composé.
///
/// Le réel reste atteignable, et il l'était déjà : `plusReel` l'ajoute à
/// l'éventail de `.storyTray` et de `.feedComposer` dès que la composition
/// qualifie. **La capacité existait ; c'est l'entrée dédiée dont le produit ne
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
    /// `attachmentId` est OPTIONNEL depuis le #4025 : la même origine sert
    /// désormais un message TEXTE, qui n'a aucune pièce jointe. Aucun lecteur
    /// n'en est affecté — les `switch` du dépôt matchent `case .conversationMedia:`
    /// sans jamais lier l'identifiant, qui voyage comme contexte et non comme
    /// donnée de décision.
    case conversationMedia(messageId: String, attachmentId: String?)
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
        case .storyTray, .feedComposer, .moodChip, .edit, .draft, .share, .conversationMedia:
            return nil
        }
    }

    /// **Le brouillon que cette porte REPREND**, quand elle en reprend un —
    /// sinon `nil`. Jumeau exact de `repostedPostId` ci-dessus, et pour la
    /// raison que son doc-comment donne déjà.
    ///
    /// ## Le piège que ce lecteur désarme
    ///
    /// `.draft(id:)` transportait un identifiant que **personne ne lisait** :
    /// zéro `case .draft(let …)` au dépôt (mesuré le 2026-08-31). Le seul
    /// chemin d'adoption du meuble passe par un PARAMÈTRE séparé,
    /// `MeeshyComposerHost(draftId:)` — la « seconde source » que le
    /// doc-comment de `repostedPostId` existe pour interdire.
    ///
    /// > Une porte non construite est une route morte ; une porte dont la
    /// > GRAINE n'a aucun lecteur est pire — elle compile, elle route, et elle
    /// > perd ce qu'on lui confie. Le jour où quelqu'un l'aurait montée, le
    /// > brouillon repris serait resté intact à côté d'un composer vierge.
    ///
    /// Le `switch` est exhaustif : une dixième porte casse la compilation ici
    /// avant de pouvoir répondre `nil` par omission.
    var resumedDraftId: String? {
        switch self {
        case .draft(let id):
            return id
        case .storyTray, .feedComposer, .moodChip, .edit, .repost, .share, .conversationMedia:
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

/// Les composers historiques que ce lot ROUTE sans les migrer (périmètre v1).
///
/// **DEUX cas n'y sont plus routés, et les deux RESTENT dans l'énum.** Ce ne
/// sont pas des cas morts à balayer.
///
/// - `feedComposer` depuis le lot 3 : `FeedComposerSheet` existe toujours et le
///   fil la monte encore ;
/// - `statusComposer` depuis le lot 4.6 : plus aucune porte ne le désigne et
///   plus aucune feuille ne le monte. `StatusComposerView.swift` a été RETIRÉ
///   au lot 4.8, la parité prouvée bloc par bloc — le cas, lui, reste.
///
/// Surtout : les deux gardes négatives qui interdisent à toute porte d'y
/// retomber (`ComposerIntentTests.test_aucunePorte_neRetombeSurLaFeuilleDuFil`
/// et `.test_aucunePorte_neRetombeSurLeComposerDeMood`) doivent pouvoir NOMMER
/// leur interdit. Supprimer l'un de ces cas rendrait sa garde inécrivable, et le
/// retour du routage passerait alors sans un mot — le mode d'extinction
/// silencieuse propre aux gardes négatives.
///
/// **`editPostSheet` est arrivé au lot 7.8, et il répare un MENSONGE — pas un
/// manque.** La table rendait `.storyEdit` pour les QUATRE formats d'édition.
/// Or `.storyEdit` désigne `storyEditComposerCover` (`StoryTrayView`, quatre
/// montages), qui monte `StoryComposerView` sur une `StoryEditSession` : c'est
/// l'atelier d'une STORY. Éditer un POST ou un RÉEL — ce que font les CINQ
/// montages d'`EditPostSheet` (`PostDetailView`, `ProfileUserPostsList`,
/// `ReelsPlayerView`, `RootViewComponents`, `FeedView`) — n'avait donc AUCUNE
/// représentation ici. Une valeur manquante se voit ; une valeur voisine qui
/// tient la place a l'air d'avoir été décidée, et c'est le pire des deux.
///
/// **Ce que ce cas n'est PAS.** Aucun site de production ne construit
/// `ComposerIntent(origin: .edit(...))` — zéro occurrence, mesurée : les deux
/// feuilles sont montées directement, hors du routeur. Le défaut était
/// STRUCTUREL, et il se juge en fonction pure ; prétendre qu'il corrigeait un
/// écran serait une victoire inventée.
///
/// La doctrine du « cas qui reste déclaré » vaut désormais pour CINQ valeurs,
/// et l'inventaire de parité qui gouverne le retrait d'`EditPostSheet.swift`
/// vit dans `EditParityInventoryTests` — pas ici. Ce fichier ROUTE ; il ne
/// décide pas d'un retrait.
///
/// **`feedInlineComposer` est arrivé à T3.3, et il NOMME l'overlay inline iPad**
/// (`FeedView.composerOverlay`) que rien ne surveillait — `.feedComposer` ne le
/// désigne pas, il part de son propre booléen. Le nommer le rend gardable
/// (`FeedInlineComposerGuardTests`) SANS le migrer : T3.4, qui le ferait passer
/// au meuble, est descopée. L'overlay reste donc NOMMÉ et GARDÉ — strictement
/// mieux qu'un composer que rien ne mesure.
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
    ///
    /// - Parameter compositionQualifiesAsMood: `qualifiesAsMood` de la
    ///   composition COURANTE (#4030). Jumeau du précédent, et EXCLUSIF de lui
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
            // désigner `FeedComposerSheet`. Depuis T3.1, le PLEIN composer du
            // fil LIT cette table — `RootViewComponents` construit
            // `ComposerIntent(origin: .feedComposer)` (via `DocumentComposerDoor`)
            // et atterrit sur le meuble. Restent HORS table, chacun sur son
            // propre booléen : les deux CITATIONS de la feuille
            // (`RootViewComponents` et `FeedView`, retenues par T3.2 tant que
            // 7.5 n'a pas d'écrivain durable du repost) et le composer INLINE
            // de l'iPad (`FeedView.composerOverlay`, nommé
            // `LegacyComposer.feedInlineComposer` à T3.3 ; sa migration T3.4 est
            // descopée — l'overlay reste nommé et gardé).
            //
            // DETTE DU LOT 2 : SOLDÉE (T2.1→T2.6). La surface désignée ne
            // tenait au 2026-08-24 qu'UNE des trois capacités du DoD — le
            // clavier sur `content` ; les deux autres sont tombées depuis. La
            // rangée photo·caméra·emoji·document·lieu·micro se peint désormais
            // en entier (T2.3 pose les fichiers, T2.4 la bascule réel
            // `forcePlainPost`, T2.5 le lieu, T2.6 le micro ; la langue est
            // déclarée depuis T2.2), et l'ENVOI DURABLE l'était déjà depuis le
            // lot 4.10 : `DocumentComposerDoor` monte le meuble,
            // `ComposerDocumentSendPlan` interroge la table, et l'envoi part par
            // la branche texte de `FeedViewModel.createPost`. C'est cette triple
            // couverture qui a permis à T3.1 de faire lire la table par le fil.
            //
            // La garde de source correspondante a été RETOURNÉE en conséquence :
            // `MeeshyComposerHostGuardTests`
            // `.test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`
            // exige désormais un appelant UNIQUE (le fil) au lieu d'aucun, et
            // ARME les trois assertions qu'elle portait en silence. L'éventail
            // des formats, lui, ne descend toujours PAS sous le document — le
            // paragraphe de `MeeshyComposerHost.documentSurface` dit le blocage
            // SDK qui l'y retient.
            //
            // **#4030 — le quatrième format rejoint l'éventail du fil.** Le
            // mood n'était atteignable que par sa porte (`.moodChip`) : écrire
            // deux lignes ici puis vouloir en faire un mood obligeait à fermer,
            // revenir et retaper — la loi 9 tombait sur le seul format
            // qu'aucune bascule n'atteignait. `plusMood` et `plusReel` ne se
            // cumulent jamais (l'un exige un média, l'autre l'interdit) ; la
            // composition est jugée par `ComposerMoodGate`, que le meuble
            // nourrit comme il nourrit déjà le gate du réel.
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
            // Rév. 7 (lot 4.6, 2026-08-24) : la porte du mood cesse de router.
            // Les trois conditions que le lot 3 exigeait d'une porte-document
            // avant de la recâbler — une surface, une issue pour sa saisie, un
            // publieur atteignable — sont TOUTES tenues pour le mood, et par
            // des choses qui existent, pas par des promesses :
            //
            // - la SURFACE est `ComposerMoodSurface` (lot 4.4), et
            //   `ComposerSurfaceRouting` fait atterrir `.moodGrid` + `.status`
            //   dessus (lot 4.3) ;
            // - l'ISSUE est `onClose`, que le meuble lui remet ;
            // - le PUBLIEUR est le socle : `ComposerChromeOwnership.owner(for:
            //   .mood)` rend `.host`, sa flèche est un vrai bouton gaté sur
            //   `ComposerMoodPolicy.canPublish`, et son brouillon part par
            //   `MeeshyComposerHost.onPublishDocument` (lot 4.5).
            //
            // Ce que cette ligne change, EXACTEMENT : la table cesse de
            // désigner `StatusComposerView`. Les quatre feuilles qui le
            // montaient montent désormais `MoodComposerDoor` — c'est le geste
            // du même lot, et non une promesse laissée au suivant. La
            // différence avec `.feedComposer` est là : le fil a vu sa TABLE
            // bouger sans que ses portes suivent, faute d'une rangée d'outils ;
            // le mood n'a pas de pièce jointe, donc pas de rangée, donc rien
            // qui le retienne.
            //
            // `StatusComposerView.swift` a été RETIRÉ au lot 4.8, après que la
            // parité de la surface a été confrontée bloc par bloc. Le cas
            // `.statusComposer` de la table, lui, reste : c'est l'interdit que
            // les deux gardes négatives doivent pouvoir NOMMER.
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
            // Rév. 7 (lot 4.7) : le routage de cette porte devient fonction du
            // FORMAT PORTÉ, ce que la doctrine de la table autorise en toutes
            // lettres plus haut — « le FORMAT qu'une porte porte fait partie de
            // son identité ». Faire passer `.repost` à `nil` en bloc aurait fait
            // dire à la table que le meuble sert AUSSI les reposts de story, de
            // post et de réel, ce qui est faux et mesuré :
            //
            // - le meuble n'a aucune graine `StoryItem` (son `init` n'en prend
            //   pas), là où `StoryComposerViewModel(reposting:authorHandle:)` en
            //   vit ;
            // - son canal de scène (`onPublishAllInBackground`) ne porte pas
            //   `repostOfId` — comparer `StoryTrayActions` à
            //   `StoryViewerView.publishStoryInBackground(repostOfId:)` ;
            // - il ne passe ni `allowedVisibilities` ni `initialVisibilityUserIds`
            //   à l'atelier, si bien que le plafond d'audience du repost
            //   (`StoryRepostAudience.allowed`, loi 10) tomberait EN SILENCE.
            //
            // Le mood, lui, n'a aucun de ces trois besoins : sa graine est un
            // emoji et une phrase, son envoi est celui du mood
            // (`StatusViewModel.setStatus`, qui prend déjà `repostOfId`), et son
            // audience est celle que sa propre surface choisit.
            //
            // DETTE SOLDÉE le 2026-08-25 (lot 4.7, fin) : l'ANCRAGE en post,
            // offert par `offeredFormats` ci-dessous, atteint désormais un
            // ÉCRAN. Le plateau — donc l'éventail — est monté par le `body` du
            // meuble sous `ComposerFormatFanPlacement`, une règle PURE : il se
            // peint là où tous les formats offerts atterrissent sur une surface
            // qui partage l'état du meuble. Cette porte offre `[.status, .post]`,
            // deux surfaces sans atelier ; `.feedComposer` offre `.story`, que
            // le routage envoie à la scène, et reste donc hors de l'éventail.
            //
            // L'ORDRE de la levée n'était pas négociable, et c'est ce que la
            // rédaction précédente de ce commentaire n'avait pas su ranger : le
            // PUBLIEUR devait venir en PREMIER, alors qu'il était listé en
            // troisième. Descendre l'éventail sans lui aurait armé une flèche
            // qui, pressée, n'aurait rien fait — « le pire des deux mondes,
            // puisqu'il aurait eu l'air de marcher ». L'ordre livré fut donc :
            // `StatusViewModel.anchorStatusAsPost`, puis `repostOfId` sur le
            // brouillon du document, puis l'éventail, puis l'aiguillage de
            // `MoodComposerDoor.publish`.
            //
            // La raison écrite ici jusqu'au 2026-08-24 (« le socle du document
            // peint une audience INERTE et un œil qui ouvrirait une scène
            // VIDE ») était PÉRIMÉE : le lot 4.9 a retiré l'œil et rendu
            // l'audience choisissante. Elle n'était pas la bonne.
            //
            // CE QUI RESTE OUVERT — et qui ne retient PLUS l'éventail : le
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
            // POURQUOI CE TROU NE RETIENT PLUS RIEN, et c'est la correction de
            // fond du lot 4.7. Ce qui pouvait être fermé sans connaître la
            // source l'a été au lot 4.9 : `ComposerAudienceOffer` retire d'une
            // republication les deux audiences dont la PORTÉE appartient à la
            // source (`ONLY`/`EXCEPT`, dont le serveur écrase la liste), et le
            // socle comme le ruban lisent cette offre. L'ÉLARGISSEMENT, seul
            // reliquat, pèse EXACTEMENT autant sur le ruban du mood — peint sur
            // un écran RÉEL depuis le lot 4.6 — que sur le chip d'audience de
            // l'ancrage. L'ancrage hérite donc d'un trou déjà nommé et déjà
            // gardé ; il n'en ajoute aucun. Retenir l'éventail pour ce motif
            // aurait été un plafond raisonné pour un contrôle FUTUR au prix du
            // contrôle PRÉSENT — l'erreur que l'AVERTISSEMENT de la rédaction
            // précédente s'était déjà faite une fois.
            //
            // Ce que l'ancrage apporte en revanche, et que le miroir n'a pas :
            // un refus qui SE DIT. Un 403 `REPOST_AUDIENCE_WIDENING` fait rendre
            // `false` à `anchorStatusAsPost`, et le composer reste ouvert avec
            // sa saisie ; `setStatus` avale (dette du lot 4.5, inchangée).
            //
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
                // **Rév. 8 (#5053) — `.story` rejoint `.status` sur le MEUBLE.**
                //
                // Les trois manques énumérés plus haut sont soldés :
                // `ComposerHydration` donne au meuble sa graine `StoryItem` ET
                // le plafond d'audience de la loi 10 (les deux ensemble, pour
                // qu'on ne puisse pas passer l'une sans l'autre) ; le troisième
                // — « son canal de scène ne porte pas `repostOfId` » — n'en
                // était pas un : `onPublishAllInBackground` est une fermeture
                // fournie par la porte, qui CAPTURE l'identifiant de la source.
                // Une signature qui ne nomme pas une valeur ne l'empêche pas de
                // voyager.
                //
                // Ce que la bascule DONNE, et qui manquait : l'ANCRAGE en post,
                // déclaré par `offeredFormats` depuis le lot 4.7 et qui
                // n'atteignait aucun écran — l'atelier nu n'a pas de plateau,
                // donc pas d'éventail.
                //
                // `.post` et `.reel` restent déclarés sur `.repostComposer`.
                // Aucun site du dépôt ne les construit (mesuré) ; les router
                // vers le meuble affirmerait qu'il les sert, ce qui n'est
                // vérifié par rien.
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
            // Rév. 9 (lot 7.8) : le routage de cette porte devient fonction du
            // FORMAT PORTÉ — la même doctrine que `.repost` au lot 4.7, et pour
            // une raison plus dure encore. Cette ligne rendait `.storyEdit`
            // pour les QUATRE formats, alors que `.storyEdit` désigne
            // `storyEditComposerCover` : l'atelier d'une STORY, monté sur une
            // `StoryEditSession` qu'un post n'a pas. La table faisait donc
            // passer un post pour une story, et éditer un POST ou un RÉEL
            // n'avait aucune représentation — alors que la feuille qui le fait
            // existe, et compte CINQ montages de production.
            //
            // Les deux branches nomment des surfaces qui EXISTENT, et c'est la
            // condition à laquelle une table a le droit de router :
            //
            // - `.story` monte `storyEditComposerCover` — quatre montages
            //   (`StoryTrayView` deux fois, `iPadRootView`, `RootView`) ;
            // - `.post` et `.reel` montent `EditPostSheet` — cinq montages
            //   (`PostDetailView`, `ProfileUserPostsList`, `ReelsPlayerView`,
            //   `RootViewComponents`, `FeedView`), et c'est la seule surface du
            //   dépôt qui sache basculer POST vers RÉEL.
            //
            // `.status` REJOINT la seconde branche, et il faut dire pourquoi
            // plutôt que de le laisser tomber par défaut : aucun site du dépôt
            // n'offre d'éditer un mood — mesuré, zéro état d'édition de statut,
            // zéro montage. La branche nomme donc la seule feuille du dépôt qui
            // édite une ligne de post qui n'est pas une story ; c'est un
            // ROUTAGE, jamais la promesse qu'une affordance existe. Le faire
            // retomber sur `.storyEdit` aurait reconduit le mensonge exact que
            // cette révision retire, et le faire retomber sur `nil` aurait dit
            // que le meuble sert l'édition d'un mood — ce qu'aucune de ses
            // trois surfaces ne fait.
            //
            // CE QUE CETTE LIGNE NE CHANGE PAS, et il faut le lire au mot près :
            // aucun site de production ne construit `ComposerIntent(origin:
            // .edit(...))` — zéro occurrence. Les deux feuilles sont présentées
            // directement par leurs hôtes, hors du routeur. La correction est
            // STRUCTURELLE et se juge en fonction pure ; elle ne recâble aucun
            // écran, et la lire comme un correctif d'écran serait exactement le
            // vieillissement de commentaire que ce dossier traque ailleurs.
            //
            // Le RETRAIT d'`EditPostSheet.swift` n'a PAS lieu ici. Ses sept
            // capacités sont inventoriées, mesurées et gardées par
            // `EditParityInventoryTests` — deux tenues, cinq manquantes —, et
            // les deux tenues le sont côté CRÉATION : cette porte ouvre en
            // `.resume`, que `ComposerSurfaceRouting` fait atterrir sur la
            // SCÈNE, où le socle ne peint rien.
            return ComposerProfile(
                initialFormat: documentFormat,
                offeredFormats: offerts,
                showsSlides: true,
                showsTimeline: true,
                opensWith: .resume,
                allowsCapture: false,
                // **Rév. 10 (#5053) — `.story` passe au MEUBLE.**
                //
                // `storyEditComposerCover` montait `StoryComposerView` NU ;
                // depuis le 2026-09-03 il monte `MeeshyComposerHost`
                // (`StoryEditComposer`), hydraté par
                // `ComposerHydration.editingStory`. La table n'a donc plus de
                // legacy à nommer pour ce format : la porte du dépôt qui édite
                // une story EST le meuble.
                //
                // Le nom `LegacyComposer.storyEdit` reste DÉCLARÉ, comme
                // `.statusComposer` avant lui — un cas d'énumération qui perd
                // son dernier routeur ne se supprime pas dans le même lot que
                // le recâblage : `EditParityInventoryTests` compte encore par
                // ce vocabulaire, et retirer le mot ferait rougir un inventaire
                // pour une raison sans rapport avec ce qu'il mesure.
                //
                // `.post` / `.reel` / `.status` restent sur `EditPostSheet` :
                // c'est la seule surface du dépôt qui sache basculer POST vers
                // RÉEL, et le meuble ne la remplace pas ici.
                routesToLegacy: documentFormat == .story ? nil : .editPostSheet
            )

        case .draft, .share:
            // **Deux portes DÉCLARÉES SANS APPELANT** (#4611, mesuré le
            // 2026-08-31) — dites ici pour qu'aucune session ne les monte en
            // croyant qu'elles sont servies :
            //
            // - `.draft` : la reprise VIVANTE marche, et elle traverse bien le
            //   meuble — `openComposer(resumingDraftId:)` pose `pendingDraftId`,
            //   `StoryTrayActions` le remet en PARAMÈTRE (`draftId:`), le meuble
            //   adopte. Cette porte est donc une SECONDE expression de la même
            //   intention, et c'est elle qui n'a pas d'appelant.
            //   Elle en était même une expression MENTEUSE : son `id` n'avait
            //   aucun lecteur (zéro `case .draft(let …)` au dépôt). Le meuble le
            //   lit désormais en repli du paramètre
            //   (`ComposerOrigin.resumedDraftId`), donc la monter marcherait —
            //   elle ne perd plus ce qu'on lui confie.
            // - `.share` : l'extension de partage ne fait aujourd'hui que
            //   router vers des conversations. Publier une pièce reçue est la
            //   vue `2a` de la planche, portée par #4079.
            //
            // Inventaire gardé : `ComposerDoorInventoryGuardTests`.
            //
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
            // e9/O13 : le média reçu est DÉJÀ posé par la porte
            // (`ConversationMediaComposerDoor` → `StoryComposerViewModel(seeding:)`).
            //
            // Le format d'ouverture est une STORY, pas un post (directive du
            // 2026-08-23, doctrine alignée en rév. 3). Le coût de l'erreur est
            // ASYMÉTRIQUE : ouvrir une story quand l'utilisateur voulait un post
            // se répare d'un tap dans l'éventail, tandis qu'un post publié ne se
            // dé-publie pas. Le défaut tombe donc du côté réversible, et le
            // geste courant sur un média reçu est bref.
            //
            // Rév. 8 (lot 5) : l'ouverture passe de `.keyboardOnContent` à
            // `.mediaSeeded`, et ce n'est pas un renommage. L'ancienne valeur
            // disait DEUX choses fausses, chacune d'un côté de la même phrase de
            // commentaire (« il ne reste que le mot à écrire ») :
            //
            // - elle promettait un CLAVIER. `focusesContentOnAppear` n'a qu'un
            //   consommateur de production — `ComposerDocumentSurface`. Sous la
            //   scène, personne ne le lit, et l'atelier n'a aucun champ
            //   « contenu » à mettre au foyer : on écrit dans une story en
            //   posant un OBJET TEXTE ;
            // - elle envoyait « Post » sur la surface DOCUMENT, qui ne porte
            //   NI `mediaIds`, NI fichier, NI lieu. Un tap sur le chip aurait
            //   fait disparaître la photo semée de l'écran ET de la publication
            //   — la loi 6 rompue par le ROUTAGE, pas par une vue.
            //
            // Conséquence mesurable, et c'est elle qui rendait le câblage
            // impossible : `ComposerFormatFanPlacement.paints` exige que TOUS
            // les formats offerts atterrissent du même côté de la frontière
            // scène / pas-de-scène. Avec `.keyboardOnContent`, `.post` partait
            // vers `.document` ⇒ l'éventail ne se peignait PAS DU TOUT, et la
            // porte livrait trois formats déclarés sans aucun contrôle — l'UI
            // morte que la loi 4 nomme. L'offre, elle, n'a pas bougé d'un
            // format : entre supprimer un mensonge et supprimer une capacité,
            // on supprime le mensonge.
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
