import SwiftUI
import MeeshySDK
import MeeshyUI
import UIKit
import ImageIO

// **Les règles de SURFACE du composer** — quelle porte monte quoi, qui peint
// le chrome de publication, ce que le `⋯` a le droit d'offrir, et où
// l'audience se souvient. Toutes pures, toutes éprouvables sans monter la
// moindre vue : c'est pour cela qu'elles quittent le fichier de la VUE
// (#4103, budget 800–1100 lignes du CLAUDE.md § Code Style).

/// Les TROIS surfaces du meuble (V2, élargi au mood par le lot 4).
///
/// Le composer unifié n'a jamais eu qu'une surface : l'atelier de scène du SDK
/// (`StoryComposerView`). C'est ce qui interdisait de recâbler `.feedComposer`,
/// la porte la plus utilisée de l'app — elle ouvre un DOCUMENT (un texte, des
/// pièces jointes), pas une scène, et la router vers l'atelier aurait été une
/// régression sèche. La spec v1 le pose mot pour mot : « le host n'a pas de
/// surface document sans scène, et recâbler la porte la plus utilisée sans elle
/// serait une régression ».
///
/// **Le mood a quitté le document le 2026-08-24 (lot 4).** Il y était rangé
/// par défaut, faute de troisième cas — et l'énumération n'en portait que deux.
/// Ce que la mesure a rendu : un mood n'a NI pièce jointe (`allowsCapture:
/// false`, `ComposerIntent.swift`), NI rangée d'outils à servir, NI texte long.
/// Sa matière est une grille de dix emojis et 122 caractères. Lui monter
/// l'éditeur du document aurait affiché un `TextEditor` vide là où l'auteur
/// attend des emojis — la régression que ce dossier évite ailleurs.
nonisolated enum ComposerSurfaceKind: Equatable {
    /// L'atelier : un canvas, des diapositives, une timeline.
    case scene
    /// Le document : un texte long, des pièces jointes, aucune scène.
    case document
    /// Le mood : une grille d'emojis, 122 caractères, aucune pièce jointe.
    case mood
}

