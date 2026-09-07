import Foundation
import MeeshySDK

// **Ce qui décide d'un ENVOI de document** — par où il part, ce qui le refuse,
// et ce que le publieur en a fait.
//
// Extrait de `ComposerDocumentRules.swift` le 2026-09-06 : ce fichier passait à
// 1222 lignes contre un plafond DUR de 1200, et la directive du 2026-08-28 dit
// d'EXTRAIRE avant d'ajouter — jamais de monter le plafond, « une dette héritée
// ne se solde pas en montant le plafond ».
//
// La coupe suit une QUESTION ENTIÈRE, pas une tranche : « ce brouillon a-t-il le
// droit de partir, et par où ? ». Les cinq types qui y répondent voyagent
// ensemble — le chemin, son aiguillage, le refus, le plan qui les compose, et
// l'issue que le publieur rend — et aucun n'a de sens sans les autres. Ce qui
// reste dans `ComposerDocumentRules` répond à d'autres questions : ce qu'un
// outil fait entrer, ce que la flèche a le droit de publier, les mots que la
// surface emploie.
//
// > Les DEUX types d'issue restent ici ensemble à dessein : le plan demande
// > « ce brouillon a-t-il le droit de partir ? », l'issue demande « le publieur
// > l'a-t-il pris ? ». Les fondre aurait fait porter au plan une réponse qu'il
// > ne peut pas avoir — c'est le trou qui a laissé le `Bool` de
// > `onPublishDocument` sans le moindre émetteur de `false` pendant deux lots.

/// Par où part un document — la troisième capacité que la spec nomme, et la
/// seule dont l'oubli PERD du contenu.
///
/// Mesuré sur `FeedComposerSheet` le 2026-08-23, chemin par chemin :
/// - texte seul → `FeedViewModel.createPost`, qui enfile un post durable quand
///   le réseau manque (« survives offline + app kill ») ;
/// - média + hors ligne → `createOfflineMediaPost`, la file durable, avec sa
///   preview locale et son flush à la reconnexion ;
/// - média + en ligne → l'upload tus puis `createPost` ;
/// - citation → `repostPost`, un appel réseau DIRECT.
///
/// Les deux premiers sont durables, le quatrième ne l'est pas — et c'est
/// consigné ici pour que personne ne le découvre au moment de recâbler la
/// porte.
nonisolated enum ComposerDocumentSendPath: Equatable {
    /// La citation : `POST /posts/:id/repost`. Pas de file durable.
    case quotedRepost
    /// Texte (ou lieu) seul : durable des DEUX côtés du réseau — **chez le
    /// publieur qui l'enfile lui-même**.
    ///
    /// La nuance n'est pas rhétorique : la durabilité est une propriété du
    /// PUBLIEUR, jamais du contenu. `FeedViewModel.createPost` enfile sa branche
    /// texte sans consulter la connectivité — mesuré, ce modèle n'a pas même
    /// d'`isOffline` —, ce qui rend ce chemin durable en ligne comme hors ligne.
    /// `StatusViewModel.setStatus` fait l'INVERSE sur la même forme de contenu :
    /// il n'atteint sa file que si `isOffline()` répond oui, et un échec réseau
    /// en ligne n'y laisse qu'un toast. Lire « textOnly donc durable » sans
    /// regarder QUI publie ferait donc certifier durable un envoi qui ne l'est
    /// pas.
    case textOnly
    /// La file durable — le seul chemin qui survit à un hors-ligne ET à un kill.
    case durableOutbox
    /// L'upload tus, puis la création. Ne vaut qu'en ligne : hors ligne il jette.
    case upload

    /// Ce qui survit à un hors-ligne suivi d'un kill de l'app.
    var isDurable: Bool {
        switch self {
        case .textOnly, .durableOutbox: return true
        case .quotedRepost, .upload: return false
        }
    }
}

