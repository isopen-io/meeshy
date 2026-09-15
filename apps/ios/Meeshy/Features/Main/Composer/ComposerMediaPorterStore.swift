import Foundation
import MeeshySDK
import MeeshyUI

/// **Les huit porteurs du média, sortis du `@State`** (#6577).
///
/// ## Pourquoi un OBJET, et pas huit `@State` de plus
///
/// Le premier correctif de #6577 écrivait les huit porteurs à la main dans le
/// meuble, et ses seize témoins restaient VERTS quand on remplaçait ces huit
/// affectations par des no-op : onze lisaient la SOURCE (des `contains` sur le
/// texte du fichier), et les cinq témoins de comportement appelaient la règle
/// pure en direct, sans jamais passer par ce qui l'APPLIQUE.
///
/// > **Un `@State` ne s'éprouve pas.** Son `setter` est `nonmutating` et n'écrit
/// > nulle part tant que SwiftUI n'a pas installé la vue : dans un test, les
/// > huit affectations sont silencieusement perdues, donc aucun témoin ne peut
/// > distinguer « appliqué » de « calculé puis jeté ». Tant que l'application
/// > vit dans le `@State`, la seule preuve possible est un grep — et un grep
/// > reste vert sur un no-op qui conserve les identifiants.
///
/// Les porteurs vivent donc dans un OBJET : le meuble le tient en `@StateObject`
/// et expose les huit noms comme projections (`MeeshyComposerHost+Porters`), si
/// bien qu'aucun des ~170 sites d'appel ne change. Ce qui change est que
/// l'application est désormais du code qu'un témoin peut INSTANCIER, appeler, et
/// observer.
///
/// ## Ce que l'objet garantit en plus
///
/// - **Le retrait est ATOMIQUE.** `mediaRoleByURL` et `railPosedMediaURLs`
///   portent DEUX charges chacun — la valeur ET une garde d'idempotence de
///   re-pose. Les traiter séparément, ou en oublier un, re-pose le média au tour
///   de dérivation suivant ou BLOQUE en silence la re-sélection du même fichier.
/// - **Aucun rendu inutile.** L'écriture qui ne change rien ne notifie pas :
///   `documentLocalMedia = ComposerMediaOrder.removing(…)` sur une liste qui ne
///   contenait pas l'URL laissait, en `@State`, SwiftUI comparer — ici c'est le
///   `setter` qui tranche, sur la valeur ENTIÈRE.
@MainActor
final class ComposerMediaPorterStore: ObservableObject {

    private var stock = ComposerMediaPorters.empty

    /// **Les huit, vus comme UNE valeur** — le seul site du dépôt qui les écrive
    /// ensemble, et donc le seul qu'une mutation puisse neutraliser.
    var porters: ComposerMediaPorters {
        get { stock }
        set {
            guard newValue != stock else { return }
            objectWillChange.send()
            stock = newValue
        }
    }

    /// Les pièces jointes LOCALES composées jusqu'ici — **c'est elle que la
    /// publication téléverse.** `ComposerDocumentDraft.localMedia` ne repartait
    /// qu'à `[]` avant #4756.
    var localMedia: [ComposerDocumentMedia] {
        get { stock.localMedia }
        set { porters.localMedia = newValue }
    }

    /// **Quelle slide porte quel média (modèle § 3, #4038).** En profil Post,
    /// **une slide EST un média du post** : chaque média visuel ingéré a donc SA
    /// slide, dont il devient le fond (§ 4).
    ///
    /// **Ce n'est pas une seconde vérité.** `localMedia` reste la source UNIQUE —
    /// c'est elle que le plan de publication lit. Cette table n'est qu'un INDEX
    /// de la dérivation, clé `sourceURL`, qui permet deux choses qu'une simple
    /// reconstruction ne permettrait pas : ne pas re-poser un média déjà posé, et
    /// retrouver la slide à retirer quand son média disparaît. Reconstruire les
    /// slides à chaque changement aurait jeté au passage tout ce que l'auteur a
    /// composé DESSUS.
    var slideIdByMediaURL: [URL: String] {
        get { stock.slideIdByMediaURL }
        set { porters.slideIdByMediaURL = newValue }
    }

    /// **Le RÔLE de chaque média posé — fond ou premier plan** (#4724).
    ///
    /// Sa jumelle `slideIdByMediaURL` ci-dessus ne connaît que les FONDS : c'est
    /// sa définition, et c'est ce qui en fait la liste des tuiles. Il fallait
    /// donc une seconde mémoire pour les autres, et elle porte deux charges à la
    /// fois : dire ce qu'un média est devenu, et servir de garde d'idempotence
    /// (« ce média a DÉJÀ été posé ») — rôle que l'index des fondations tenait
    /// avant ce lot, et qu'il ne peut plus tenir depuis qu'un média peut être
    /// posé sans rien fonder.
    var roleByURL: [URL: ComposerMediaRole] {
        get { stock.roleByURL }
        set { porters.roleByURL = newValue }
    }