/// Quelle surface le meuble monte — et c'est une fonction PURE de ce que la
/// porte a décidé (`opensWith`) et du format COURANT (loi 9 : le format est un
/// champ, pas une identité).
///
/// Trois règles, et l'ordre entre elles est le fond de l'affaire :
///
/// 1. **Une porte qui a ouvert une CAPTURE — ou qui a DÉJÀ posé son média —
///    a une scène, quel que soit le format.** Basculer une story en post ne
///    détruit pas le canvas déjà composé : la loi 9 autorise à changer de
///    format, jamais à jeter ce qui est composé. Faire décider le format seul
///    aurait vidé l'écran de quiconque tape « Post » depuis le tray. C'est la
///    même raison, un cran plus littéral, qui range `.mediaSeeded` ici : le
///    document ne porte NI `mediaIds`, NI fichier, NI lieu, si bien qu'un
///    « Post » routé vers lui ferait disparaître le média semé de l'écran ET de
///    la publication.
/// 2. **Une REPRISE monte la surface où la composition reprise vit
///    RÉELLEMENT.** Le seul mécanisme de reprise du meuble est
///    `StoryComposerViewModel.adoptDraft`, qui repeuple l'ATELIER. Laisser le
///    format décider ici aurait été la mine posée pour V3 :
///    `.draft`/`.share` sont les deux seules portes `routesToLegacy: nil` qui
///    ouvrent en `.resume`, et leur `initialFormat` est le `.post` TRANSITOIRE
///    de la rév. 3 — rouvrir un brouillon aurait donc affiché un éditeur de
///    texte VIDE pendant que le brouillon adopté attendait dans l'atelier,
///    juste derrière. **Condition de levée nommée** : le jour où le meuble sait
///    adopter un brouillon de DOCUMENT (et non plus seulement de scène),
///    `.resume` redescend sous la règle 3.
/// 3. **Sinon le format décide, et il décide à TROIS issues.** Une story et un
///    réel SONT des scènes (des pages, une prise continue) ; un post est un
///    document — du texte long et des pièces, sans canvas ; un mood est sa
///    PROPRE surface — dix emojis, 122 caractères, aucune pièce.
///
///    Jusqu'au 2026-08-24, cette règle rangeait le mood du côté du document.
///    C'était le repli d'une énumération qui n'avait que deux cas, pas une
///    mesure : le mood ne partage avec le document ni la rangée d'outils, ni
///    la capture, ni le plafond de saisie. Le lot 4 lui donne son cas, et
///    cette phrase-ci est réécrite dans le MÊME commit — un commentaire de
///    règle laissé sous un code qui l'a démenti devient la loi que lira la
///    session suivante. La formulation retirée est nommée hors de ce fichier,
///    par `ComposerDocumentSurfaceTests`
///    `.test_leCommentaireDeRegle_naffirmePlus_queLeMoodEstUnDocument`, pour
///    qu'elle ne puisse pas y revenir sans faire rougir quelque chose.
///
///    Le `switch` sur le format reste exhaustif : un cinquième format casserait
///    la compilation ICI, et c'est la propriété qu'on veut.
///
/// La conséquence que V3 attend : `.feedComposer` (clavier sur contenu, format
/// `.post`) monte le DOCUMENT, et bascule sur la scène le jour où son auteur
/// choisit « Story » dans l'éventail. C'est la seconde condition de levée de la
/// garde négative de l'éventail.
nonisolated enum ComposerSurfaceRouting {

    static func surface(opening: ComposerOpening, format: ComposerFormat) -> ComposerSurfaceKind {
        switch opening {
        // **Les TROIS ouvertures qui portent déjà de la MATIÈRE gardent la
        // scène** — une dette nommée, plus une exemption raisonnée.
        //
        // Elles arrivent avec un média reçu d'une conversation ou un brouillon
        // repeuplé, et l'atelier est le seul écran qui les tienne déjà.
        // `.mediaSeeded` en fait la démonstration : `ConversationMediaComposerDoor`
        // documente que router son média ailleurs le ferait disparaître de
        // l'écran ET de la publication, `ComposerDocumentDraft` n'ayant ni
        // `mediaIds`, ni fichier. Leur retirer la scène ferait perdre à
        // l'auteur ce qu'il vient de confier.
        //
        // Elles tomberont quand le meuble saura REPRENDRE et SEMER (#4751) —
        // et c'est à ce moment-là qu'on retournera leur témoin, jamais avant.
        case .videoCameraReady, .resume, .mediaSeeded:
            return .scene
        // **`.cameraReady` a QUITTÉ cette liste le 2026-09-01** (#4751,
        // directive porteur : « se concentrer sur le composer v3 et non
        // l'ancien »).
        //
        // Elle y était entrée par RESSEMBLANCE. L'argument de l'exemption —
        // « elles arrivent avec de la matière que le meuble ne tient pas » —
        // valait pour les trois autres et pas pour elle : la caméra n'arrive
        // avec RIEN. Elle promet un viseur, et le meuble sait l'ouvrir depuis
        // toujours (`presentMediaIntake(.camera)`).
        //
        // > Une exemption qui couvre quatre cas d'un seul argument doit être
        // > vérifiée sur les quatre. Ici le quatrième était la porte la plus
        // > visible du Feed — « Créer une story » — et c'est elle qui montait
        // > l'ancien écran.
        //
        // Ce que la promesse devient : elle est tenue DANS le meuble, par un
        // GESTE — l'appui long sur la scène vide (#4036). Elle l'a d'abord
        // été par un viseur présenté au montage (#4751), révoqué le
        // 2026-09-03 : la porte annonçait un appareil photo et l'auteur qui
        // venait composer devait fermer un plein écran noir.
        //
        // **Ici, l'auteur CHOISIT.** C'est le « nouveau composer » de la
        // directive porteur du 2026-09-01, et c'est là que la story cessait
        // d'être composée dans le meuble : `.scene` monte `StoryComposerView` —
        // l'atelier du SDK, la vue de composition de story qui préexistait au
        // meuble. Une story s'écrivait donc dans un composer et un post dans un
        // autre, sur un écran que l'auteur croit unique.
        case .cameraReady, .keyboardOnContent, .moodGrid:
            switch format {
            case .story: return .document
            // **Le RÉEL rejoint le meuble le 2026-09-01** (#4751). Il était
            // resté sur l'atelier au #4700 par prudence — sa timeline y vivait.
            // Elle vit AUSSI au meuble depuis le #4082 : `ComposerSceneBand`
            // porte une bande `timeline`, montée sous la scène.
            //
            // Le garder à part faisait changer de COMPOSER en changeant de
            // format, sur un écran que l'auteur croit unique — le défaut exact
            // que le #4700 avait corrigé pour la story et laissé pour le réel.
            case .reel: return .document
            case .post: return .document
            case .status: return .mood
            }
        }
    }

    /// Le clavier ne se lève QUE là où la porte a promis qu'on écrirait
    /// d'emblée. Une reprise de brouillon ne le lève pas : le clavier
    /// recouvrirait le document qu'on vient de rouvrir pour le relire.
    ///
    /// `.mediaSeeded` ne le lève pas davantage, et c'est le sens même du cas :
    /// il n'existe aucun champ « contenu » sous l'atelier — on y écrit en
    /// posant un OBJET TEXTE. La porte du média reçu a annoncé ce clavier
    /// jusqu'au lot 5 sans qu'aucune ligne ne le lève.
    ///
    /// `.moodGrid` ne le lève pas non plus, et ce cas n'a PAS bougé au lot 4
    /// alors même que le mood changeait de surface : on choisit un emoji avant
    /// d'écrire, et lever le clavier recouvrirait la grille — c'est-à-dire le
    /// seul geste que le mood exige (`ComposerMoodPolicy.canPublish`).
    static func focusesContentOnAppear(opening: ComposerOpening) -> Bool {
        switch opening {
        case .keyboardOnContent: return true
        case .cameraReady, .videoCameraReady, .moodGrid, .resume, .mediaSeeded: return false
        }
    }

    /// **Le viseur ne se lève plus AU MONTAGE** (#4036, #4851 — porteur
    /// 2026-09-03). `armsCameraOnAppear` vivait ici et présentait le viseur dès
    /// l'ouverture ; la règle a été RETIRÉE, pas mise à `false` : une fonction
    /// qui rend faux partout se rebranche sans qu'on s'en aperçoive.
    ///
    /// Ce que la porte promet est désormais tenu par un GESTE —
    /// `ComposerSceneCaptureGesture`, l'appui long sur une scène vide, doctrine
    /// de la planche `2b`. La promesse elle-même n'est pas perdue : elle survit
    /// dans `ComposerCameraMode.mode(for:)` juste en dessous, qui choisit le
    /// mode que ce geste ouvrira.
    ///
    /// > Une garde de source (`ComposerSceneCaptureGestureTests`) interdit le
    /// > retour d'une présentation au montage, parce que c'est un GESTE
    /// > D'ÉCRITURE qu'il faut retenir, pas une valeur.
    ///
    /// **Ce que son retrait emporte, et qu'il faut redonner un porteur.** Les
    /// deux `switch` jumeaux — celui-ci et `focusesContentOnAppear` — se
    /// tenaient mutuellement : leur exhaustivité garantissait, cas par cas,
    /// qu'un viseur et un clavier ne s'ouvrent jamais ensemble. En retirant
    /// l'un, cette garantie perd son porteur.
    ///
    /// Elle est désormais VRAIE PAR CONSTRUCTION — plus aucun viseur ne s'ouvre
    /// au montage, donc aucun ne peut rencontrer un clavier — et c'est une
    /// forme de garantie plus forte qu'un invariant vérifié. Mais elle cesse
    /// d'être vraie à la seconde où quelqu'un rouvre un viseur au montage :
    /// c'est exactement ce que la garde de source interdit, et c'est sa
    /// deuxième raison d'être.
}

