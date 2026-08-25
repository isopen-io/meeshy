import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les règles du mood, **PURES** — éprouvables sans monter une vue.
///
/// Elles sont extraites de `StatusComposerView` plutôt que réécrites : chaque
/// membre porte l'ancre du geste dont il vient, et le lot 4.8 confrontera cette
/// liste bloc par bloc avant d'autoriser un retrait. Une règle réécrite « à
/// l'identique » de mémoire est le premier pas d'une divergence.
///
/// `nonisolated`, comme tout ce dossier : une règle ne s'exécute pas, elle se
/// LIT — depuis n'importe où, y compris hors du main actor.
nonisolated enum ComposerMoodPolicy {

    /// Le plafond DUR de la saisie. `StatusComposerView` le tenait par
    /// TRONCATURE, pas par refus de frappe : coller 300 caractères garde les
    /// 122 premiers au lieu de ne rien écrire.
    ///
    /// **Divergence CONSIGNÉE, non refermée ici** : le web plafonne à 140
    /// (`StatusComposer.tsx`, `MAX_CONTENT_LENGTH`). Trancher appartient au lot
    /// du contrat partagé, pas à un portage d'écran — et porter 140 ici sans
    /// bouger le serveur ni le web aurait fabriqué une troisième valeur.
    static let contentLimit = 122

    /// Le cran où le compteur passe en alerte. Il n'est PAS dérivé des 80 % que
    /// `CharacterCountLabel.resolvedThreshold` applique par défaut (ce qui
    /// donnerait 98) : 101 est la valeur que l'écran historique posait en
    /// toutes lettres, et la reprendre est le seul moyen que le compteur
    /// change de couleur au même caractère qu'avant.
    static let warningThreshold = 101

    /// Ne coupe QUE ce qui dépasse. Exactement `contentLimit` caractères passe
    /// intact — un `>=` ici aurait rogné la dernière frappe légitime.
    ///
    /// Compte en `Character` (grappes de graphèmes), comme le faisait
    /// `String.prefix` à l'origine : un emoji drapeau ou une famille comptent
    /// pour UN, ce qui est ce que l'auteur voit.
    static func truncate(_ text: String) -> String {
        guard text.count > contentLimit else { return text }
        return String(text.prefix(contentLimit))
    }

    /// **Un mood SANS emoji ne part pas.** C'est la seule règle de publication
    /// du format, et elle était écrite DEUX fois dans l'écran historique — le
    /// `guard let emoji` de l'action et le `.disabled(selectedEmoji == nil …)`
    /// du bouton. Une seule ici, lue par les deux.
    ///
    /// La chaîne VIDE est refusée en plus du `nil`, ce que l'original ne
    /// faisait pas : `StatusViewModel.moodOptions` ne peut pas en produire, et
    /// la règle est donc strictement plus stricte sans changer aucun geste
    /// atteignable. Dit ici parce qu'un jour une graine de repost pourra
    /// remplir cet emoji depuis le réseau.
    static func canPublish(emoji: String?, isPublishing: Bool) -> Bool {
        guard let emoji, !emoji.isEmpty else { return false }
        return !isPublishing
    }

    /// La BASCULE : retaper l'emoji déjà choisi le désélectionne. C'est ce qui
    /// permet de repartir d'un mood vierge sans fermer la feuille, et c'est
    /// aussi ce qui rend la grille cohérente avec le gate ci-dessus — se
    /// désélectionner REDÉSACTIVE la publication.
    static func toggling(_ tapped: String, current: String?) -> String? {
        current == tapped ? nil : tapped
    }

    /// **Loi 3 — on n'écrit que ce qu'on sait complet.** `nil` quand rien n'est
    /// déclaré, JAMAIS `[]` : un tableau vide est entendu par le serveur comme
    /// un EFFACEMENT des mentions, là où l'absence de clé le laisse relire les
    /// `@handle` du texte lui-même.
    ///
    /// Elle DÉLÈGUE le filtrage à `ComposerReferences.payload` au lieu de le
    /// réécrire : c'est lui qui écarte les INLINE, et deux filtres pour un même
    /// fait divergeraient au premier mode ajouté.
    ///
    /// **Son unique appelant est la FABRIQUE du brouillon**
    /// (`ComposerDocumentDraft.mood`, lot 4.5), et il le reste : la surface
    /// ci-dessous PRÉSENTE et ne publie pas. La brancher depuis la vue ouvrirait
    /// le second chemin de publication que la doctrine, C2 et le lot 7
    /// interdisent tous les trois, et
    /// `ComposerMoodSurfaceTests.test_laSurface_nOuvreAucunCheminDePublication`
    /// le retient — c'est pourquoi ce nom figure dans sa liste d'interdits.
    static func declared(_ references: [ComposerReference]) -> [PostMentionInput]? {
        let declared = ComposerReferences.payload(references)
        return declared.isEmpty ? nil : declared
    }
}

/// **Ce qu'une porte SÈME dans un mood** — la graine, réduite à ce qu'elle
/// porte réellement.
///
/// Deux portes en produisent une, et elles ne la remplissent pas de la même
/// façon :
///
/// - la **republication** (lot 4.7) sème un emoji, une phrase, le nom de
///   l'auteur d'origine pour le bandeau, et l'URL de sa note vocale. Elle ne
///   sème AUCUNE audience — l'écran historique n'en semait pas non plus, et le
///   sélecteur repart donc sur la mémoire du format (loi 10) ;
/// - la **reprise hors-ligne** sème ce que la file durable avait retenu :
///   emoji, texte, audience ET sa liste nominative. Cette dernière est
///   load-bearing — un mood `ONLY`/`EXCEPT` renvoyé sans elle repartirait avec
///   une liste vide, que le gateway refuse.
///
/// **`repostOfId` n'est PAS ici, et c'est délibéré.** Il vit dans la porte
/// (`ComposerOrigin.repost(ofPostId:sourceFormat:)`), que le meuble lit par
/// `ComposerOrigin.repostedPostId`. Le poser aussi dans la graine ferait deux
/// sources pour un même fait.
///
/// **Le `clientMutationId` de la ligne reprise n'est pas ici non plus** : il ne
/// décrit pas ce qui se compose, il désigne une ligne de la file à SUPPLANTER
/// au moment de l'envoi. Il reste donc au site de montage, seul à connaître
/// l'outbox.
nonisolated struct ComposerMoodSeed: Equatable {
    let emoji: String?
    let text: String?
    let visibility: PostVisibility?
    let visibilityUserIds: [String]?
    /// Le bandeau « Status de @X ». **AFFICHAGE seul** — le gateway n'a jamais
    /// lu ce champ (lot 4.2), et c'est `repostOfId` qui porte l'attribution.
    let viaUsername: String?
    /// La note vocale de la SOURCE, conservée telle quelle pour qu'un mood vocal
    /// republié garde sa voix. Le chemin 2 la RÉFÉRENCE au lieu d'en dupliquer
    /// les octets, contrairement à `POST /posts/:id/repost` — dette nommée du
    /// lot 4.7, non vivante (`Post.audioUrl` n'est récupéré par aucun balayage
    /// d'expiration).
    let audioUrl: String?

    init(
        emoji: String? = nil,
        text: String? = nil,
        visibility: PostVisibility? = nil,
        visibilityUserIds: [String]? = nil,
        viaUsername: String? = nil,
        audioUrl: String? = nil
    ) {
        self.emoji = emoji
        self.text = text
        self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.viaUsername = viaUsername
        self.audioUrl = audioUrl
    }
}

