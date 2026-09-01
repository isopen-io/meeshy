import SwiftUI
import MeeshySDK
import MeeshyUI
import UIKit
import ImageIO

// **Extrait de `ComposerDocumentSurface.swift` le 2026-08-30** — un type par
// fichier (directive de budget 2026-08-28). Le fichier d'origine en portait
// TROIS : la surface, la vignette de média et cette porte. À 1 101 lignes il
// franchissait le plafond, et la directive est explicite — « un fichier qui
// dépasse se DÉCOUPE, par responsabilité, pas par tranche ».
//
// La porte n'est pas une sous-vue de la surface : elle décide QUAND monter le
// composer, ce qu'elle publie et comment elle refuse. Elle n'a jamais eu de
// raison de vivre dans le fichier de la vue.

/// **La PORTE du document** — le site qui monte le meuble pour un post, et le
/// seul endroit du dossier Composer qui sache ENVOYER.
///
/// Jumelle de `MoodComposerDoor`, et écrite pour la même raison : deux choses
/// sont communes à toute présentation du document sans appartenir ni à la
/// surface ni au meuble — l'ENVOI, et la lecture de ce que le publieur en a
/// fait. Les écrire dans la surface en ferait un second chemin de publication ;
/// les écrire chez chaque site de présentation en ferait autant de copies à
/// faire diverger.
///
/// **C'est la troisième capacité du DoD du lot 2**, celle dont l'oubli PERD du
/// contenu. Ce qui la rend durable n'est pas cette porte mais le publieur
/// qu'elle choisit : la branche texte de `FeedViewModel.createPost` enfile
/// elle-même sa ligne `.createPost` SANS consulter la connectivité — mesuré, ce
/// modèle n'a pas même d'`isOffline` —, insère un post optimiste et laisse
/// l'`OutboxFlusher` la dépêcher à la reconnexion. « Offline compris » est donc
/// une propriété du CHEMIN, pas une branche écrite ici. C'est exactement ce qui
/// sépare ce publieur de celui du mood, dont la file n'est atteinte que si
/// `isOffline()` répond oui, et dont un échec réseau en ligne ne laisse qu'un
/// toast.
///
/// **Ce qu'elle ne fait PAS, et qu'il ne faut pas lire comme tenu.** Elle ne
/// récupère pas un post bloqué hors ligne pour le rouvrir en brouillon :
/// `FeedViewModel.recoverUnsentPost()` existe, le mood fait la chose
/// équivalente, mais le meuble n'a pas de canal de graine pour un document
/// (`moodSeed` est le seul) et lui en ouvrir un déplacerait l'`init` que le lot
/// 5.5 a déjà réservé. Dette NOMMÉE, non refermée ici — elle ne perd rien
/// aujourd'hui, la ligne bloquée partant seule à la reconnexion.
///
/// **Elle laisse désormais l'auteur DÉCLARER la langue de son post (T2.2).**
/// `originalLanguage:` recevait `DefaultComposerLanguage.resolve()`, une
/// CONSTANTE qui rendait « fr » — un « Hello everyone » composé ici partait
/// étiqueté français, le Prisme le traduisait FR→EN sur un texte déjà anglais,
/// et la carte affichait un badge de langue faux, sans qu'aucun geste ne
/// permette de corriger. Elle poste maintenant `draft.originalLanguage`, écrit
/// par la capsule `ComposerLanguageFlag` et le sélecteur
/// `AudioLanguagePickerView` que le meuble monte — les mêmes que la feuille
/// absorbée (`FeedComposerSheet.composerLanguage`) portait dans la même barre
/// que les six outils d'attache. `DefaultComposerLanguage.resolve()` RESTE le
/// point de DÉPART du brouillon ; ce n'est pas elle qui a changé, c'est cette
/// porte qui a cessé de la rappeler à l'envoi.
///
/// **Ses deux conditions de levée sont tombées, et elle est MONTÉE.** La langue
/// n'en est plus une (T2.2) ; la rangée d'outils l'était —
/// `ComposerDocumentTool.canonicalRow` modélise les six boutons d'attache — et
/// `servedRow == canonicalRow` depuis T2.6 (photo·caméra·fichier à T2.3, lieu à
/// T2.5, micro à T2.6 ; l'emoji tenu). Les deux tombées, T3.1 a monté la porte
/// sur le PLEIN composer du fil : `RootViewComponents` la construit, et son
/// témoin `test_laPorteDuDocument_estMonteeParExactementUnSiteDeProduction_leFil`
/// exige désormais `montages == 1`.
/// **La porte du fil (T3.1) et de tout site qui compose un DOCUMENT** — texte,
/// média local, lieu, transcription. Elle NE sert PAS la citation : un repost
/// (`repostOfId != nil`) part par `POST /posts/:id/repost`, sans file durable,
/// et `ComposerDocumentSendPlan` le REFUSE (`.nonDurablePath(.quotedRepost)`)
/// plutôt que de le faire partir par un chemin que rien ne rejoue. Les deux
/// citations restent donc sur `FeedComposerSheet` (T3.2) jusqu'à la **condition
/// de levée 7.5** : un écrivain durable du repost (fondation livrée, zéro
/// appelant). La recâbler ici avant 7.5 la ferait refuser en SILENCE — le
/// composer se refermerait comme quand tout va bien.
struct DocumentComposerDoor: View {