    /// **Les LÉGENDES, une par média** (#4890, directive porteur 2026-09-02 :
    /// « chaque image doit avoir sa légende »).
    ///
    /// Elle n'existe qu'en profil POST : ailleurs le texte de la slide EST le
    /// contenu de la publication et vit dans la slide. C'est
    /// `ComposerSlideTextRole` qui tranche, et ce champ n'est écrit que par lui
    /// — poser ici une seconde décision de rôle referait le recouvrement que le
    /// lot #4890 a retiré.
    ///
    /// Clé : l'URL LOCALE du média, la seule qui existe pendant la composition
    /// (l'id serveur n'est attribué qu'à l'upload) et celle sous laquelle le
    /// meuble tient déjà ses médias.
    var captions: ComposerMediaCaptions {
        get { stock.captions }
        set { porters.captions = newValue }
    }

    /// **Les textes alternatifs saisis dans l'éditeur d'objet** (#4756), keyés
    /// par `StoryMediaObject.id`.
    ///
    /// Clé plus simple que celle des légendes, et ce n'est pas un raccourci :
    /// une légende se saisit sur la SCÈNE, où l'on ne connaît que l'URL locale
    /// du média — d'où la traduction `URL → slide → porteur` de
    /// `ComposerSlideTextRole.canvasKeyed`. Un texte alternatif se saisit dans
    /// l'éditeur d'UN objet, qui tient son identifiant : la clé du fil
    /// (`ComposerMediaAccessibility.mediaAlt`, keyée par `StoryMediaObject.id`)
    /// est celle qu'on a déjà en main.
    ///
    /// La traduction vers l'URL SOURCE — ce que la voie durable réaligne — est
    /// `ComposerMediaPorters.altsBySourceURL`, et le meuble la sert sous le nom
    /// `altsParURLSource`.
    var altsByObjectId: [String: String] {
        get { stock.altsByObjectId }
        set { porters.altsByObjectId = newValue }
    }

    /// **`URL source → identifiant d'objet`, le chaînon qui manquait à l'alt**
    /// (2026-09-05).
    ///
    /// `altsByObjectId` est keyé par identifiant d'OBJET — c'est ce que
    /// l'éditeur de scène édite, et c'est ce que le chemin STORY sait traduire
    /// en `postMediaId` après l'upload (`StoryMediaTextMapping.serverKeyed`).
    /// Le chemin DURABLE, lui, travaille par POSITION dans `localMedia`,
    /// c'est-à-dire par URL SOURCE : `PublishIntent.document` aligne déjà les
    /// légendes ainsi.
    ///
    /// Les deux clés sont justes à leur étage ; ce qui manquait était le pont.
    /// Il ne peut venir que d'`applyContentMedia`, seul site à connaître les
    /// deux bouts — il frappe l'`objectId` ET copie la source. Il le REND
    /// désormais, et cette carte l'accumule.
    ///
    /// > **Une carte n'est pas un cache** : celle-ci est la mémoire du
    /// > BROUILLON. Le modèle de scène ne peut pas la tenir — un objet
    /// > remplacé, un fond rechangé, et il ne saurait plus de quel fichier il
    /// > est né.
    ///
    /// **Elle ne connaît qu'UN objet par fichier**, et c'est une limite assumée :
    /// dupliquer un objet en fabrique un second pour le même fichier, que cette
    /// carte ignore. C'est le RELEVÉ du canvas (`ComposerCanvasCensus`), pas
    /// cette carte, qui dit alors si le fichier est encore peint quelque part.
    var objectIdBySource: [URL: String] {
        get { stock.objectIdBySource }
        set { porters.objectIdBySource = newValue }
    }

    /// **T2.6 — la transcription du vocal composé par `AudioPostComposerView`.**
    /// Voyage À CÔTÉ de `localMedia` (l'enregistrement, posé comme un
    /// `ComposerDocumentMedia` ordinaire au retour) — jamais fondue dedans.
    /// `documentDraft` la transmet telle quelle à
    /// `ComposerDocumentDraft.document(mobileTranscription:)`, et
    /// `PublishIntent.document(transcription:)` l'élit en aval pour la LANGUE :
    /// la langue PARLÉE gagne sur `documentLanguage`, jamais l'inverse — la
    /// régression que 7.4b avait fermée sur `PublishIntent.audioRecording`.
    ///
    /// **Une transcription PAR FICHIER** (#4672). C'était UNE valeur, écrasée à
    /// chaque retour de la feuille : avec deux vocaux, la seconde effaçait la
    /// première, une seule carte s'affichait, et le premier son partait quand
    /// même à la publication — muet et invisible. La clé est l'URL du fichier,
    /// le seul handle que `localMedia` et la feuille partagent.
    var transcriptions: [URL: MobileTranscriptionPayload] {
        get { stock.transcriptions }
        set { porters.transcriptions = newValue }
    }

    /// **Les médias entrés par le RAIL de la scène** — seconde garde
    /// d'idempotence, lue par `ComposerMediaPlacement` pour décider de la porte.
    /// Une marque qui survit à son média fait poser le fichier SUIVANT par la
    /// mauvaise porte.
    var railPosedURLs: Set<URL> {
        get { stock.railPosedURLs }
        set { porters.railPosedURLs = newValue }
    }
}