/// Ce qui est COMPOSÉ à un instant donné — la matière que la graine rencontre.
///
/// Une valeur, pas un état : c'est ce qui rend l'adoption ci-dessous éprouvable
/// sans monter une vue.
nonisolated struct ComposerMoodComposition: Equatable {
    let emoji: String?
    let text: String
    let visibility: PostVisibility
    let visibilityUserIds: [String]
}

/// **Comment une graine entre dans un composer DÉJÀ OUVERT.**
///
/// La question n'est pas rhétorique : la reprise hors-ligne est ASYNCHRONE —
/// elle interroge la file durable — et sa graine arrive donc après que l'auteur
/// a pu poser un emoji ou taper un mot. `StatusComposerView` tenait déjà cette
/// règle, éparpillée en quatre `if` dans son `.onAppear` (`if selectedEmoji ==
/// nil`, `if statusText.isEmpty`, …). Elle est reprise ICI, en un seul endroit,
/// parce qu'une règle écrite dans un `.onAppear` est invisible aux tests.
///
/// **L'invariant vaut par CHAMP, et il n'est pas le même pour les quatre.** Le
/// dire en un seul mot — « une graine ne remplace jamais ce que l'auteur a
/// posé » — serait une loi plus large que ce que `adopt` tient, et c'est la loi
/// que lirait la session suivante :
///
/// - **`emoji` et `text` ne remplissent que le vide.** Un emoji déjà choisi, une
///   phrase déjà tapée : la graine passe à côté. C'est là, et là seulement, que
///   la course de la reprise hors-ligne est neutralisée ;
/// - **`visibility` et `visibilityUserIds` sont REPRIS tels quels** dès que la
///   graine en porte (l'audience si le sélecteur sait la peindre, la liste
///   nominative si elle n'est pas `nil`). Ils écrasent donc ce que l'auteur
///   aurait déjà choisi. Ce n'est pas un oubli : sans cette reprise, un mood
///   `ONLY`/`EXCEPT` renvoyé depuis la file repartirait avec une liste vide que
///   le gateway rejette — la parité exacte de `StatusComposerView`, qui
///   restaurait aussi `visibilityUserIds`.
///
/// **La conséquence, à consigner et non à découvrir** : un auteur qui choisit
/// « Amis » pendant que la file durable répond voit son audience écrasée par
/// celle de la ligne reprise. Refermer cette course demanderait de savoir
/// distinguer « audience par défaut » de « audience CHOISIE », ce que
/// `ComposerMoodComposition` ne porte pas aujourd'hui.
nonisolated enum ComposerMoodSeeding {

    /// - Parameter seed: `nil` ⇒ rien à adopter, la composition sort intacte.
    static func adopt(_ seed: ComposerMoodSeed?, into current: ComposerMoodComposition) -> ComposerMoodComposition {
        guard let seed else { return current }

        let emoji = current.emoji ?? seed.emoji
        // Le plafond s'applique AUSSI à ce qui est semé. L'écran historique
        // l'obtenait par effet de bord — son `adaptiveOnChange(of: statusText)`
        // se déclenchait sur l'écriture programmatique comme sur la frappe. Le
        // dire ici plutôt que de compter dessus : un texte de 300 caractères
        // repris de la file partirait sinon tel quel.
        let text = current.text.isEmpty
            ? ComposerMoodPolicy.truncate(seed.text ?? "")
            : current.text
        // Une audience semée n'est adoptée que si le sélecteur sait la peindre.
        // Une valeur hors de l'offre laisserait un chip sans marque et une
        // audience que l'auteur ne pourrait plus changer.
        let visibility = seed.visibility.flatMap {
            PostVisibility.composerSelectableCases.contains($0) ? $0 : nil
        } ?? current.visibility

        return ComposerMoodComposition(
            emoji: emoji,
            text: text,
            visibility: visibility,
            visibilityUserIds: seed.visibilityUserIds ?? current.visibilityUserIds
        )
    }
}