    /// La porte au sens de la table. C'est elle qui décide du format d'ouverture
    /// et de la surface montée ; la porte ne les recopie pas.
    let intent: ComposerIntent

    /// Le modèle du fil, **sans `@ObservedObject`**. La porte n'affiche rien qui
    /// en dépende : elle l'utilise pour envoyer, puis pour lire ce qu'il a fait
    /// de l'envoi. L'observer ferait re-rendre le composer entier à chaque
    /// `post:created` reçu par la socket, pendant que l'auteur tape — c'est la
    /// raison, mot pour mot, que porte déjà la porte du mood.
    let viewModel: FeedViewModel

    /// **Réinjectés à travers la frontière du cover d'APERÇU.**
    /// `StoryViewerView` les lit en `@EnvironmentObject`, et un cover ne
    /// recopie pas l'environnement de son hôte — même raison, mot pour mot, que
    /// porte déjà `ConversationMediaComposerDoor`, qui monte le MÊME lecteur.
    /// Sans eux, l'œil ouvrirait un écran qui plante à la première lecture
    /// d'environnement, pas un aperçu.
    let storyViewModel: StoryViewModel
    let router: Router
    let conversationListViewModel: ConversationListViewModel
    let statusViewModel: StatusViewModel

    @Environment(\.dismiss) private var dismiss

    /// L'aperçu demandé. `nil` ⇒ aucun cover — l'œil est le seul écrivain.
    @State private var previewAssets: StoryPreviewAssets?

    var body: some View {
        composerHost
            .fullScreenCover(item: $previewAssets) { assets in
                apercu(assets)
            }
    }