/// **Dans QUEL mode le viseur promis s'ouvre** (#4998, directive porteur
/// 2026-09-03).
///
/// Cette règle a d'abord été la jumelle de `armsCameraOnAppear` : la première
/// disait SI un viseur se lève, celle-ci LEQUEL. La première a été retirée le
/// 2026-09-03 (#4036) — le viseur ne se lève plus seul — et celle-ci SURVIT :
/// c'est elle qui porte la promesse de la porte jusqu'au geste qui l'ouvre.
///
/// > Retirer une règle laisse sa jumelle orpheline de sa raison d'être. Ici
/// > la seconde question (« lequel ? ») garde tout son sens sans la première
/// > (« si ? ») — mais il faut le DIRE, sinon elle a l'air d'un reste.
///
/// `ComposerOpening` distingue `.cameraReady` de `.videoCameraReady` depuis
/// toujours, et rien n'a jamais lu la différence avant #4998.
///
/// > Un type SOMME qui nomme deux promesses sans qu'aucun consommateur les
/// > distingue n'est pas une abstraction : c'est une promesse écrite deux fois
/// > et tenue une seule.
///
/// ## Ce que cette règle NE fait PAS aujourd'hui, et il faut le dire
///
/// **`.videoCameraReady` n'a AUCUN producteur dans le dépôt** — mesuré : le cas
/// est déclaré par `ComposerOpening` et aucune fabrique de `ComposerProfile` ne
/// le pose. Aucune porte n'ouvre donc encore le viseur en vidéo, et cette règle
/// ne change rien à l'écran tant que ce sera vrai.
///
/// Elle est écrite quand même, et ce n'est pas de l'UI morte : elle ferme un
/// écart LATENT entre ce qu'un type SOMME promet et ce que ses consommateurs
/// lisent. Le jour où une porte posera `.videoCameraReady`, elle sera honorée
/// sans qu'on ait à s'en souvenir — au lieu d'ouvrir un viseur photo en silence,
/// comme elle l'aurait fait aujourd'hui.
///
/// > Le contraire de cette décision serait de retirer le cas. C'est la seule
/// > autre réponse honnête, et elle appartient au produit, pas à ce fichier.
/// > Suivi : #4998.
///
/// Le `switch` est exhaustif : un sixième mode d'ouverture ne compilera pas
/// tant qu'il n'aura pas dit quel viseur il promet.
nonisolated enum ComposerCameraMode {
    static func mode(for opening: ComposerOpening) -> CameraCaptureMode {
        switch opening {
        case .videoCameraReady: return .video
        case .cameraReady, .keyboardOnContent, .moodGrid, .resume, .mediaSeeded: return .photo
        }
    }
}