/// **Le retrait d'un média, APPLIQUÉ — les trois moitiés d'un même geste.**
///
/// La règle pure (`ComposerMediaRetraction.retracting`) CALCULE ; ce type
/// APPLIQUE, et c'est la moitié que le premier lot de #6577 n'avait pas rendue
/// éprouvable. Ses trois collaborateurs s'instancient tous dans un témoin — un
/// store, un registre de pré-montée, un `StoryComposerViewModel` — donc l'aller
/// simple « geste → charge » s'observe en entier, sans monter la moindre vue.
///
/// ## L'ordre est PORTEUR
///
/// 1. **La pré-montée d'abord.** `ComposerPreUploadRegistry.forget(url:)`
///    n'avait, mesuré, AUCUN appelant de production : un fichier pré-monté puis
///    retiré laissait son `PostMedia` orphelin côté serveur, et le registre
///    continuait de le tenir pour prêt. L'oubli précède toute relecture.
/// 2. **Les porteurs ensuite, d'un bloc** (voir `ComposerMediaPorterStore`).
/// 3. **Le SDK en DERNIER.** `.adaptiveOnChange(of: documentLocalMedia)`
///    déclenche `syncPostMediaIntoSlides()` : appeler le SDK avant ferait courir
///    la dérivation sur un modèle déjà amputé et sur des index encore pleins.
@MainActor
enum ComposerMediaRetractionRun {

    /// - Parameters:
    ///   - objectIds: ce que le geste NOMME. Un objet sans fichier (un texte,
    ///     une pastille) ne retire rien des porteurs et descend tel quel au SDK :
    ///     c'est le cas nominal du rail trailing.
    ///   - slideId: la scène jetée, s'il y en a une. Elle emporte TOUS ses
    ///     objets — pas seulement ses médias.
    ///   - fileURLs: les fichiers nommés DIRECTEMENT. Les deux portes du SON
    ///     sont seules à en avoir : une carte de contenu n'a pas d'objet de
    ///     canvas, donc aucun relevé ne peut la désigner.
    @discardableResult
    static func apply(objectIds: [String],
                      slideId: String? = nil,
                      fileURLs: Set<URL> = [],
                      store: ComposerMediaPorterStore,
                      preUploads: ComposerPreUploadRegistry,
                      viewModel: StoryComposerViewModel) -> ComposerMediaRetraction {
        let retrait = ComposerMediaRetraction.retracting(
            store.porters,
            objectIds: objectIds,
            slideId: slideId,
            fileURLs: fileURLs,
            census: .of(viewModel.slides))

        retrait.retiredURLs.forEach { preUploads.forget(url: $0) }
        store.porters = retrait.porteurs

        if let slideId, let index = viewModel.slides.firstIndex(where: { $0.id == slideId }),
           viewModel.slides.count > 1 {
            // `removeSlide` emporte déjà tous les objets de la scène : rejouer
            // `deleteElement` derrière lui frapperait des identifiants que le
            // modèle ne connaît plus.
            viewModel.removeSlide(at: index)
        } else {
            // **`removeSlide` REFUSE de descendre sous une scène** (SDK) — et un
            // refus SILENCIEUX, ici, retournerait le défaut qu'on vient de
            // fermer : le fichier aurait quitté la charge pendant que ses objets
            // resteraient à l'écran. La condition ci-dessus REPRODUIT donc celle
            // du SDK plutôt que de lui faire confiance.
            //
            // Le repli supprime les objets un à un, et le relevé lui a donné
            // TOUS ceux de la scène — texte, pastilles, lieux, sons compris. Ce
            // qui reste est bien une scène vierge : l'invariant que ce
            // commentaire affirmait avant #6577 pendant que le code ne
            // supprimait que les objets nés d'un FICHIER.
            retrait.retiredObjectIds.forEach { viewModel.deleteElement(id: $0) }
        }
        return retrait
    }

    /// **« Tout effacer » — la page blanche, pré-montées comprises.**
    ///
    /// L'effacement s'écrivait en énumération et en oubliait DEUX sur huit ; il
    /// n'oubliait pas non plus « un peu » les pré-montées, il ne les oubliait
    /// PAS DU TOUT — chaque fichier déjà téléversé restait un `PostMedia`
    /// orphelin côté serveur, et le registre continuait de le tenir pour prêt.
    ///
    /// Le relevé se dresse AVANT `viewModel.reset()` : après, le modèle est vide
    /// et les fichiers des objets de scène (le son en tête, qui n'est dans aucun
    /// des huit porteurs) ne sont plus nommables par personne.
    static func clear(store: ComposerMediaPorterStore,
                      preUploads: ComposerPreUploadRegistry,
                      viewModel: StoryComposerViewModel) {
        let releve = ComposerCanvasCensus.of(viewModel.slides)
        let fichiers = Set(store.porters.localMedia.map(\.url))
            .union(releve.objects.compactMap(\.fileURL))
        fichiers.forEach { preUploads.forget(url: $0) }
        store.porters = .empty
    }
}