    private var composerHost: some View {
        MeeshyComposerHost(
            intent: intent,
            // La mémoire d'audience du format POST est tenue par le MEUBLE, qui
            // la relit lui-même à la construction sous `ComposerAudienceMemory`.
            // Une seconde graine posée ici en ferait une seconde mémoire à faire
            // diverger. Le paramètre reste obligatoire pour la SCÈNE, que cette
            // porte ne monte jamais.
            initialVisibility: PostVisibility.public.rawValue,
            // **Le canal de la SCÈNE, désormais BRANCHÉ** (directive porteur
            // 2026-09-01). Il rendait `false` en toutes lettres, et le
            // commentaire disait pourquoi : « `.keyboardOnContent` plus `.post`
            // routent vers la surface du document, jamais vers l'atelier ».
            //
            // La STORY se compose maintenant sur cette porte
            // (`ComposerSurfaceRouting` l'envoie sur `.document`), et ses canvas
            // sont des unités d'histoire — jamais des médias de la publication.
            // Le brouillon du document ne les porte pas et ne peut pas les
            // porter : il n'a ni slides, ni effets, ni images chargées. Laisser
            // le `false` aurait donné un composer qui compose une story et une
            // flèche qui refuse — la loi 4, sur le geste qui termine le travail.
            //
            // Le corps est le MÊME que celui de `ConversationMediaComposerDoor`,
            // et volontairement : c'est le publieur de CRÉATION de story du
            // dépôt (`publishStoryInBackground`), et deux assemblages de ses
            // quatorze arguments auraient divergé au premier champ ajouté.
            onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds, draftId, references, accessibility, targetType in
                storyViewModel.publishStoryInBackground(
                    targetType: targetType,
                    slides: slides,
                    slideImages: slideImages,
                    loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs,
                    loadedAudioURLs: loadedAudioURLs,
                    originalLanguage: originalLanguage,
                    visibility: visibility,
                    visibilityUserIds: visibilityUserIds,
                    draftId: draftId,
                    references: references,
                    composerMediaTexts: ComposerMediaTexts(alt: accessibility.mediaAlt ?? [:],
                                                           caption: accessibility.mediaCaption ?? [:]),
                    allowSoundExtraction: accessibility.allowSoundExtraction
                )
                // La publication accepte TOUJOURS : hors-ligne, elle part en
                // file d'attente plutôt que de rester dans le composer.
                return true
            },
            onPublishDocument: { draft in await publish(draft) },
            // `moodSeed:` vient APRÈS `onPublishDocument:`, et l'ordre des
            // arguments est load-bearing : Swift n'autorise aucun
            // réordonnancement, et une garde le tient désormais pour le jour où
            // un paramètre s'insérera au milieu de cet `init`.
            moodSeed: nil,
            // Ni média : `ComposerDocumentDraft` n'a NI `mediaIds`, NI fichier,
            // NI lieu — semer ici poserait un canvas que cette porte ne monte
            // jamais, et dont le publieur ne saurait rien faire.
            mediaSeed: nil,
            // **L'œil du socle atterrit ICI (#4047).** Il fut un no-op tant
            // que la surface document n'avait rien à montrer ; depuis #4038
            // chaque média du post est une slide, et la charge est réelle.
            // Un no-op laissé en place aurait fait de l'œil un contrôle SANS
            // EFFET — la loi 4 enfreinte de la manière la plus coûteuse, celle
            // qui a l'air de marcher.
            onPreview: { slides, images, loadedImgs, videoURLs, audioURLs in
                previewAssets = StoryPreviewAssets(
                    slides: slides,
                    backgroundImages: images,
                    loadedImages: loadedImgs,
                    videoURLs: videoURLs,
                    audioURLs: audioURLs
                )
            },
            onDismiss: { dismiss() }
        )
    }

    /// L'aperçu est rendu par le LECTEUR (`StoryViewerView`), pas par un
    /// composant maison — loi 6, et le MÊME montage que
    /// `ConversationMediaComposerDoor.apercu`. Un troisième chemin d'aperçu
    /// mentirait tôt ou tard sur ce qui sera publié.
    private func apercu(_ assets: StoryPreviewAssets) -> some View {
        let items = assets.slides.map { $0.toPreviewStoryItem() }
        let group = StoryGroup(
            id: "preview",
            username: String(localized: "story.preview.username", defaultValue: "Aperçu", bundle: .main),
            avatarColor: MeeshyColors.brandPrimaryHex,
            stories: items
        )
        return StoryViewerView(
            viewModel: storyViewModel,
            groups: [group],
            currentGroupIndex: 0,
            isPresented: Binding(
                get: { previewAssets != nil },
                set: { if !$0 { previewAssets = nil } }
            ),
            isPreviewMode: true,
            preloadedImages: assets.loadedImages.merging(assets.backgroundImages) { fg, _ in fg },
            preloadedVideoURLs: assets.videoURLs,
            preloadedAudioURLs: assets.audioURLs
        )
        .environmentObject(router)
        .environmentObject(conversationListViewModel)
        .environmentObject(statusViewModel)
    }

    /// **L'ENVOI DURABLE**, en trois temps que rien ne doit fusionner.
    ///
    /// 1. le PLAN décide si ce brouillon a le droit de partir, et par où : il
    ///    refuse un format qui n'est pas un post, un brouillon sans matière, et
    ///    tout chemin qui ne survivrait pas à un kill de l'app ;
    /// 2. l'envoi passe par le MODÈLE, jamais par un service — le modèle possède
    ///    la file durable, le cache et la réconciliation optimiste, et un appel
    ///    direct les perdrait tous les trois d'un coup ;
    /// 3. l'ISSUE lit ce que le modèle a rendu. Le silence REFUSE.
    ///
    /// Elle ne referme JAMAIS la porte elle-même. La sortie appartient au
    /// meuble, qui la conditionne à l'acceptation ; un `dismiss()` posé ici
    /// court-circuiterait ce gate et jetterait la saisie sur un refus.
    ///
    /// **Ce qu'une acceptation dit exactement, et ce qu'elle ne dit pas** : la
    /// ligne est ENFILÉE, pas LIVRÉE. `createPost` insère le post optimiste et
    /// rend la main dès que l'outbox a pris la ligne ; sa livraison réelle
    /// appartient à l'`OutboxFlusher`, qui la retentera et, s'il épuise son
    /// budget, retirera le post optimiste avec son propre toast
    /// (`observeOutcome`). Fermer sur cette acceptation-là est donc juste — le
    /// contenu est durable —, et lire `true` comme « publié » serait faux.
    /// **L'ENVOI — un AIGUILLAGE sur le format depuis #4030**, mot pour mot la
    /// forme que la porte du mood a prise au lot 4.7, et pour la même raison.
    ///
    /// L'éventail du fil offre désormais `.status` quand la composition est du
    /// TEXTE SEUL (`ComposerMoodGate`). Sans cette branche, choisir « Mood »
    /// aurait monté la bonne surface, armé la flèche… et
    /// `ComposerDocumentSendPlan` l'aurait refusée sur son premier `guard`
    /// (`draft.format == .post` ⇒ `.wrongFormat`). L'auteur aurait vu un format
    /// offert, une surface juste, et un envoi qui ne part pas — « le pire des
    /// deux mondes, puisqu'il aurait eu l'air de marcher ».
    ///
    /// Le `switch` est EXHAUSTIF : un cinquième format casse la compilation ici
    /// avant de pouvoir être avalé par un `default`.
    ///
    /// `.story` / `.reel` restent refusés, et ce n'est pas un trou de ce lot :
    /// sous ces deux formats le routage monte la SCÈNE, dont le chrome
    /// appartient à l'atelier — ce publieur n'est jamais atteint. Les écrire en
    /// refus plutôt qu'en `fatalError` garde la porte honnête si le routage
    /// changeait.
    private func publish(_ draft: ComposerDocumentDraft) async -> Bool {
        switch draft.format {
        case .post: return await publishDocument(draft)
        case .status: return await publishMood(draft)
        case .story, .reel: return refuse()
        }
    }

    /// **Le MOOD publié depuis le fil (#4030).**
    ///
    /// Il passe par `StatusViewModel`, que la porte reçoit déjà — le même
    /// modèle que la porte du mood appelle, jamais un second chemin d'envoi.
    ///
    /// Il ne SUPPLANTE aucune ligne de file : cette porte ne sème aucune graine
    /// de mood (`moodSeed: nil`), donc aucune reprise hors-ligne n'est en cours
    /// ici — la supplantation appartient à la porte qui, elle, en récupère une.
    ///
    /// **Il hérite de la dette CONSIGNÉE du lot 4.5** : `setStatus` ne rend
    /// rien, donc cette branche rend `true` même quand le gateway a répondu 500.
    /// L'asymétrie avec `publishDocument` ci-dessous est assumée, pas oubliée ;
    /// sa levée commence par faire rendre un résultat à `setStatus`, et elle
    /// vaudra alors pour les DEUX portes d'un coup.
    private func publishMood(_ draft: ComposerDocumentDraft) async -> Bool {
        guard let emoji = draft.emoji else { return refuse() }

        HapticFeedback.success()
        await statusViewModel.setStatus(
            emoji: emoji,
            content: draft.text,
            visibility: draft.visibility.rawValue,
            visibilityUserIds: draft.visibilityUserIds,
            audioUrl: draft.audioUrl,
            repostOfId: draft.repostOfId,
            mentions: draft.mentions
        )
        return true
    }

    private func publishDocument(_ draft: ComposerDocumentDraft) async -> Bool {
        guard case .send = ComposerDocumentSendPlan.plan(
            for: draft,
            isOffline: NetworkMonitor.shared.isOffline
        ) else {
            return refuse()
        }

        // `content:` reçoit le texte du brouillon tel quel : le plan vient de
        // garantir qu'il n'est ni absent ni blanc, et le re-normaliser ici en
        // ferait une seconde écriture de la même règle.
        // La langue est désormais celle DÉCLARÉE par l'auteur (T2.2) :
        // `draft.originalLanguage` porte ce que la capsule du meuble a écrit,
        // semé sur `DefaultComposerLanguage.resolve()` — qui RESTE le point de
        // DÉPART du brouillon, jamais rappelé ici.
        // `forcePlainPost` vient du brouillon (T2.4) — l'interrupteur du
        // meuble l'y a semé — jamais d'un littéral : un `false` en dur ferait
        // partir en `"REEL"` la composition qu'un auteur vient de retenir en
        // POST simple.
        // `location:` et `discoverabilityPrecision:` viennent tous deux du
        // brouillon (T2.5) — jamais d'un littéral `nil` : le premier est le
        // lieu choisi, le second le SECOND opt-in, indépendant, que l'auteur
        // seul peut activer (`FeedNearbyDiscoverability`, off par défaut).
        // `transcription:` vient du brouillon (T2.6) — `draft.mobileTranscription`,
        // jamais un littéral `nil` : c'est elle que `PublishIntent.document`
        // consulte pour ÉLIRE `originalLanguage`, la langue PARLÉE gagnant sur
        // la capsule. Ni ce corps ni son publieur (`FeedViewModel.publish`) ne
        // touchent au disque : le fichier composé par le meuble n'est ni
        // déplacé ni effacé ici — il survit à un refus comme à une acceptation,
        // et c'est la file durable seule qui en dispose.
        // `declaredType` vient du FORMAT du brouillon — le seul champ qui savait
        // déjà ce que l'auteur avait choisi, et que personne ne lisait. La
        // story se composant désormais sur cette surface (routage 2026-09-01),
        // une déduction sur les mimes l'aurait publiée en POST : le composer
        // aurait montré des unités d'histoire et envoyé un billet.
        await viewModel.publish(PublishIntent.document(
            localMedia: draft.localMedia,
            declaredType: draft.format.postType,
            forcePlainPost: draft.forcePlainPost,
            content: draft.text,
            visibility: draft.visibility.rawValue,
            visibilityUserIds: draft.visibilityUserIds,
            originalLanguage: draft.originalLanguage,
            mentions: draft.mentions,
            location: draft.location,
            discoverabilityPrecision: draft.discoverabilityPrecision,
            transcription: draft.mobileTranscription
        ))

        let issue = ComposerDocumentSendOutcome.reported(
            succeeded: viewModel.publishSuccess,
            error: viewModel.publishError
        )
        guard issue.isAccepted else { return refuse() }

        HapticFeedback.success()
        return true
    }

    /// Un refus qui se DIT.
    ///
    /// Rendre `false` sans rien dire laisserait l'auteur devant une flèche qui
    /// semble ne rien faire — et il la presserait encore. Écrit une fois pour
    /// les deux chemins de refus : deux formulations à la main diraient l'échec
    /// deux fois, ou une seule, et c'est la moitié muette qu'on découvrirait en
    /// production.
    private func refuse() -> Bool {
        FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishError)
        return false
    }
}