/// **QUI peint le chrome de publication — audience, aperçu, flèche — sous la
/// surface que le meuble a montée.**
///
/// La règle vit ICI, à côté de `ComposerSurfaceRouting`, pour exactement la même
/// raison qu'elle : elle est éprouvable sans monter la moindre vue. Elle
/// remplace une CONSTANTE (`chromeOwner: ComposerChromeOwner = .atelier`) qui
/// portait, pour les trois surfaces, une raison qui n'en concernait qu'une.
///
/// Les deux blocages qui imposaient `.atelier` sont MESURÉS, et ce sont des
/// blocages de la SCÈNE, tous deux dans `MeeshyUI` : `visibilityMenu` est
/// l'unique écrivain d'audience de l'atelier, et l'œil du socle rendrait un
/// aperçu amputé des médias préchargés, `internal` au SDK. Sous le document et
/// sous le mood, **il n'y a pas d'atelier** — rien à retirer à personne, aucun
/// média local à précharger. Une raison qui ne vaut que pour l'une des trois
/// surfaces n'a rien à faire dans une constante qui les gouverne toutes.
nonisolated enum ComposerChromeOwnership {

    /// `.scene` cède à l'atelier ; les deux autres reviennent au meuble.
    ///
    /// Ce n'est pas « le host publie » : c'est « le host PEINT le chrome ».
    /// L'envoi reste une fermeture que le site de montage fournit
    /// (`MeeshyComposerHost.onPublishDocument`) — le meuble transmet.
    /// **RETOURNÉE au #4135.** `.scene` cédait à l'atelier ; les TROIS
    /// surfaces reviennent désormais au meuble.
    ///
    /// La bascule tient en une ligne ; ce qui l'a retenue jusqu'ici, ce sont
    /// deux blocages MESURÉS, et ils sont levés — pas contournés :
    ///
    /// | blocage | ce qui le lève |
    /// |---|---|
    /// | le sélecteur de l'atelier était l'UNIQUE écrivain de sa `visibility` | `ComposerPublishTrigger.requestedVisibility` : le socle apporte l'audience AU MOMENT DU GESTE, et `publishedVisibility(requested:atelier:)` dit laquelle est servie |
    /// | l'œil de l'atelier rend l'aperçu avec SES médias préchargés | `requestPreview()` : l'atelier EXÉCUTE l'aperçu, le meuble ne fait que presser |
    ///
    /// Le premier n'était pas un défaut d'affichage mais une fuite de
    /// confidentialité : un contenu « Amis » publié en « Public » ne se
    /// rattrape pas. C'est pourquoi il se prouve sur la valeur SERVIE, jamais
    /// sur ce que le socle affiche.
    static func owner(for surface: ComposerSurfaceKind) -> ComposerChromeOwner {
        .host
    }

    /// Les zones que le socle peint RÉELLEMENT sous une surface donnée.
    ///
    /// La loi 5 dit que le socle ne varie jamais selon la PORTE. Elle n'a jamais
    /// dit qu'il peignait une commande sans objet : il s'efface déjà devant
    /// l'atelier, qui peint les mêmes zones. La même phrase, tenue jusqu'au
    /// bout, donne les trois lignes ci-dessous.
    ///
    /// - `.scene` — RIEN. L'atelier assemble les trois ; en peindre une seconde
    ///   série donnerait deux audiences, deux yeux et deux flèches, dont une
    ///   inerte, sur la surface de création la plus utilisée.
    /// - `.document` — l'audience et la flèche, personne d'autre ne les
    ///   peignant. **L'œil en est parti le 2026-08-24, par RETRAIT et non par
    ///   réparation.** Il ouvrait `MeeshyScenePlayer` sur
    ///   `viewModel.currentEffects`, que la surface document ne remplit pas :
    ///   une scène VIDE. La cause a SURVÉCU à l'arrivée de la rangée d'outils —
    ///   le seul outil servi (`ComposerDocumentTool.effect`) insère du TEXTE et
    ///   ne rapporte aucun média, donc toujours rien à prévisualiser. Un outil
    ///   peint n'est pas un chemin d'ingestion, et confondre les deux
    ///   rebrancherait l'œil sur le même vide. Une dette CONSIGNÉE reste de l'UI morte tant qu'elle
    ///   est peinte, et la loi 4 ne fait pas d'exception pour ce qui est écrit
    ///   dans un doc-comment. La loi 6 ferme l'autre issue : fabriquer un
    ///   aperçu maison du texte serait un quatrième chemin de rendu. L'œil
    ///   revient le jour où le document a des médias à montrer, pas avant.
    ///
    ///   **Ce jour est le 2026-08-27, et la condition est tenue au mot.** Depuis
    ///   #4038, chaque média du post EST une slide dont il est le fond : la
    ///   surface document a enfin quelque chose à montrer. L'œil revient donc —
    ///   mais SEULEMENT quand la scène existe (`documentHasScene`), jamais sur
    ///   un post de texte nu, qui rouvrirait exactement le vide d'où il venait.
    ///   Et il ne fabrique aucun aperçu : il remet les slides au LECTEUR
    ///   (`StoryViewerView`, `isPreviewMode: true`) que la porte du média de
    ///   conversation monte déjà — un seul chemin de rendu, pas un quatrième.
    ///
    ///   L'audience, elle, RESTE — et elle CHOISIT depuis le même lot
    ///   (`MeeshyComposerHost.audienceChip`), avec la mémoire du format post
    ///   (`ComposerAudienceMemory.postKey`).
    /// - `.mood` — RIEN, depuis le 2026-08-28. L'audience est ABSENTE, jamais
    ///   grisée (loi 4) : `ComposerMoodSurface` porte son propre sélecteur six
    ///   niveaux, dans le RUBAN de son bloc 3, avec la mémoire du format status
    ///   (`ComposerAudienceMemory.statusKey`, loi 10). En peindre un second au
    ///   socle ferait deux contrôles pour un même réglage sur un même écran.
    ///
    ///   **La flèche a rejoint l'audience dans cette colonne « peinte
    ///   ailleurs » au 2026-08-28** — elle vivait ici seule jusque-là. Elle
    ///   n'est pas partie : elle s'est déplacée dans l'EN-TÊTE de la surface
    ///   (`ComposerMoodSurface.header`, à droite de la croix), pour la même
    ///   raison de PLACE que l'audience avant elle — deux zones du chrome de
    ///   publication qui vivent désormais dans le corps de la vue plutôt que
    ///   dans une rangée basse séparée, ce qui laisse la place, sous la
    ///   saisie, de voir les mentions sans faire défiler la feuille.
    ///   `headerPaintsPublish(for:)` ci-dessous dit où elle vit ; le chrome
    ///   reste `.host` (`owner(for:)`, inchangé) — c'est la MÊME main qui
    ///   peint, à un autre endroit de l'écran.
    ///
    ///   L'œil reste absent pour une raison plus dure : un mood n'a pas de
    ///   canvas, et la loi 6 interdit d'en fabriquer un aperçu.
    ///
    /// **Divergence ASSUMÉE avec le plan du lot 4**, qui écrivait « sous `.mood`
    /// … audience + flèche ». La mesure a tranché contre lui, et le dire ici vaut
    /// mieux que de le laisser découvrir à l'écran.
    /// `documentHasScene` a un DÉFAUT `false`, et c'est le défaut SÛR : un
    /// appelant qui l'ignore obtient le socle SANS œil, jamais un œil sur un
    /// document vide. Le paramètre n'est pas un `if` déplacé dans un `body` —
    /// il reste dans la RÈGLE, donc éprouvable sans monter une vue, ce que la
    /// note en tête de ce type demande explicitement.
    static func socleZones(
        for surface: ComposerSurfaceKind,
        documentHasScene: Bool = false,
        /// L'œil du socle sous la SCÈNE n'existe que si l'atelier l'a armé
        /// (#4135) — loi 4 : un contrôle qu'aucun corps n'exécute est absent,
        /// jamais peint puis inerte. Défaut `false`, le sens sûr.
        atelierOffersPreview: Bool = false
    ) -> [ComposerTopBarControl] {
        switch surface {
        case .scene:
            // **RETOURNÉ au #4135** : le socle y peignait RIEN, l'atelier
            // assemblant les trois. Depuis que `owner(for:)` rend `.host`
            // partout, l'atelier n'en assemble plus aucune — les peindre ici
            // n'en double donc aucune, et ne pas les peindre les ferait
            // disparaître.
            return atelierOffersPreview
                ? [.audience, .preview, .publish]
                : [.audience, .publish]
        case .document: return documentHasScene
            ? [.audience, .preview, .publish]
            : [.audience, .publish]
        case .mood: return []
        }
    }

    /// **QUI, sous une surface `.host`, peint la flèche dans son PROPRE
    /// en-tête plutôt que dans le socle du bas.**
    ///
    /// Une RÈGLE pure de plus, séparée de `socleZones` pour la question
    /// qu'elle répond : `socleZones` dit ce que le socle peint ; celle-ci dit
    /// OÙ va ce qu'il ne peint plus. Les deux doivent rester cohérentes —
    /// `MeeshyComposerHostGuardTests
    /// .test_lesZonesDuSocle_sontVides_exactementLaOuLaPublicationEstAssembleeAilleurs`
    /// le tient : le socle est vide exactement là où l'atelier OU l'en-tête de
    /// la surface publie.
    ///
    /// Seul `.mood` répond `true` aujourd'hui : le document garde sa flèche au
    /// socle (sa surface n'a pas d'en-tête propre à elle — `ComposerTopBar`
    /// est le chrome PARTAGÉ des trois surfaces, pas celui du document seul),
    /// et la scène publie par l'atelier, jamais par ceci.
    static func headerPaintsPublish(for surface: ComposerSurfaceKind) -> Bool {
        surface == .mood
    }
}