/// **Ce que l'auteur a AJOUTÉ à une republication** — l'exacte inverse de
/// `ComposerMoodSeeding.adopt`, et elle vit à côté d'elle pour cette raison.
///
/// La question qu'elle tranche n'a pas de réponse dans le brouillon : `text` y
/// est une chaîne, et une chaîne ne dit pas d'où elle vient. Or l'ANCRAGE en a
/// besoin, parce que le commentaire qu'il transmet DÉCLARE une citation
/// (`isQuote`) — et une citation dont le texte est celui de la source n'est pas
/// une citation, c'est un écho.
///
/// **Le défaut qu'elle referme, mesuré bout en bout.** Les deux sites de
/// republication sèment `text: entry.content` (la phrase de l'humeur) ;
/// `adopt` la pose dans `documentText`, que les surfaces mood et document
/// PARTAGENT (loi 9) ; le socle la rend telle quelle dans le brouillon. Publier
/// sans y toucher — le geste le plus probable — déclarait donc une citation que
/// personne n'avait écrite, et le post affichait deux fois le même texte : une
/// fois en commentaire, une fois dans la carte citée. Le gateway est écrit pour
/// l'autre chemin : `POST /posts/:id/repost` SANS `content` fait hériter le
/// corps de la source à un reshare de `STATUS` (`inheritStatusBody`), et hériter
/// AUSSI son `originalLanguage` déclaré — là où un `content` fourni le fait
/// re-détecter sur trois mots, et mal étiqueter le Prisme.
///
/// **Elle compare ce qui a été ADOPTÉ, pas ce qui a été semé.** `adopt` fait
/// passer la graine par `ComposerMoodPolicy.truncate` ; comparer au texte brut
/// rendrait « différent » toute source de plus de 122 caractères, et le défaut
/// reviendrait exactement là où il fait le plus de bruit. La troncature est donc
/// rejouée ici, par la MÊME règle — jamais réécrite.
///
/// Les espaces de bord ne comptent ni d'un côté ni de l'autre : ajouter un
/// retour à la ligne à la phrase de la source n'est pas un commentaire.
nonisolated enum ComposerAnchorComment {

    /// - Parameter draftText: le texte du brouillon (`ComposerDocumentDraft.text`).
    /// - Parameter seededText: le texte que la PORTE a semé, `nil` hors graine.
    /// - Returns: le commentaire à transmettre, ou `nil` pour un repost SIMPLE.
    static func authored(draftText: String?, seededText: String?) -> String? {
        let saisie = (draftText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !saisie.isEmpty else { return nil }
        let semee = ComposerMoodPolicy
            .truncate(seededText ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return saisie == semee ? nil : saisie
    }
}

/// Libellés du mood, résolus par le catalogue `.main` — même idiome que
/// `ComposerDocumentCopy`. Un libellé posé en littéral dans la vue échappe au
/// cliquet de complétude et n'est jamais traduit.
///
/// **Zéro clé neuve.** Les cinq ci-dessous sont celles de `StatusComposerView`,
/// vérifiées présentes et TRADUITES dans les sept locales livrées (`ar`, `de`,
/// `en`, `es`, `fr`, `it`, `pt-BR`) le 2026-08-24 ; `common.close` l'est aussi
/// et `ComposerDocumentCopy` la réutilise déjà. Le cliquet français est à ZÉRO
/// tolérance et le catalogue est épinglé à un plafond : une clé de plus pour
/// une phrase déjà traduite l'en rapproche pour rien.
///
/// **Trois des huit clés du mood ne sont pas ici, et il faut lire au mot près
/// ce qu'il en reste.** Elles appartiennent au PUBLIEUR, que cette surface n'a
/// pas : le socle le porte depuis le lot 4.5.
///
/// - `a11y.status.publish.in-progress` et `a11y.status.publish.disabled.hint`
///   ont MIGRÉ — `ComposerSocleCopy` (`MeeshyComposerHost.swift`) les lit. Elles
///   ne sont plus suspendues au retrait de `StatusComposerView` ;
/// - `status.composer.publish` n'a TOUJOURS qu'un lecteur, et c'est lui. Le
///   socle dit « Publier » par `composer.socle.publish`, qui n'est PAS la même
///   phrase — vérifié langue par langue, `en` rend « Publish » d'un côté et
///   « Post » de l'autre. Fondre les deux est une édition de catalogue qu'aucune
///   tâche de ce lot ne possède.
///
/// Reste donc UNE clé à décider avant que le lot 4.8 puisse partir, pas trois —
/// sans quoi son retrait la rendrait orpheline et
/// `LocalizationConsistencyTests.test_everyAppCatalogIdentifierKeyIsReferencedInCode`
/// rougirait. C'est une condition, jamais un acquis.
nonisolated enum ComposerMoodCopy {

    static var title: String {
        String(localized: "status.composer.title", defaultValue: "Status", bundle: .main)
    }

    static var repostTitle: String {
        String(localized: "status.composer.title.repost",
               defaultValue: "Republier un status", bundle: .main)
    }

    static var moodQuestion: String {
        String(localized: "status.composer.mood.question",
               defaultValue: "Comment tu te sens ?", bundle: .main)
    }

    static var placeholder: String {
        String(localized: "status.composer.placeholder",
               defaultValue: "Comment tu vas ?", bundle: .main)
    }

    /// « Status de @alice ». La clé porte un `%@` au catalogue dans les sept
    /// langues ; l'interpolation du `defaultValue` est la forme que
    /// `String.LocalizationValue` sait traduire en ce `%@`.
    static func repostVia(_ username: String) -> String {
        String(localized: "status.composer.repost.via",
               defaultValue: "Status de @\(username)", bundle: .main)
    }

    /// La SORTIE n'a pas de clé neuve : `common.close` est traduite dans les
    /// sept langues, et `ComposerDocumentCopy` la lit déjà pour la même croix.
    static var close: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .main)
    }
}

/// **La surface du mood** (lot 4) — les cinq blocs que `StatusComposerView`
/// tenait, rendus au meuble.
///
/// Ce qu'elle est : une PRÉSENTATION. Des valeurs entrent par `@Binding`, des
/// événements sortent. Elle ne possède ni `StatusViewModel`, ni chemin d'envoi,
/// ni reprise de brouillon hors ligne — ces trois-là appartiennent au site qui
/// la monte (lot 4.6), parce qu'ils touchent l'outbox et le cache, deux choses
/// qu'une présentation ne connaît pas.
///
/// Ce qu'elle n'est PAS : un second chemin de publication. Une surface qui
/// publierait elle-même serait exactement la dette que ce chantier défait
/// ailleurs — et c'est gardé, pas seulement écrit
/// (`ComposerMoodSurfaceTests.test_laSurface_nOuvreAucunCheminDePublication`).
///
/// **Elle est peinte pour le PLATEAU, qui est sombre par construction** (les
/// trois `PlateauTint` le sont). Ses premiers plans sont donc les jetons
/// `isDark: true`, jamais ceux de `ThemeManager` : ceux-là suivent le thème de
/// l'APP, et en thème clair `theme.textMuted` mesure **1,68:1** sur le violet
/// profond — illisible. C'est la même mesure qui a fait choisir `textSecondary`
/// dans `ComposerDocumentSurface`, et c'est aussi pourquoi le compteur reçoit
/// sa couleur au lieu de la deviner.
///
/// **Six blocs, six propriétés NOMMÉES.** Jamais un `@ViewBuilder` imbriquant
/// un `if #available` : le débordement de pile par profondeur de type ne se
/// voit que sur appareil (1008 Ko de pile contre 8 Mo au simulateur).
struct ComposerMoodSurface: View {

    /// L'emoji choisi — la seule matière SANS laquelle un mood ne part pas.
    @Binding var emoji: String?

    /// Le texte, plafonné à `ComposerMoodPolicy.contentLimit` par TRONCATURE.
    @Binding var text: String

    @Binding var visibility: PostVisibility

    /// La liste nominative d'un `ONLY`/`EXCEPT`. Elle voyage avec l'audience et
    /// jamais séparément : un mood restreint renvoyé sans elle serait rejeté
    /// par le gateway, ce que la reprise hors-ligne de l'écran historique
    /// prenait déjà soin de restaurer.
    @Binding var visibilityUserIds: [String]

    /// **Ce que le ruban a le DROIT de peindre**, calculé par le meuble
    /// (`ComposerAudienceOffer.offered(for:)`) et remis ici.
    ///
    /// La surface peignait `PostVisibility.composerSelectableCases` en dur — les
    /// six niveaux, y compris sous une REPUBLICATION, qui est le seul chemin du
    /// meuble vivant en production avec ce ruban. Deux d'entre eux y sont des
    /// contrôles SANS EFFET : sur un repost, le serveur remplace la liste
    /// nominative d'un `ONLY`/`EXCEPT` par celle de la source
    /// (`repostVisibilityInheritsAudienceList`), si bien que le sélecteur de
    /// personnes s'ouvrait, se remplissait, et ne gouvernait rien.
    ///
    /// **Elle la REÇOIT plutôt que de la calculer**, et c'est le fond de
    /// l'affaire : le socle porte le même réglage sous une autre forme (un menu
    /// replié, `MeeshyComposerHost.audienceChip`). Deux offres pour un même
    /// réglage, c'est un plafond posé d'un côté seulement — exactement le défaut
    /// que ce lot referme, où le raisonnement sur le plafond était écrit dans
    /// `ComposerIntent` pendant que le sélecteur déjà peint n'en avait aucun.
    ///
    /// Sans valeur par défaut, à dessein : un défaut ferait retomber un site de
    /// montage sur les six niveaux sans casser la moindre compilation.
    let allowedAudiences: [PostVisibility]