/// **UN SEUL appelant depuis le lot 4.10 : `ComposerDocumentSendPlan`.**
///
/// Elle fut sans appelant, et l'assumait : le meuble ne publiait pas, l'unique
/// publieur était la barre du SDK, et la table ne valait que comme MESURE
/// consignée chemin par chemin de ce que la feuille historique fait réellement.
/// Cette mesure reste la sienne — c'est ce qu'aucun lot ultérieur ne pourra
/// redécouvrir sans relire `FeedComposerSheet` ligne à ligne.
///
/// Le meuble possède désormais l'ENVOI du document. `ComposerDocumentSendPlan`
/// l'interroge pour décider par où un brouillon a le droit de partir, et refuse
/// tout chemin qu'elle déclare non durable. Ce n'est pas un second chemin de
/// publication : la table ne publie rien, elle NOMME — l'envoi lui-même reste
/// chez le modèle du fil, qui possède l'outbox, le cache et la réconciliation
/// optimiste.
///
/// **La garde a été RETOURNÉE, jamais supprimée.**
/// `test_leRoutageDEnvoi_nAQuUnSeulAppelant_etCEstLeMeuble` exigeait zéro
/// appelant ; elle en exige exactement un, et vérifie qu'il vit dans le dossier
/// Composer. Un second interrogateur serait le second chemin d'envoi que la
/// doctrine, C2 et le lot 7 interdisent tous les trois — et il naîtrait là où
/// personne ne le cherche, puisque la table, elle, est désormais légitime.
nonisolated enum ComposerDocumentSendRouting {

    /// **Le média ne branche plus sur `isOffline` (résolution du blocage §B.3,
    /// vague 1b, 2026-08-26).** Mesuré : `FeedViewModel.publish` enfile sa
    /// ligne SANS condition réseau (doc-comment de `publish(_:)`,
    /// `FeedViewModel.swift:878-884` — « Aucune condition réseau ici, et c'est
    /// une décision »). Router un média EN LIGNE vers `.upload` refusait donc
    /// le cas NOMINAL : `ComposerDocumentSendPlan.plan` convertit tout chemin
    /// non durable en `.refuse`, et le seul publieur qui accepte ce chemin est
    /// déjà durable des deux côtés du réseau.
    ///
    /// - Parameter hasLocalMedia: une pièce jointe portée par un fichier LOCAL
    ///   — image, vidéo, document ou **son enregistré**. Depuis c10801bbca (lot
    ///   7.4b), les deux jumeaux audio de la feuille historique —
    ///   `publishAudioPost` (`FeedView+Attachments.swift:496`) et
    ///   `publishAudioFromSheet` (`FeedView+Attachments.swift:1867`) —
    ///   convergent sur `PublishIntent.audioRecording`, transporté tel quel par
    ///   `FeedViewModel.publish` (`FeedViewModel.swift:888`) jusqu'à
    ///   `enqueueDurableMediaPost`, qui enfile SANS condition réseau (doc-comment
    ///   de `publish(_:)` : « Aucune condition réseau ici, et c'est une
    ///   décision »). Un vocal composé hors ligne n'est donc plus perdu sur la
    ///   feuille historique non plus ; il part par la même file durable qu'un
    ///   fichier local ordinaire. La distinction que ce paramètre portait a
    ///   disparu avec l'exception qui la motivait — ce que `path` fait déjà
    ///   (`hasLocalMedia` reste un booléen unique, sans branche audio) n'a donc
    ///   plus besoin d'être justifié par un rattrapage : c'était la bonne règle
    ///   avant même que le jumeau historique la respecte. Rien à conclure pour
    ///   le routage lui-même (lot 2) ; ce qui change, c'est ce que la
    ///   PRÉMISSE peut désormais affirmer sans lui.
    static func path(
        isQuote: Bool,
        hasLocalMedia: Bool,
        isOffline: Bool
    ) -> ComposerDocumentSendPath {
        if isQuote { return .quotedRepost }
        guard hasLocalMedia else { return .textOnly }
        return .durableOutbox
    }
}