/// **La bande-son de la PUBLICATION, au socle (#4071 — vues `1a` et `1b`).**
///
/// La maquette la range « parmi ce qui décide de l'envoi », avec l'audience,
/// l'aperçu et Publier — pas dans les outils qui font entrer de la matière sur
/// la scène. C'est cohérent avec ce qu'elle EST : un son de fond appartient à
/// la publication entière, pas à la slide courante.
///
/// **Ce que cette place répare.** La porte son existait et sa feuille était
/// complète — enregistreur, rôle de mixage, bibliothèque, fichier. La
/// vérification au simulateur du 2026-08-30 a montré qu'aucun écran du parcours
/// réel n'y menait depuis le document : le chemin manquait, pas la surface.
///
/// **Le CRÉDIT d'un son — ce qui joue, et à qui on le doit** (#4669).
///
/// La règle a quitté le socle avec la pastille qui l'y montrait (directive
/// porteur 2026-09-01 : « on n'a plus besoin du bouton ajouter un son en bas »)
/// et suit le son là où il se lit maintenant : à côté de l'avatar.
///
/// **Le déménagement n'était pas cosmétique.** La pastille du socle était le
/// SEUL endroit du composer qui affichait `soundAuthorUsername` ; la retirer
/// sans emporter sa composition aurait fait disparaître l'attribution d'un son
/// emprunté — une perte qu'aucun témoin n'aurait signalée, puisque rien
/// n'assertait qu'elle était montrée quelque part.
///
/// Ce que la règle ne fait plus : inviter. « Ajouter un son » était le mot de
/// la pastille VIDE, et une pastille vide n'existe plus — un crédit décrit un
/// son qui joue, ou n'est pas rendu du tout. Le paramètre a donc cessé d'être
/// optionnel : le cas « pas de son » se traite chez l'appelant, en ne montrant
/// rien, et non ici en fabriquant une phrase.
/// **Ce qui reste ICI, et ce qui est parti** (fusion 2026-09-01).
///
/// La règle avait une JUMELLE au SDK — `StoryAudioIdentity` — écrite le même
/// jour pour la même question, et les deux ne rendaient pas la même réponse :
/// `attribution` lisait `name` et `soundAuthorUsername` en direct, sans jamais
/// consulter `soundId`, si bien qu'un vocal NOMMÉ s'annonçait comme un morceau
/// de l'étagère. Ce qui décide de la FORME d'une piste est parti là-bas, en un
/// seul exemplaire.
///
/// Ce qui reste ici est ce qui ne peut pas y aller : la LOCALE du lecteur. Une
/// durée s'écrit « 0:12 » pour l'œil et se dit « douze secondes » à voix haute,
/// et les deux dépendent de la langue de l'appareil — le SDK, qui ne connaît ni
/// l'une ni l'autre, ne peut composer que la moitié invariable.
///
/// > La frontière n'est donc pas « app ou SDK » mais **ce qui dépend du lecteur
/// > et ce qui dépend de la piste**. C'est la seule qui ne se redessine pas au
/// > premier champ ajouté.
nonisolated enum ComposerSoundCredit {

    /// **Le crédit ne se fabrique jamais.** Il tient à `soundAuthorUsername`,
    /// que seul l'EMPRUNT renseigne ; un vocal mis en fond porte le bon mixage
    /// et aucun auteur, et lui en inventer un serait mentir sur la provenance.
    /// De même une durée inconnue ne devient pas « 0:00 » — un compteur faux se
    /// lit comme une piste vide.
    static func label(for sound: StoryAudioPlayerObject,
                      locale: Locale = .current) -> String {
        compose(sound, locale: locale) { LocalizedNumber.duration(seconds: $0, locale: $1) }
    }

    /// **La pastille est LUE à voix haute, et « 0:12 » ne se dit pas.**
    ///
    /// L'hôte posait `.accessibilityLabel(Text(label(for:)))` — la chaîne
    /// MONTRÉE, resservie telle quelle. VoiceOver y lit une horloge : « zéro
    /// heure douze » pour un extrait de douze secondes. La doctrine du dépôt
    /// sépare les deux depuis 247i — `LocalizedNumber.duration` pour ce qu'on
    /// VOIT, `spokenDuration` pour ce qu'on ENTEND — et cette pastille était
    /// le site où les deux étaient confondus.
    ///
    /// > Une chaîne qui sert à la fois de libellé visuel et de libellé
    /// > d'accessibilité n'est pas une économie : c'est une décision prise pour
    /// > l'un des deux lecteurs et subie par l'autre.
    ///
    /// Le titre et le crédit sont IDENTIQUES dans les deux — c'est la même
    /// pastille — et c'est pourquoi la composition est un site UNIQUE : deux
    /// fonctions écrites côte à côte auraient divergé au premier champ ajouté.
    static func spokenLabel(for sound: StoryAudioPlayerObject,
                            locale: Locale = .current) -> String {
        compose(sound, locale: locale) { LocalizedNumber.spokenDuration(seconds: $0, locale: $1) }
    }

    /// **Un son sans titre n'en reçoit pas un d'emprunt.**
    ///
    /// La composition posait « Ajouter un son » comme nom de repli — ce qui
    /// avait un sens tant qu'elle habillait un BOUTON d'ajout, et n'en a plus
    /// aucun sur une pastille d'état : un vocal se serait annoncé « Ajouter un
    /// son · 0:07 », une invitation servie comme un titre. Sans titre, le crédit
    /// est sa seule durée.
    /// La DURÉE seule, telle qu'on la VOIT. `nil` quand elle est inconnue — un
    /// « 0:00 » fabriqué se lit comme une piste vide.
    static func durationLabel(for sound: StoryAudioPlayerObject,
                              locale: Locale = .current) -> String? {
        guard let secondes = sound.duration, secondes > 0 else { return nil }
        return LocalizedNumber.duration(seconds: Int(secondes.rounded()), locale: locale)
    }

    /// **La composition reste UNIQUE** : elle APPELLE les deux moitiés plutôt
    /// que de recomposer leur contenu. Deux assemblages écrits côte à côte
    /// auraient divergé au premier champ ajouté — et c'est justement ce que la
    /// séparation ci-dessus rendait tentant.
    private static func compose(_ sound: StoryAudioPlayerObject,
                                locale: Locale,
                                duree: (Int, Locale) -> String) -> String {
        var morceaux: [String] = []
        let credit = StoryAudioIdentity.attribution(of: sound)
        if !credit.isEmpty { morceaux.append(credit) }
        if let secondes = sound.duration, secondes > 0 {
            morceaux.append(duree(Int(secondes.rounded()), locale))
        }
        return morceaux.joined(separator: " · ")
    }
}