    @Binding var references: [ComposerReference]

    /// Le bandeau « Status de @X ». **AFFICHAGE seul** : ce nom ne part jamais
    /// sur le fil — le gateway ne l'a jamais lu, et c'est `repostOfId` qui
    /// porte l'attribution d'une republication (lot 4.2).
    ///
    /// Sans valeur par défaut, à dessein : un `nil` implicite aurait fait
    /// disparaître le bandeau d'un site de montage sans casser la moindre
    /// compilation.
    let viaUsername: String?

    /// **La SORTIE**, obligatoire et non optionnelle — même raison que
    /// `ComposerDocumentSurface.onClose` : le meuble n'a pas d'atelier sous
    /// cette surface, donc personne d'autre ne peint la croix.
    let onClose: () -> Void

    /// **La mémoire d'audience du FORMAT status** (loi 10), et c'est la MÊME
    /// clé que l'écran historique. Une clé neuve en ferait une seconde mémoire,
    /// donc deux réglages à faire diverger pour un seul geste d'auteur.
    ///
    /// Elle est nommée par `ComposerAudienceMemory.statusKey` et non par son
    /// littéral depuis le lot 4.9 : le socle du document a désormais SA mémoire,
    /// et l'`init` du meuble relit celle du format d'ouverture. Deux
    /// orthographes d'une clé, c'est deux mémoires — le meuble sèmerait depuis
    /// l'une pendant que cette vue écrirait dans l'autre.
    ///
    /// **Cette vue l'ÉCRIT et ne la relit plus** (lot 4.7) : la relecture vivait
    /// dans un `.onAppear`, que la descente de l'éventail a rendu réentrant.
    /// Voir le bloc « LA RELECTURE DE LA MÉMOIRE A ÉTÉ RETIRÉE » plus bas.
    @AppStorage(ComposerAudienceMemory.statusKey)
    private var lastVisibility: String = PostVisibility.public.rawValue

    @State private var audiencePickerMode: PostVisibility?

