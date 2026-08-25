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
        case .storyTray, .feedComposer, .reelTab, .moodChip, .edit, .draft, .share, .conversationMedia:
            return nil
        }
    }
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
/// - `statusComposer` depuis le lot 4.6 : `StatusComposerView.swift` existe
///   toujours — son retrait est la tâche 4.8, conditionnelle et séparée — mais
///   plus aucune porte ne le désigne, et plus aucune feuille ne le monte.
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
/// La doctrine du « cas qui reste déclaré » vaut désormais pour QUATRE valeurs,
/// et l'inventaire de parité qui gouverne le retrait d'`EditPostSheet.swift`
/// vit dans `EditParityInventoryTests` — pas ici. Ce fichier ROUTE ; il ne
/// décide pas d'un retrait.
nonisolated enum LegacyComposer: Equatable {
    case statusComposer, repostComposer, storyEdit, editPostSheet, feedComposer
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
            // photo·caméra·emoji·document·lieu·micro, dont UN SEUL outil se peint
            // depuis le 2026-08-24 (l'emoji, le seul dont le résultat ait une
            // destination ; les cinq autres n'ont ni champ sur
            // `ComposerDocumentDraft` ni publieur qui les accepte, et restent donc
            // ABSENTS plutôt qu'inertes, loi 4) ; la bascule réel
            // `forcePlainPost`, absente du dossier Composer.
            //
            // L'ENVOI DURABLE, lui, est TENU depuis le lot 4.10, et c'était la
            // troisième des trois capacités : `DocumentComposerDoor` monte le
            // meuble, `ComposerDocumentSendPlan` interroge la table — qui a donc
            // désormais un appelant, et un seul —, et l'envoi part par la branche
            // texte de `FeedViewModel.createPost`, qui enfile sa ligne sans même
            // consulter la connectivité. La garde de source a été RETOURNÉE en
            // conséquence : elle exige un appelant unique au lieu d'aucun. L'éventail des
            // formats, lui, ne descend pas non plus sous le document — le
            // paragraphe de `MeeshyComposerHost.documentSurface` dit le blocage
            // SDK qui l'y retient. Basculer les écrans du fil AVANT ces
            // capacités serait la régression sèche que la rév. 4 retenait ; ce
            // lot déplace la TABLE et laisse les portes de présentation en
            // place.
            //
            // Et cette dette n'est pas qu'écrite : elle est GARDÉE. Un site de
            // production qui construirait cette intention pendant qu'il manque
            // au document l'UNE des trois — rangée COUVERTE, issue pour sa
            // saisie, publieur atteignable — fait rougir
            // `MeeshyComposerHostGuardTests`
            // `.test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`.
            // Sans elle, la valeur `nil` posée ici aurait promis au lot suivant
            // une surface que le meuble ne sait pas encore tenir.
            //
            // ÉTAT AU 2026-08-24 : DEUX des trois sont tombées, et il faut le
            // lire au mot près. Le socle est peint sous le document
            // (`ComposerChromeOwnership.owner(for: .document)` rend `.host`),
            // sa flèche est un vrai bouton gaté sur la matière, et le texte a
            // une issue — `MeeshyComposerHost.onPublishDocument`. Reste la
            // PREMIÈRE, la rangée — et elle ne se lit plus comme un booléen :
            // elle sert UN outil sur six. La garde a d'ailleurs changé de
            // mesure le même jour, parce que la sienne était un PROXY : « ne
            // rend pas `[]` » représentait « la rangée existe-t-elle ? », une
            // question à laquelle servir un seul outil répond OUI. Elle mesure
            // désormais la COUVERTURE de la rangée canonique. Lire « il ne
            // reste plus rien » parce qu'une icône est apparue serait
            // précisément l'erreur que cette garde existe pour empêcher.
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
            // `StatusComposerView.swift` EXISTE ENCORE, et ce n'est pas un
            // oubli : son retrait est la tâche 4.8, conditionnelle, qui exige
            // d'abord de confronter la parité bloc par bloc. Le laisser en
            // place ne coûte rien — plus personne ne le monte.
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
                routesToLegacy: sourceFormat == .status ? nil : .repostComposer
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
                routesToLegacy: documentFormat == .story ? .storyEdit : .editPostSheet
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