/// **Ce que le `⋯` de la barre haute a le droit d'offrir (#4047).**
///
/// Une RÈGLE pure, du même patron que `ComposerChromeOwnership` : ce qui décide
/// des entrées d'un menu est éprouvable sans monter une vue, et l'écrire dans
/// un `body` en ferait une condition qu'aucune assertion ne peut atteindre.
///
/// **Le menu ne reprend PAS les entrées de l'atelier**, et il faut dire
/// pourquoi : Transitions et Timeline outillent une SCÈNE COMPOSÉE, que la
/// surface document n'édite pas ; « Supprimer tous les slides » a déjà son
/// geste — le ✕ de chaque chip du rail ; et « Sauvegarder le brouillon » n'a
/// aucun chemin ici (le magasin de brouillons est celui des STORIES, et un
/// brouillon de post n'a ni la même forme ni le même publieur). Reprendre une
/// entrée par ressemblance de nom aurait donné un menu qui promet quatre
/// choses et n'en fait aucune.
///
/// Restent les gestes que le document sait faire et que RIEN d'autre à l'écran
/// ne fait :
///
/// - **choisir le fond** — le SYMÉTRIQUE de l'entrée suivante, arrivé par le
///   même défaut dans l'autre sens (#4064). Sur la surface DOCUMENT, la palette
///   s'ouvre par l'icône de fond de la rangée d'outils ; sur la surface de
///   SCÈNE cette rangée n'existe plus — le chrome est passé aux deux rails — et
///   aucune porte ne fait entrer une COULEUR, qui n'est pas un `MeeshyObject`.
///   La palette y était donc devenue INATTEIGNABLE : on pouvait retirer le
///   fond, jamais en changer.
/// - **retirer le fond** — poser une couleur était une porte à SENS UNIQUE :
///   la bande de pastilles l'écrit, et aucun contrôle ne l'effaçait. Un post
///   devenu toile ne pouvait plus redevenir un post sans toile.
/// - **tout effacer** — le jumeau document de « Supprimer tous les slides ».
///   Il porte plus loin que le rail : le rail retire les MÉDIAS un à un, celui-ci
///   emporte aussi le texte, le fond, le lieu et la transcription.
nonisolated enum ComposerOverflowEntry: Equatable, CaseIterable {
    case pickBackground
    case removeBackground
    /// **Bake la scène et l'écrit dans Photos** (#4996). Ne touche JAMAIS le
    /// backend : c'est la doctrine « RAW publish + author-only export », de
    /// l'autre côté de la frontière que `runStoryUpload` a l'interdiction de
    /// franchir.
    case saveToPhotos
    /// Même bake, remis à `UIActivityViewController` — Messages, WhatsApp,
    /// AirDrop, Fichiers.
    case share
    case clearAll
}

nonisolated enum ComposerOverflowPolicy {

    /// Les entrées SERVIES, dans l'ordre où elles se peignent. Vide ⇒ **aucun
    /// `⋯`** : un menu à zéro entrée est un bouton qui n'ouvre rien, et la loi 4
    /// ne fait pas d'exception pour les menus.
    ///
    /// `clearAll` ne se sert PAS sur un composer vierge — « tout effacer »
    /// n'aurait rien à effacer, et l'offrir dirait à l'auteur qu'il a composé
    /// quelque chose qu'il ne retrouve pas.
    ///
    /// **`backgroundPickerIsReachable` dit un FAIT D'ÉCRAN, pas une surface**, et
    /// c'est délibéré : la règle n'a pas à savoir laquelle des quatre vues est
    /// montée, seulement si la palette a DÉJÀ un chemin. Son défaut est `true` —
    /// le défaut SÛR : un appelant qui l'ignore n'obtient jamais un DOUBLON de
    /// contrôle, au pire une entrée manquante que l'écran offre ailleurs.
    /// **`hasScene` gouverne les deux entrées d'EXPORT, et rien d'autre**
    /// (#4996).
    ///
    /// Elle est distincte de « il y a de la matière » : un post fait d'un texte
    /// et d'un lieu a bien de quoi être EFFACÉ, et rien à baker — le pipeline
    /// d'export part d'une `StorySlide`, et une composition sans scène n'en a
    /// aucune à lui donner. Servir les deux entrées sur cette base ouvrirait un
    /// bake qui rendrait un MP4 vide, ce que la loi 4 interdit sous sa forme la
    /// plus coûteuse : un contrôle qui FAIT quelque chose d'inutile.
    ///
    /// Son défaut est `false` — le défaut SÛR : un appelant qui l'ignore
    /// n'obtient jamais une entrée qui promet un export impossible.
    static func entries(
        hasBackground: Bool,
        hasMedia: Bool,
        hasText: Bool,
        hasLocation: Bool,
        hasScene: Bool = false,
        backgroundPickerIsReachable: Bool = true
    ) -> [ComposerOverflowEntry] {
        var served: [ComposerOverflowEntry] = []
        if !backgroundPickerIsReachable { served.append(.pickBackground) }
        if hasBackground { served.append(.removeBackground) }
        if hasScene {
            served.append(.saveToPhotos)
            served.append(.share)
        }
        // **`clearAll` FERME la liste, toujours.** C'est la seule entrée
        // destructrice ; la ranger au milieu la mettrait sous le pouce qui vise
        // « Transférer », et un menu se lit du haut vers le bas.
        if hasBackground || hasMedia || hasText || hasLocation || hasScene {
            served.append(.clearAll)
        }
        return served
    }
}