/// **Pourquoi un brouillon ne part PAS** — cinq raisons, et aucune n'est un
/// échec que l'auteur doive subir.
///
/// Chacune laisse le composer OUVERT, sa saisie intacte. C'est le seul geste de
/// cette chaîne qu'aucune garde de source ne rattraperait après coup : un
/// composer refermé sur un envoi perdu reste PLAUSIBLE — il se ferme exactement
/// comme quand tout va bien, et c'est ce qui rend cette perte-là silencieuse.
nonisolated enum ComposerDocumentSendRefusal: Equatable {

    /// Le brouillon n'est pas un post. Jumelle de la garde de format sortant du
    /// mood : un format sans publieur sur ce chemin n'a pas de traduction
    /// raisonnable, et le laisser passer fabriquerait un contenu d'un AUTRE type
    /// que celui que l'auteur a composé.
    case wrongFormat(ComposerFormat)

    /// Rien à publier. Ce n'est PAS une redite du gate de la flèche : celui-ci
    /// garde le BOUTON, celui-là garde l'ENVOI — et le publieur, lui, ne garde
    /// rien. Sa branche durable exige un texte non blanc pour s'ouvrir ; un
    /// brouillon vide retomberait donc sur son appel réseau direct, c'est-à-dire
    /// sur un envoi volatil obtenu en n'écrivant rien.
    case emptyDraft

    /// **Le brouillon porte de la matière, mais pas celle qu'un RÉEL exige**
    /// (#4869). Un réel est une vidéo, un son, ou au moins deux images —
    /// `ReelComposition.qualifiesAsReel`, le MIROIR exact de la règle serveur
    /// (`packages/shared/utils/reel-composition.ts`).
    ///
    /// Sans ce cas, un réel de texte seul partait et le serveur le DÉGRADAIT en
    /// post (`createPost: REEL non qualifiant dégradé en POST`) : l'auteur
    /// choisissait un format et en obtenait un autre, sans un mot. Refuser en le
    /// DISANT vaut mieux — c'est le seul des deux verdicts qu'il puisse réparer.
    case reelWithoutQualifyingMedia

    /// Le chemin existe mais ne survit ni au hors-ligne ni à un kill de l'app.
    /// Refuser vaut mieux qu'envoyer : un contenu perdu en silence coûte plus
    /// cher qu'un geste à refaire.
    case nonDurablePath(ComposerDocumentSendPath)

    /// Le publieur a refusé la ligne — file pleine, écriture impossible. Le
    /// texte porte ce que le modèle a rendu (`publishError`), jamais une phrase
    /// réinventée ici : deux formulations d'un même échec divergent au premier
    /// cas limite.
    case publisherRejected(String)

    /// Le publieur n'a ni confirmé ni refusé. **Le doute REFUSE** : fermer coûte
    /// le texte de l'auteur, ne pas fermer ne coûte qu'un geste, et des deux
    /// erreurs possibles une seule est réparable par celui qui la subit.
    case publisherSilent

    /// L'audience exige une liste nominative, et elle est VIDE. C'est le seul
    /// refus de cette liste que le gateway émet déjà de son côté —
    /// `CreatePostSchema` rejette `EXCEPT`/`ONLY` sans aucun `visibilityUserIds`
    /// (400 `VALIDATION_ERROR`). Le laisser partir produirait donc un échec
    /// certain, présenté à l'auteur comme une erreur générique.
    ///
    /// Il porte l'audience concernée plutôt qu'un booléen : c'est elle que
    /// l'écran nomme, et un refus qui ne sait pas dire QUOI est un refus qu'on
    /// ne peut pas traduire.
    case incompleteAudience(PostVisibility)
}