    /// Cinq colonnes, cellules 56×56 pt — les mesures de l'écran historique.
    /// Elles sont FIXES quand les libellés alentour suivent Dynamic Type, et
    /// c'est ce qui oblige le site de montage à offrir un conteneur qui défile.
    private let columns = Array(repeating: GridItem(.flexible(), spacing: MeeshySpacing.lg), count: 5)
    private static let cellSide: CGFloat = 56

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
                header
                republicationBanner
                emojiGrid
                audiencePicker
                textInput
                referenceEntries
            }
            .padding(MeeshySpacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .tint(MeeshyColors.indigo400)
        .sheet(item: $audiencePickerMode) { mode in
            AudienceUserPickerView(mode: mode, initialSelection: visibilityUserIds) { ids in
                visibilityUserIds = ids
            }
        }
    }

    // MARK: - L'issue et le titre

    /// La croix en tête, à la même place que celle de l'atelier et de la
    /// surface document — pour que les trois surfaces du meuble se quittent du
    /// même geste. Elle n'est PAS dans le socle : le socle a ses zones et ne
    /// bouge jamais (loi 5).
    ///
    /// Le titre l'accompagne parce que le meuble n'a pas de barre de
    /// navigation : dans l'écran historique il vivait en `navigationTitle`, et
    /// le perdre en chemin aurait laissé `status.composer.title` et
    /// `status.composer.title.repost` sans lecteur.
    private var header: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            }
            .accessibilityLabel(Text(ComposerMoodCopy.close))

            Text(viaUsername == nil ? ComposerMoodCopy.title : ComposerMoodCopy.repostTitle)
                .font(MeeshyFont.relative(16, weight: .semibold))
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))

            Spacer(minLength: 0)
        }
    }

    // MARK: - Bloc 1 — le bandeau de republication

    /// Monté seulement quand la porte a nommé une source. Le pictogramme est
    /// DÉCORATIF : le texte « Status de @X » dit déjà la republication, et le
    /// laisser lisible ferait annoncer son nom de symbole par VoiceOver.
    @ViewBuilder
    private var republicationBanner: some View {
        if let via = viaUsername {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: "arrow.2.squarepath")
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(MeeshyColors.indigo400)
                    .accessibilityHidden(true)
                Text(ComposerMoodCopy.repostVia(via))
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(Capsule().fill(MeeshyColors.indigo500.opacity(0.15)))
        }
    }

    // MARK: - Bloc 2 — la grille d'emojis

    /// **`StatusViewModel.moodOptions` et rien d'autre.** Une seconde liste
    /// d'emojis divergerait au premier ajout, et le mood publié ne serait plus
    /// celui que la bulle sait peindre.
    private var emojiGrid: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(ComposerMoodCopy.moodQuestion)
                .font(MeeshyFont.relative(16, weight: .semibold))
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))

            LazyVGrid(columns: columns, spacing: MeeshySpacing.lg) {
                ForEach(StatusViewModel.moodOptions, id: \.self) { option in
                    emojiCell(option)
                }
            }
        }
    }

    /// La bascule passe par `ComposerMoodPolicy.toggling` : la valeur suivante
    /// est calculée AVANT l'animation, puis lue pour décider du retour haptique.
    /// La relire depuis le `@Binding` juste après l'écriture aurait fait
    /// dépendre le geste de l'ordre de propagation de SwiftUI.
    private func emojiCell(_ option: String) -> some View {
        let isSelected = emoji == option
        return Button {
            let next = ComposerMoodPolicy.toggling(option, current: emoji)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                emoji = next
            }
            if next != nil { HapticFeedback.medium() }
        } label: {
            Text(option)
                .font(MeeshyFont.relative(36))
                .frame(width: Self.cellSide, height: Self.cellSide)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .fill(isSelected ? MeeshyColors.indigo500.opacity(0.15) : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(
                            isSelected
                                ? MeeshyColors.avatarRingGradient
                                : LinearGradient(colors: [Color.clear], startPoint: .top, endPoint: .bottom),
                            lineWidth: 2
                        )
                )
                .scaleEffect(isSelected ? 1.1 : 1.0)
        }
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    // MARK: - Bloc 3 — l'audience et sa mémoire

    private var audiencePicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(allowedAudiences, id: \.rawValue) { candidate in
                    audienceChip(candidate)
                }
            }
            .padding(.horizontal, MeeshySpacing.xs)
        }
    }

    /// Choisir écrit la mémoire dans le même geste — sinon un mood publié
    /// depuis une autre surface repartirait sur l'audience d'avant.
    ///
    /// Un mode qui exige une liste nominative ouvre son sélecteur dans la
    /// foulée : l'écran historique le faisait déjà, et ne pas le faire
    /// laisserait un `ONLY` sans personne, que le gateway refuse — non pas dans
    /// `PostService`, mais UNE COUCHE plus haut, au schéma de la route
    /// (`CreatePostSchema`, « EXCEPT and ONLY visibility require at least one
    /// userId in visibilityUserIds », 400 `VALIDATION_ERROR`). Le dire au bon
    /// étage compte : chercher ce refus dans le service ferait conclure qu'il
    /// n'existe pas.
    ///
    /// **L'ouverture ne suffit pas, et c'est pourquoi le gate la double.**
    /// Toucher « Annuler » dans `AudienceUserPickerView` ne rappelle rien — son
    /// en-tête n'appelle `onDone` que sur « OK » — et laissait donc l'audience
    /// nominative debout avec une liste vide. `ComposerDocumentPublishGate`
    /// refuse ce cas depuis le même lot.
    ///
    /// Sous une REPUBLICATION, ces deux modes ne sont plus peints du tout
    /// (`ComposerAudienceOffer`) : leur portée y appartient à la source, et un
    /// sélecteur dont le résultat est écrasé par le serveur est un contrôle sans
    /// effet.
    private func audienceChip(_ candidate: PostVisibility) -> some View {
        let isSelected = visibility == candidate
        let showsCount = candidate.requiresUserSelection && isSelected && !visibilityUserIds.isEmpty
        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                visibility = candidate
                lastVisibility = candidate.rawValue
            }
            if candidate.requiresUserSelection { audiencePickerMode = candidate }
            HapticFeedback.light()
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: candidate.icon)
                    .font(MeeshyFont.relative(11))
                    .accessibilityHidden(true)
                Text(showsCount ? "\(candidate.label) (\(visibilityUserIds.count))" : candidate.label)
                    .font(MeeshyFont.relative(12, weight: .medium))
            }
            .foregroundColor(isSelected ? Color.white : MeeshyColors.textSecondary(isDark: true))
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                Capsule().fill(
                    isSelected
                        ? AnyShapeStyle(MeeshyColors.brandGradient)
                        : AnyShapeStyle(Color.white.opacity(0.08))
                )
            )
        }
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    // LA RELECTURE DE LA MÉMOIRE A ÉTÉ RETIRÉE D'ICI le 2026-08-25 (lot 4.7,
    // fin), avec le `.onAppear` qui la déclenchait. Elle est écrite en toutes
    // lettres parce qu'une session la rebrancherait sinon en croyant réparer un
    // oubli — le ruban n'écrit plus que la mémoire, il ne la relit plus.
    //
    // CE QU'ELLE FAISAIT : `visibility = ComposerAudienceMemory.remembered(
    // lastVisibility)` à chaque APPARITION de cette surface.
    //
    // POURQUOI ELLE PART. Tant qu'aucun écran ne peignait l'éventail sous le
    // mood, cette surface apparaissait UNE fois par présentation et la relecture
    // était seulement redondante : `MeeshyComposerHost.init` applique déjà la
    // mémoire du format d'OUVERTURE, et les deux portes qui montent le mood
    // ouvrent sur `.status` — donc sur `ComposerAudienceMemory.statusKey`, la
    // même clé, la même valeur. Le lot 4.7 fait descendre l'éventail : `surface`
    // est un `switch` sous `@ViewBuilder`, changer de branche DÉTRUIT la vue et
    // la recrée, et le `.onAppear` refire. La relecture devenait alors ce que
    // l'`init` du meuble interdit dans son propre commentaire : « au premier
    // changement de format, elle aurait écrasé l'audience que l'auteur venait de
    // choisir sur l'autre surface (loi 9) ». Mesuré : republication ouverte sur
    // Mood → chip « Post » → l'auteur choisit « Privé » dans le socle → chip
    // « Mood » → l'audience repartait en PUBLIC. Un ÉLARGISSEMENT silencieux, et
    // sur le lot dont tout le sujet est l'audience.
    //
    // CE QUI NE CHANGE PAS : le geste de CHOISIR écrit toujours la mémoire
    // (`audienceChip` ci-dessus, `lastVisibility = candidate.rawValue`), et
    // l'`init` du meuble la relit à la construction. Loi 10 intacte — une
    // mémoire par format, appliquée à l'OUVERTURE et jamais à une bascule.
    //
    // DETTE INCHANGÉE, et elle n'est pas ici : republier une humeur n'HÉRITE
    // toujours pas de l'audience de sa source. `ComposerAudienceOffer` retire
    // d'une republication les deux audiences dont la portée appartient à la
    // source (`ONLY`/`EXCEPT`) ; ce qui reste ouvert est l'ÉLARGISSEMENT — une
    // humeur `FRIENDS` republiée en `PUBLIC` part encore vers un 403
    // `REPOST_AUDIENCE_WIDENING` que ce ruban n'annonce pas. Le plafond existe
    // (`StoryRepostAudience.allowed(from:)`) et il lui manque son entrée :
    // l'audience de l'original, qu'`APIPost.toStatusEntry()` ne transmet pas.
    // C'est là, et non ici, que commence la levée.

    // MARK: - Bloc 4 — la saisie plafonnée et son compteur

    /// Le placeholder est PEINT plutôt que confié au `TextField` : celui du
    /// système suit l'apparence de l'interface, et le plateau est sombre quelle
    /// que soit celle-ci. C'est le même choix, pour la même mesure, que
    /// `ComposerDocumentSurface.content`.
    ///
    /// Le compteur reçoit son premier plan (`mutedColor`) au lieu de le tirer
    /// du thème : `theme.textMuted` mesure 1,68:1 sur le violet profond en
    /// thème clair, et 4,41:1 même en thème sombre — sous AA dans les deux cas.
    private var textInput: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(ComposerMoodCopy.placeholder)
                    .font(MeeshyFont.relative(15))
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                    .padding(.horizontal, MeeshySpacing.md)
                    .allowsHitTesting(false)
            }
            TextField("", text: $text)
                .font(MeeshyFont.relative(15))
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .padding(MeeshySpacing.md)
                .accessibilityLabel(Text(ComposerMoodCopy.placeholder))
        }
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(Color.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .stroke(MeeshyColors.indigo400.opacity(0.35), lineWidth: 1)
                )
        )
        // `initial: true` depuis le lot 4.7, et ce n'est pas un zèle : le texte
        // est l'état du MEUBLE, partagé avec la surface document, dont le
        // `TextEditor` n'a AUCUN plafond — un post n'en a pas. Depuis que
        // l'éventail descend, l'auteur peut écrire 300 caractères sous « Post »
        // puis revenir sous « Mood » : le texte a grandi pendant que cette
        // surface était hors de l'arbre, et un `onChange` sans `initial:` ne se
        // déclenche jamais au (re)montage. Le compteur affichait alors son état
        // d'alerte à côté d'une flèche ARMÉE — `ComposerMoodPolicy.canPublish`
        // ne regarde que l'emoji.
        //
        // La troncature est ici pour que l'auteur la VOIE au moment où il
        // revient (doctrine du mood : TRONCATURE, jamais refus de frappe) ; le
        // plafond de ce qui PART est tenu par `ComposerDocumentDraft.mood`, avec
        // les autres normalisations de la loi 3. Deux sites, deux questions —
        // pas deux écritures de la même règle : les deux appellent `truncate`.
        .adaptiveOnChange(of: text, initial: true) { _, newValue in
            let capped = ComposerMoodPolicy.truncate(newValue)
            if capped != newValue { text = capped }
        }
        .overlay(alignment: .bottomTrailing) {
            characterCount
        }
    }

    @ViewBuilder
    private var characterCount: some View {
        if !text.isEmpty {
            CharacterCountLabel(
                count: text.count,
                limit: ComposerMoodPolicy.contentLimit,
                warningThreshold: ComposerMoodPolicy.warningThreshold,
                font: MeeshyFont.relative(10, weight: .medium),
                mutedColor: MeeshyColors.textSecondary(isDark: true)
            )
            .padding(.trailing, MeeshySpacing.md)
            .padding(.bottom, -18)
        }
    }

    // MARK: - Bloc 5 — les références

    /// Les deux entrées, sous le champ : la frappe `@` et le chip. Un mood n'a
    /// pas plus de canevas qu'un post — `hasCanvas` reste donc à son défaut
    /// `false`, et le badge n'y est pas proposé.
    ///
    /// L'accent est `indigo400` et non `indigo500` : le chip « Mentionner » le
    /// peint en premier plan, et `indigo500` mesure 3,41:1 sur le violet
    /// profond — sous AA. `indigo400` y mesure 5,11:1.
    private var referenceEntries: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ReferenceMentionSuggestions(
                text: $text,
                references: $references,
                background: MeeshyColors.backgroundSecondary(isDark: true)
            )
            ReferenceComposerBar(references: $references, accentColor: MeeshyColors.indigo400)
        }
    }
}