/// Libellés du `⋯`, résolus par le catalogue `.main` — même idiome que
/// `ComposerFormatCopy`. Écrits ici plutôt qu'en littéraux dans la vue : un
/// libellé posé en ligne échappe au cliquet de complétude et n'est jamais
/// traduit.
nonisolated enum ComposerOverflowCopy {
    static func label(_ entry: ComposerOverflowEntry) -> String {
        switch entry {
        case .pickBackground:
            return String(localized: "composer.overflow.pickBackground",
                          defaultValue: "Couleur de fond", bundle: .main)
        case .removeBackground:
            return String(localized: "composer.overflow.removeBackground",
                          defaultValue: "Retirer le fond", bundle: .main)
        case .saveToPhotos:
            return String(localized: "composer.overflow.saveToPhotos",
                          defaultValue: "Enregistrer", bundle: .main)
        case .share:
            return String(localized: "composer.overflow.share",
                          defaultValue: "Transférer", bundle: .main)
        case .clearAll:
            return String(localized: "composer.overflow.clearAll",
                          defaultValue: "Tout effacer", bundle: .main)
        }
    }

    static func icon(_ entry: ComposerOverflowEntry) -> String {
        switch entry {
        case .pickBackground: return "paintpalette.fill"
        case .removeBackground: return "paintpalette"
        // `arrow.down.to.line` et non `square.and.arrow.down` : le second est
        // le glyphe de TÉLÉCHARGEMENT, et ce qu'on fait ici est une écriture
        // locale. `square.and.arrow.up` reste le partage, comme partout.
        case .saveToPhotos: return "arrow.down.to.line"
        case .share: return "square.and.arrow.up"
        case .clearAll: return "trash"
        }
    }

    static var menu: String {
        String(localized: "composer.a11y.moreOptions",
               defaultValue: "Plus d'options", bundle: .main)
    }
}

/// **La mémoire d'audience — une par FORMAT (loi 10), et sa relecture.**
///
/// Deux choses que rien ne doit séparer : sous QUELLE clé une audience se
/// souvient, et CE QU'ELLE REND quand on la relit. Les tenir ensemble est ce qui
/// répare la forme précédente — `StatusComposerView` écrivait la clé dans la vue
/// et la relisait dans la même vue, si bien qu'aucun test ne pouvait dire ce
/// qu'une mémoire corrompue devait rendre.
///
/// **Une clé par format, jamais une pour tous.** Le cas qui commande : un auteur
/// restreint son mood à trois personnes. Sous une mémoire partagée, le post
/// qu'il écrit ensuite s'ouvrirait en `ONLY` sur ces trois personnes — un
/// rétrécissement d'audience que rien à l'écran n'annoncerait.
nonisolated enum ComposerAudienceMemory {

    /// La mémoire du format status — **celle de l'écran historique**, à l'octet
    /// près. Une clé neuve en ferait une seconde mémoire, donc deux réglages à
    /// faire diverger pour un seul geste d'auteur.
    static let statusKey = "lastStatusVisibility"

    /// La mémoire du format post. `FeedComposerSheet` n'en avait AUCUNE — son
    /// audience repart à `PUBLIC` à chaque ouverture. C'est donc une capacité
    /// que le meuble AJOUTE, et non une parité qu'il tient : le dire évite qu'on
    /// la lise plus tard comme une régression de la feuille historique.
    static let postKey = "lastPostVisibility"

    /// `nil` sous la scène, et c'est une RÉPONSE, pas un trou : l'atelier reçoit
    /// sa graine par `initialVisibility`, que le tray alimente depuis
    /// `lastComposerVisibility`. Le socle n'y peint aucune audience
    /// (`ComposerChromeOwnership.socleZones(for: .scene)` est vide), et lui
    /// inventer une mémoire ici en ferait une seconde à faire diverger de celle
    /// du tray.
    ///
    /// Le `switch` reste exhaustif : un cinquième format casse la compilation
    /// ICI, avant de pouvoir hériter d'une mémoire par défaut.
    static func key(for format: ComposerFormat) -> String? {
        switch format {
        case .status: return statusKey
        case .post: return postKey
        case .story, .reel: return nil
        }
    }

    /// Ce qu'une mémoire rend quand on la relit — `.public` dès qu'elle porte
    /// autre chose qu'une audience relisible ET exploitable.
    ///
    /// **TROIS replis, et ils répondent à DEUX questions distinctes.** Les deux
    /// premiers demandent « cette valeur est-elle LISIBLE ? » : une valeur
    /// INCONNUE (mémoire d'une version antérieure, réglage effacé) se voit tout
    /// de suite ; une valeur connue mais HORS OFFRE est plus coûteuse, aucun
    /// chip ne la montre et l'auteur publierait sous un réglage qu'aucun écran
    /// ne lui a dit.
    ///
    /// Le troisième demande « une fois relue, est-elle EXPLOITABLE ? », et c'est
    /// une autre question. `ONLY` et `EXCEPT` sont parfaitement lisibles,
    /// parfaitement offertes — et leur portée EST la liste d'utilisateurs qui
    /// les accompagne, que cette mémoire ne porte PAS : elle ne persiste qu'un
    /// `rawValue`. Les relire telles quelles restaurait donc une audience
    /// nominative avec une liste vide, que `CreatePostSchema` refuse
    /// (« EXCEPT and ONLY visibility require at least one userId in
    /// visibilityUserIds »). Et comme rien ne réécrit la mémoire sur un échec,
    /// la publication échouait à CHAQUE ouverture suivante — un seul post
    /// restreint suffisait à bloquer durablement la porte.
    ///
    /// Persister la liste À CÔTÉ du mode serait l'autre réponse possible ; elle
    /// est refusée ici : une liste d'identifiants qui survit à la session
    /// ressusciterait, des semaines plus tard, une audience que l'auteur ne
    /// reverrait qu'après avoir publié.
    /// Ce qu'une chaîne vaut comme audience RELISABLE : elle doit exister,
    /// appartenir à l'offre du composer, et ne pas exiger une liste de personnes
    /// qu'aucune mémoire ne transporte. `nil` = « cette source ne dit rien »,
    /// distinct de « cette source dit public » — c'est cette distinction que
    /// `seed` a besoin de lire pour passer au rang suivant.
    private static func selectable(_ rawValue: String?) -> PostVisibility? {
        guard let rawValue,
              let value = PostVisibility(rawValue: rawValue),
              PostVisibility.composerSelectableCases.contains(value),
              !value.requiresUserSelection else {
            return nil
        }
        return value
    }

    static func remembered(_ rawValue: String?) -> PostVisibility {
        selectable(rawValue) ?? .public
    }

    /// **La graine du sélecteur du socle, dans l'ordre où les sources font
    /// autorité** (#4135).
    ///
    /// Elle existe parce que `key(for:)` rend `nil` en STORY et en RÉEL : ces
    /// deux formats n'ont pas de mémoire à eux, et c'est délibéré — leur graine
    /// vient de la PORTE (`initialVisibility`, que le tray remplit depuis
    /// `lastComposerVisibility`). Leur en donner une ici en ferait une seconde,
    /// à faire diverger de celle du tray.
    ///
    /// Tant que le socle ne peignait rien sous la scène, l'absence de clé était
    /// sans conséquence. Depuis que le socle y peint l'audience SERVIE (#4135),
    /// retomber sur `.public` publierait sous une audience que l'auteur n'a pas
    /// choisie — la seule erreur irréversible d'une publication. La graine de la
    /// porte devient donc le second rang, avant le repli.
    ///
    /// L'ordre se lit : la mémoire du format quand il en a une, sinon la graine
    /// de la porte, sinon `.public`. Chaque rang passe par `remembered`, qui
    /// écarte ce qui n'appartient pas à l'offre — une graine de porte périmée ne
    /// peut donc pas rentrer par cette porte-là.
    static func seed(rememberedRaw: String?, doorRaw: String?) -> PostVisibility {
        selectable(rememberedRaw) ?? selectable(doorRaw) ?? .public
    }
}