/// **Ce que le meuble a le droit d'envoyer, et par où** — la question posée
/// AVANT l'envoi.
///
/// C'est l'unique appelant de `ComposerDocumentSendRouting` : la table sait
/// ordonner ses trois questions, ce plan sait ce qu'un brouillon du meuble peut
/// répondre. Les fondre aurait fait porter à la table une connaissance du
/// brouillon qu'elle n'a pas, et à ce plan une règle de routage qu'il aurait
/// fallu recopier.
///
/// **`hasLocalMedia` dérive désormais le canal RÉEL du brouillon (T2.1).**
/// `ComposerDocumentDraft` portait ni identifiants de média, ni fichier — la
/// première capacité manquante du DoD du lot 2, comblée par `localMedia`. Un
/// littéral `false` serait redevenu un MENSONGE : une composition avec photo
/// partirait par le chemin texte en laissant son fichier sur place.
///
/// **`isOffline` traverse toujours SANS effet, et c'est désormais une
/// décision, pas une absence.** `ComposerDocumentSendRouting.path` route un
/// média EN LIGNE COMME HORS LIGNE vers `.durableOutbox` — la même règle que
/// `FeedViewModel.publish` (`FeedViewModel.swift:878-884` : « Aucune condition
/// réseau ici, et c'est une décision »). Le supprimer aurait fait de ce plan
/// une fonction du seul format, et il aurait fallu le rouvrir le jour où cette
/// décision serait remise en cause.
nonisolated enum ComposerDocumentSendPlan: Equatable {

    /// Le brouillon part, et par ce chemin-là.
    case send(ComposerDocumentSendPath)

    /// Le brouillon ne part pas, et voici pourquoi.
    case refuse(ComposerDocumentSendRefusal)

    static func plan(for draft: ComposerDocumentDraft, isOffline: Bool) -> ComposerDocumentSendPlan {
        // **Le RÉEL passe par ce plan depuis #4869.** Il partage tout ce que
        // le post exige — de la matière, une audience complète, un chemin
        // durable — et ne diffère que par le `type` déclaré au serveur, que
        // `PublishIntent.document` lit sur `draft.format.postType`.
        //
        // La STORY reste refusée, et ce n'est pas une omission : elle part par
        // le canal de la SCÈNE, qui publie une unité par slide. L'y faire
        // passer publierait une story vide de ses slides — le défaut que la
        // note de `performSoclePublish` décrit.
        guard draft.format == .post || draft.format == .reel else {
            return .refuse(.wrongFormat(draft.format))
        }
        // Un média SEUL suffit à faire partir un post — la feuille historique
        // l'accepte, et T2.1 aligne le meuble dessus. Un LIEU seul le fait
        // partir de même (T2.5, parité avec `hasContent` de la feuille
        // historique, `FeedView+Attachments.publishPostWithAttachments`) :
        // `handleFeedLocationSelection` range un lieu dans `pendingPlace` sans
        // texte ni média, et `emptyDraft` ne doit se refuser que quand il n'y a
        // NI texte NI média NI lieu.
        let texteVide = draft.text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true
        // **Un CANVAS est de la matière** (2026-09-05). L'énumération ci-dessus
        // disait « NI texte NI média NI lieu » et le canvas n'y figurait pas :
        // une composition de texte, de dessin, de stickers ou à fond de couleur
        // seul — celles que le porteur demande d'éprouver — se faisait refuser
        // comme « brouillon vide » APRÈS que la flèche se soit armée.
        //
        // > **Le même oubli, deux étages plus bas.** La porte de la flèche
        // > ignorait la matière du canvas (corrigé le même jour) ; le PLAN
        // > d'envoi l'ignorait aussi. Corriger le premier a rendu le second
        // > visible — et sans lui, l'auteur passait d'un bouton mort à un
        // > bouton qui échoue, ce qui est pire.
        //
        // La règle n'est pas réécrite : `StorySlidePublishMatter` est le site
        // unique depuis #4741, et il expose désormais le grain des EFFETS.
        // **Un fond de couleur NU ne publie pas** (directive porteur
        // 2026-09-06) : « rendre impossible la publication de canvas vide sans
        // texte, ni autre type d'object ». D'où `carriesObject` et non
        // `carriesMatter` — la seconde compte le fond, ce qui reste juste pour
        // une STORY (#4741) et ne l'est pas pour un post ni pour un réel, dont
        // ce plan est le seul juge (le `guard` de format en tête de fonction).
        // Un réel a d'autant plus besoin d'un OBJET que le serveur le dégrade
        // en post s'il ne porte ni vidéo, ni son, ni deux images
        // (`qualifiesAsReel`, `packages/shared/utils/reel-composition.ts`).
        let canvasSansMatiere = !(draft.storyEffects.map(StorySlidePublishMatter.carriesObject) ?? false)
        guard !texteVide || !draft.localMedia.isEmpty || draft.location != nil || !canvasSansMatiere else {
            return .refuse(.emptyDraft)
        }
        // La complétude de l'audience passe par la MÊME règle que le gate de la
        // flèche : deux écritures de « un ONLY sans personne ne part pas »
        // seraient deux occasions de la corriger à moitié. Ce plan est la
        // SECONDE ligne — la porte lit le brouillon, jamais le gate.
        guard ComposerDocumentPublishGate.audienceIsComplete(
            draft.visibility,
            userIds: draft.visibilityUserIds ?? []
        ) else {
            return .refuse(.incompleteAudience(draft.visibility))
        }

        // **Un RÉEL doit QUALIFIER, et la règle n'est pas réécrite ici** :
        // `ReelComposition` est le miroir Swift de `qualifiesAsReel` côté
        // serveur, et c'est lui que l'éventail de formats consulte déjà pour
        // décider s'il OFFRE le réel (`documentComposesReel`). Offrir un format
        // et refuser de le publier sous la même composition serait la
        // contradiction que ce site existe pour empêcher.
        if draft.format == .reel,
           !ReelComposition.qualifiesAsReel(mimeTypes: draft.localMedia.map(\.mimeType),
                                            durationsMs: draft.localMedia.map(\.durationMs)) {
            return .refuse(.reelWithoutQualifyingMedia)
        }

        let chemin = ComposerDocumentSendRouting.path(
            isQuote: draft.repostOfId != nil,
            hasLocalMedia: !draft.localMedia.isEmpty,
            isOffline: isOffline
        )
        guard chemin.isDurable else { return .refuse(.nonDurablePath(chemin)) }
        return .send(chemin)
    }
}