/// **La PORTE du mood** — le seul site qui monte le meuble pour ce format.
///
/// Elle existe parce que quatre feuilles présentent le composer de mood
/// (`RootView`, `iPadRootView`, `RootViewComponents`, `ConversationListView`) et
/// que TROIS choses leur sont communes sans appartenir ni à la surface ni au
/// meuble :
///
/// 1. **la reprise hors-ligne** — `recoverUnsentStatus()` interroge la file
///    durable, et `supersedeRecoveredStatus(clientMutationId:)` remplace la
///    ligne bloquée au lieu de la doubler. L'outbox et le `StatusViewModel` sont
///    des choses qu'une PRÉSENTATION ne connaît pas : les écrire dans la surface
///    en ferait un second chemin de publication ;
/// 2. **l'envoi**, et il est DOUBLE depuis le lot 4.7 — `setStatus(...)` pour le
///    MIROIR (chemin 2, `POST /posts` type `STATUS` + `repostOfId`, celui que le
///    mood emprunte depuis toujours) et `anchorStatusAsPost(...)` pour l'ANCRAGE
///    (chemin 1, `POST /posts/:id/repost`, le seul qui instantanie les octets
///    d'une source éphémère). La porte AIGUILLE sur le format du brouillon ;
///    elle ne devine pas. Le meuble ne publie pas davantage qu'avant : il tend un
///    `ComposerDocumentDraft` à la fermeture que ce site lui donne ;
/// 3. **les douze arguments du canal de SCÈNE**, qui n'ont aucun objet ici.
///
/// **Écrite UNE fois, et c'est le fond de l'affaire.** Les quatre feuilles
/// auraient chacune pu porter ces trois choses : ce sont quatre copies d'un même
/// geste, donc quatre contrats à faire diverger — le motif que ce dépôt a déjà
/// payé ailleurs. Elles ne gardent que ce qui leur appartient vraiment : leur
/// état de présentation, leurs detents, et la graine quand elles en ont une.
///
/// **Ce qu'elle ne fait PAS** : elle ne connaît ni la surface, ni les zones du
/// socle, ni le gate de matière. Elle donne une graine, reçoit un brouillon,
/// répond `true` ou `false`. Un refus laisse le composer ouvert — jeter ce que
/// l'auteur vient d'écrire est le seul geste qu'aucune garde de source ne
/// pourrait rattraper.
///
/// **Ses DEUX branches ne disent PAS leurs échecs de la même façon, et
/// l'asymétrie est assumée** — il faut la lire au mot près pour que la session
/// suivante ne croie pas la dette refermée des deux côtés :
///
/// - **l'ANCRAGE parle.** `StatusViewModel.anchorStatusAsPost` rend un `Bool` et
///   affiche `feed.repost.error` ; un 403 `REPOST_AUDIENCE_WIDENING`, une
///   coupure réseau ou un HORS-LIGNE laisse donc le composer OUVERT, avec sa
///   saisie, son emoji, son audience et ses mentions. Le hors-ligne est refusé
///   d'entrée, sans attendre le délai d'expiration d'`URLSession` — cet envoi
///   n'a aucune file où retomber, et faire patienter l'auteur pour le même
///   refus n'aurait rien gardé de plus ;
/// - **le MIROIR se tait.** `publishMood` rend `true` une fois `setStatus`
///   revenue, parce que `setStatus` ne rend rien — elle avale l'erreur réseau
///   dans un `catch` qui se contente d'un toast. Un gateway qui répond 500
///   referme ce chemin-là et perd la composition, exactement comme l'écran
///   historique le faisait. **DETTE consignée, non refermée par ce lot** : sa
///   levée commence par faire rendre un résultat à `setStatus`.
///
/// Le contraste avec `DocumentComposerDoor` — la porte jumelle — dit la règle
/// générale : une porte ne peut pas remonter un échec que son publieur ne lui
/// dit pas. `createPost` répond (`publishSuccess` / `publishError`),
/// `anchorStatusAsPost` répond, `setStatus` se tait. Contourner ce silence ici —
/// lire l'outbox, appeler le service — serait le second chemin d'envoi que
/// `test_laPorte_neTouchePasLesServicesDirectement` interdit.
struct MoodComposerDoor: View {

    /// La porte au sens de la table : `.moodChip` pour une création,
    /// `.repost(ofPostId:sourceFormat: .status)` pour une republication. C'est
    /// elle qui porte l'identifiant republié — la graine ci-dessous ne le
    /// double pas.
    let intent: ComposerIntent