/// **Ce qu'un écran a le DROIT de proposer comme audience** — l'offre, distincte
/// de la mémoire qui en choisit une.
///
/// Elle vit à côté de `ComposerAudienceMemory` parce que les deux tiennent
/// ensemble un même invariant : *ce que la mémoire rend appartient toujours à
/// l'offre*. Séparées, un chip s'ouvrirait sans marque et l'auteur publierait
/// sous un réglage qu'aucun écran ne lui aurait dit —
/// `test_touteMemoireRelue_appartientALOffre_desDeuxCotesDeLaRepublication` le
/// tient.
///
/// # Pourquoi une REPUBLICATION n'offre pas les six
///
/// `EXCEPT` et `ONLY` ne se lisent pas seules : leur portée EST la liste
/// d'utilisateurs qui les accompagne. Sur une republication, cette liste vient
/// de la SOURCE — `StoryRepostAudience.inheritsAudienceList`, miroir de
/// `repostVisibilityInheritsAudienceList` que `PostService.createPost` applique
/// en REMPLAÇANT `data.visibilityUserIds` par ceux de l'original.
///
/// Le sélecteur nominatif était donc peint, ouvrable, renseignable — et son
/// résultat n'avait aucun effet (loi 4 : un contrôle existe s'il a un EFFET).
/// Pire : republier une humeur PUBLIQUE en `ONLY` produisait un post `ONLY`
/// portant la liste vide de la source, c'est-à-dire visible de PERSONNE, sur une
/// feuille qui s'était refermée sur un succès.
///
/// # Ce que cette règle ne fait PAS, et pourquoi elle ne le peut pas
///
/// Elle ne plafonne pas l'ÉLARGISSEMENT — republier en `PUBLIC` une humeur
/// `FRIENDS` —, que le serveur refuse par un 403 `REPOST_AUDIENCE_WIDENING` et
/// que `StoryRepostAudience.allowed(from:)` saurait plafonner… si le client
/// connaissait l'audience de l'original.
///
/// Il ne la connaît pas, et le canal est mort UNE COUCHE plus bas que là où on
/// le cherche : `StatusEntry` porte bien un `visibility`, mais
/// `APIPost.toStatusEntry()` ne le lui passe pas — il vaut `nil` pour TOUTE
/// humeur que l'app affiche. Semer `visibility:` dans les graines de
/// republication donnerait donc `StoryRepostAudience.allowed(fromRawValue: nil)`,
/// c'est-à-dire `[.private]` : un ruban à UN chip sur chaque republication, la
/// loi 4 défaite dans l'autre sens.
///
/// **Condition de levée, en deux parties et dans cet ordre** : (1)
/// `toStatusEntry()` transmet `visibility` — une ligne, `StoryModels.swift`,
/// hors du dossier Composer ; (2) cette règle prend l'audience de l'original et
/// la passe à `StoryRepostAudience.allowed(from:)`, l'intersection restant
/// ordonnée par `composerSelectableCases`. Elle est mesurée par
/// `test_lOffre_dUneRepublication_nePlafonnePasLElargissement_fauteDeConnaitreLaSource`,
/// qui se RETOURNE ce jour-là.
nonisolated enum ComposerAudienceOffer {

    /// - Parameter origin: la PORTE. C'est elle qui sait si l'on republie
    ///   (`ComposerOrigin.repostedPostId`), et la lire ici évite qu'un site de
    ///   montage recopie ce fait dans un drapeau — deux sources pour une même
    ///   question.
    static func offered(for origin: ComposerOrigin) -> [PostVisibility] {
        guard origin.repostedPostId != nil else { return PostVisibility.composerSelectableCases }
        return PostVisibility.composerSelectableCases.filter {
            !StoryRepostAudience.inheritsAudienceList($0)
        }
    }
}