/// **Ce que le publieur a rendu** — la question posée APRÈS l'envoi, et elle est
/// DISTINCTE de la précédente.
///
/// Deux types parce que deux questions. Le plan demande « ce brouillon a-t-il le
/// droit de partir, et par où ? » ; celui-ci demande « le publieur l'a-t-il
/// pris ? ». Les fondre aurait fait porter au plan une réponse qu'il ne peut pas
/// avoir — et c'est précisément ce trou qui a laissé le `Bool` de
/// `onPublishDocument` sans le moindre émetteur de `false` pendant deux lots,
/// pendant que son doc-comment le documentait comme une ACCEPTATION.
nonisolated enum ComposerDocumentSendOutcome: Equatable {
    case accepted
    case refused(ComposerDocumentSendRefusal)

    var isAccepted: Bool { self == .accepted }

    /// - Parameters:
    ///   - succeeded: `FeedViewModel.publishSuccess`, relu APRÈS l'envoi.
    ///   - error: `FeedViewModel.publishError`, la chaîne que le modèle a posée.
    ///
    /// **L'ordre des deux questions est load-bearing** : l'erreur prime sur le
    /// drapeau de succès. `publishSuccess` est un `@Published` qui SURVIT d'un
    /// envoi à l'autre ; le lire en premier ferait accepter un échec sur la foi
    /// d'un succès précédent. La règle ne suppose donc rien de l'hygiène du
    /// publieur — pas même qu'il remette ses drapeaux à zéro en entrant.
    ///
    /// Une chaîne VIDE n'est pas une erreur : `publishError` est un texte
    /// (`error.localizedDescription`), pas un `Error`, et la traiter en refus
    /// ferait republier un envoi réussi — en double.
    static func reported(succeeded: Bool, error: String?) -> ComposerDocumentSendOutcome {
        if let error, !error.isEmpty { return .refused(.publisherRejected(error)) }
        return succeeded ? .accepted : .refused(.publisherSilent)
    }
}