    /// Ce que l'appelant SÈME. `nil` ⇒ composition fraîche, et c'est cette
    /// absence — et elle seule — qui autorise la reprise hors-ligne : l'écran
    /// historique posait la même condition (`initialEmoji == nil, initialText ==
    /// nil, viaUsername == nil`), pour la même raison. Préremplir une
    /// republication avec un mood bloqué en file écraserait la source qu'on
    /// venait de choisir.
    ///
    /// Sans valeur par défaut : un `nil` implicite ferait disparaître la graine
    /// d'un site de republication sans casser la moindre compilation, et la
    /// republication deviendrait un mood neuf — silencieusement.
    let seed: ComposerMoodSeed?

    /// Le modèle du mood, **sans `@ObservedObject`**. La porte n'affiche rien
    /// qui en dépende : elle l'utilise pour interroger la file et pour envoyer.
    /// L'observer ferait re-rendre le composer entier à chaque `status:created`
    /// reçu par la socket, pendant que l'auteur tape.
    let viewModel: StatusViewModel

    @Environment(\.dismiss) private var dismiss

    /// Ce que la file durable a rendu. Il arrive APRÈS la première image — la
    /// reprise est asynchrone —, ce qui est exactement pourquoi son adoption
    /// passe par `ComposerMoodSeeding` : elle ne doit rien écraser de ce que
    /// l'auteur a posé entre-temps.
    @State private var recoveredSeed: ComposerMoodSeed?

    /// La ligne de file à SUPPLANTER au renvoi. Sans elle, réémettre un mood
    /// bloqué le publierait DEUX fois à la reconnexion.
    @State private var recoveredCmid: String?

    /// **La graine EFFECTIVE** — celle que le meuble adopte, et rien d'autre.
    ///
    /// Elle est NOMMÉE plutôt qu'écrite deux fois, parce qu'elle a deux
    /// lecteurs depuis le lot 4.7 : le montage du meuble, et l'ANCRAGE, qui
    /// mesure contre elle ce que l'auteur a AJOUTÉ. Deux écritures de
    /// `seed ?? recoveredSeed` seraient deux occasions d'en corriger une seule —
    /// et le défaut serait muet : l'ancrage déclarerait une citation dont le
    /// texte est celui de la source.
    ///
    /// L'ordre du `??` n'est pas commutatif : la graine de la PORTE prime, et la
    /// reprise hors-ligne ne peut de toute façon pas coexister avec elle
    /// (`recoverStuckMoodIfComposingFresh` s'ouvre sur `guard seed == nil`).
    private var graine: ComposerMoodSeed? { seed ?? recoveredSeed }

    var body: some View {
        MeeshyComposerHost(
            intent: intent,
            // Le mood ne lit pas cette valeur : sa mémoire d'audience est
            // celle du FORMAT status (loi 10), tenue par la surface sous
            // `ComposerAudienceMemory.statusKey`, et le meuble la relit lui-même
            // à la construction. Une seconde clé posée ici en ferait une seconde
            // mémoire à faire diverger. Le paramètre reste obligatoire pour la
            // SCÈNE, que cette porte ne monte jamais.
            initialVisibility: PostVisibility.public.rawValue,
            // Le canal de la SCÈNE, sans objet ici : `.moodGrid` et
            // `.keyboardOnContent` + `.status` routent tous deux vers la surface
            // du mood, jamais vers l'atelier. Écrit en toutes lettres plutôt que
            // rendu optionnel — un défaut le ferait disparaître des sites qui,
            // eux, montent vraiment une scène.
            onPublishAllInBackground: { _, _, _, _, _, _, _, _, _, _, _, _ in false },
            onPublishDocument: { draft in await publish(draft) },
            // `moodSeed:` vient APRÈS `onPublishDocument:`, et ce n'est pas un
            // goût de mise en page : Swift n'autorise aucun réordonnancement
            // d'arguments, et cette ligne a d'abord été écrite en 3e position —
            // une erreur DURE de compilation qu'aucune garde n'attrapait, parce
            // que toutes cherchaient la PRÉSENCE du libellé, jamais son RANG.
            // `test_chaqueSiteDeMontage_presenteSesLibellesDansLOrdreDeLInit`
            // tient désormais l'ordre, pour le jour où un paramètre s'insérera
            // au milieu de cet `init` (lot 5.5, collision déclarée).
            moodSeed: graine,
            // La porte du mood ne sème AUCUN média : elle n'atteint que la
            // surface du mood, qui n'a ni canvas ni pièce jointe. Écrit en
            // toutes lettres parce que le paramètre n'a pas de défaut — un
            // défaut l'aurait fait disparaître de la porte du média reçu, qui
            // aurait alors ouvert un atelier VIDE sous une entrée de menu
            // promettant une photo posée.
            mediaSeed: nil,
            onPreview: { _, _, _, _, _ in },
            onDismiss: { dismiss() }
        )
        .task { await recoverStuckMoodIfComposingFresh() }
    }

    /// La reprise, mot pour mot celle de l'écran historique — y compris sa
    /// condition d'entrée et la restauration de `visibilityUserIds`, sans quoi
    /// un mood `ONLY`/`EXCEPT` repartirait avec une liste vide que le gateway
    /// rejette.
    private func recoverStuckMoodIfComposingFresh() async {
        guard seed == nil, recoveredSeed == nil else { return }
        guard let draft = await viewModel.recoverUnsentStatus() else { return }

        recoveredSeed = ComposerMoodSeed(
            emoji: draft.moodEmoji,
            text: draft.content,
            visibility: PostVisibility(rawValue: draft.visibility),
            visibilityUserIds: draft.visibilityUserIds
        )
        recoveredCmid = draft.clientMutationId
    }

    /// **L'ENVOI — un AIGUILLAGE sur le format, depuis le lot 4.7.**
    ///
    /// Il fut un refus : `guard draft.format == .status`. Ce refus était juste
    /// tant qu'aucun écran ne peignait l'éventail sous le mood — l'ANCRAGE en
    /// post part par `POST /posts/:id/repost`, un chemin que cette porte ne
    /// possédait pas, et supposer plutôt que refuser aurait publié un ancrage
    /// sous le type STATUS, c'est-à-dire un post qui expire en une heure.
    ///
    /// L'éventail descend désormais sous les deux surfaces sans atelier
    /// (`ComposerFormatFanPlacement`), et la porte a gagné son second chemin.
    /// **L'ordre n'était pas négociable** : livrer l'éventail avant le publieur
    /// aurait armé une flèche qui, pressée, n'aurait RIEN fait — « le pire des
    /// deux mondes, puisqu'il aurait eu l'air de marcher ».
    ///
    /// Les DEUX formats que cette porte ne sait pas publier restent REFUSÉS, et
    /// le `switch` est exhaustif : un cinquième format casse la compilation ici
    /// avant de pouvoir être avalé par un `default`.
    private func publish(_ draft: ComposerDocumentDraft) async -> Bool {
        switch draft.format {
        case .status: return await publishMood(draft)
        case .post: return await anchor(draft)
        case .story, .reel: return false
        }
    }

    /// **Le MIROIR** — republier un mood en mood. Corps inchangé depuis le lot
    /// 4.6, y compris son avalement d'échec : `setStatus` ne rend rien, donc
    /// cette branche rend `true` même quand le gateway a répondu 500. Dette
    /// CONSIGNÉE du lot 4.5, dont la levée commence par faire rendre un résultat
    /// à `setStatus` — l'asymétrie avec `anchor` ci-dessous est assumée, pas
    /// oubliée.
    private func publishMood(_ draft: ComposerDocumentDraft) async -> Bool {
        guard let emoji = draft.emoji else { return false }

        HapticFeedback.success()

        // Supplanter AVANT d'envoyer, comme l'écran historique : l'inverse
        // laisserait la ligne bloquée partir à la reconnexion, en double.
        if let cmid = recoveredCmid {
            await viewModel.supersedeRecoveredStatus(clientMutationId: cmid)
            recoveredCmid = nil
        }

        await viewModel.setStatus(
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

    /// **L'ANCRAGE** — sortir une humeur de l'éphémère (loi 5).
    ///
    /// Trois choses qu'il ne fait PAS, et chacune serait une régression :
    ///
    /// 1. **il ne SUPPLANTE aucune ligne de file.** `supersedeRecoveredStatus`
    ///    annule une ligne d'outbox de type STATUS ; un ancrage n'en enfile
    ///    aucune, et l'appeler ici détruirait un mood bloqué que l'auteur n'a
    ///    pas renvoyé. Preuve structurelle, en plus de la règle :
    ///    `recoverStuckMoodIfComposingFresh` s'ouvre sur `guard seed == nil`, et
    ///    les deux sites de republication passent une graine non nulle —
    ///    `recoveredCmid` est donc TOUJOURS `nil` sous une republication ;
    /// 2. **il ne FERME pas.** La sortie appartient au meuble, qui la
    ///    conditionne à l'acceptation. Un `dismiss()` posé ici court-circuiterait
    ///    ce gate et jetterait la saisie sur un 403
    ///    `REPOST_AUDIENCE_WIDENING` ;
    /// 3. **il ne DIT pas l'échec une seconde fois.** `anchorStatusAsPost`
    ///    affiche déjà `feed.repost.error` ; un toast de plus ici en ferait deux
    ///    pour un seul refus.
    ///
    /// **Il n'est pas DURABLE hors ligne**, et ce n'est pas un oubli : cet
    /// ancrage n'ENFILE rien — il appelle le modèle, qui appelle le réseau —,
    /// ce que `ComposerDocumentSendPath.quotedRepost.isDurable` déclare déjà. Le
    /// refus est alors DIT et la saisie gardée, jamais un envoi silencieusement
    /// perdu ; `StatusViewModel.anchorStatusAsPost` le rend immédiatement sur un
    /// `isOffline()`, sans attendre le délai d'expiration d'`URLSession`.
    ///
    /// **La dette nommée ici a été payée À MOITIÉ au lot 7.5 — lire les deux
    /// moitiés avant de la reprendre.** Elle disait « ce qui manque n'est pas le
    /// KIND mais un ÉCRIVAIN ». L'écrivain existe (`RepostPublisher`) et
    /// l'ancrage passe désormais par lui : il porte son `X-Client-Mutation-Id`,
    /// donc le REJEU d'un même envoi cesse de republier. Deux TAPS restent deux
    /// gestes, donc deux jetons, qu'aucun `MutationLog` ne rapproche : ce sont
    /// le verrou « en vol » par CIBLE de l'écrivain (`RepostInFlightRegistry`)
    /// et le drapeau `isPublishingDocument` du meuble qui les retiennent.
    ///
    /// **Ce qui reste est la DURABILITÉ, et elle a changé de propriétaire.**
    /// L'écrivain sait enfiler ; c'est cette porte-ci qui refuse avant de
    /// l'atteindre, parce que `ComposerDocumentSendPath.quotedRepost.isDurable`
    /// vaut `false` et que `ComposerDocumentSendPlan` en fait un refus. Rendre
    /// l'ancrage durable sans RETOURNER cette table poserait un meuble qui
    /// DÉCLARE non durable un chemin qui l'est. Les deux se lèvent ensemble, par
    /// le lot qui possède la surface document — plus par la file.
    ///
    /// Le `guard` sur la source n'est pas une redite du gate de la flèche : le
    /// gate garde l'ARMEMENT, celui-ci garde l'ENVOI, et un ancrage sans source
    /// appellerait `POST /posts//repost`.
    ///
    /// **Le commentaire transmis est ce que l'auteur a AJOUTÉ**, jamais ce que
    /// la porte a semé : `ComposerAnchorComment.authored` tient la règle et son
    /// doc-comment dit ce qu'un écho coûterait. Passer `draft.text` tel quel —
    /// l'écriture évidente, et celle qui fut livrée — déclarait une citation que
    /// personne n'avait écrite sur le cas NOMINAL, une humeur ayant une phrase.
    ///
    /// **TROIS choses composées sous le mood ne SURVIVENT pas à la bascule vers
    /// l'ancrage**, et c'est structurel à l'endpoint, pas un oubli de ce site :
    ///
    /// 1. **l'emoji.** `PostService.repostPost` recopie INCONDITIONNELLEMENT le
    ///    `moodEmoji` de l'ORIGINAL dans son instantané. Changer d'emoji dans la
    ///    grille puis publier sous « Post » ne change donc rien au post produit ;
    /// 2. **les références.** `ComposerDocumentDraft.document` pose
    ///    `mentions: nil`, et `PostService.repost` n'a aucun paramètre de
    ///    mentions — une mention composée sous le mood disparaît sans un mot ;
    /// 3. **l'attribution à l'écran.** Le bandeau « Status de @X » et le titre
    ///    de republication vivent dans `ComposerMoodSurface` ; la surface
    ///    document n'en peint aucun. L'ancrage reste EXPLICITE — l'auteur a
    ///    touché le chip « Post », qui est marqué — mais sa SOURCE n'est plus
    ///    rappelée à l'écran une fois la bascule faite.
    ///
    /// Les deux premières se lèvent en changeant de chemin (`POST /posts` avec
    /// `repostOfId`, qui accepte `moodEmoji` et `mentions`) — au prix de
    /// l'instantané des octets, ce qui est un arbitrage produit et non une
    /// correction. La troisième se lève en portant `viaUsername` jusqu'à la
    /// surface document ; elle n'exige AUCUNE clé neuve
    /// (`ComposerMoodCopy.repostVia` et `status.composer.title.repost` sont
    /// traduites), seulement une mesure de contraste de plus.
    private func anchor(_ draft: ComposerDocumentDraft) async -> Bool {
        guard let source = draft.repostOfId else { return false }

        let accepte = await viewModel.anchorStatusAsPost(
            sourceStatusId: source,
            content: ComposerAnchorComment.authored(
                draftText: draft.text,
                seededText: graine?.text
            ),
            visibility: draft.visibility.rawValue
        )
        guard accepte else { return false }

        HapticFeedback.success()
        return true
    }
}
