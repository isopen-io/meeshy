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
    @AppStorage("lastStatusVisibility") private var lastVisibility: String = PostVisibility.public.rawValue

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
        .onAppear { applyRememberedAudience() }
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
                ForEach(PostVisibility.composerSelectableCases, id: \.rawValue) { candidate in
                    audienceChip(candidate)
                }
            }
            .padding(.horizontal, MeeshySpacing.xs)
        }
    }

    /// Choisir écrit la mémoire dans le même geste — sinon un mood publié
    /// depuis une autre surface repartirait sur l'audience d'avant. Un mode qui
    /// exige une liste nominative ouvre son sélecteur dans la foulée : l'écran
    /// historique le faisait déjà, et ne pas le faire laisserait un `ONLY` sans
    /// personne, que le gateway refuse.
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

    /// La mémoire s'applique à l'APPARITION — loi 10 : l'audience se souvient
    /// par FORMAT, sous la même clé que l'écran historique.
    ///
    /// **Elle ne PRIME sur rien, et c'est mesuré.** Des deux graines que le
    /// meuble reçoit, une seule porte une audience :
    ///
    /// - la **republication** (`RootView`, `iPadRootView`) est MUETTE sur
    ///   l'audience — elle ne sème qu'emoji, texte, `viaUsername` et `audioUrl`.
    ///   Il n'y a donc rien sur quoi primer ;
    /// - la **reprise hors-ligne** en porte une, et elle arrive APRÈS ce
    ///   `.onAppear` : elle est produite par un `await` dans le `.task` de
    ///   `MoodComposerDoor`. `ComposerMoodSeeding.adopt` l'adopte alors
    ///   par-dessus la mémoire, délibérément (voir son invariant par champ).
    ///
    /// C'est la même loi que celle écrite sur `MeeshyComposerHost.adoptMoodSeed`
    /// — « l'état COURANT est relu au moment de l'adoption » —, et les deux
    /// textes doivent le rester : deux commentaires contraires à trois fichiers
    /// d'écart, c'est une session sur deux qui « corrige » dans le mauvais sens.
    ///
    /// **Dette nommée** : le jour où republier un mood devra HÉRITER de
    /// l'audience de sa source, c'est ici qu'il faudra l'écrire. Il n'y a
    /// aucun héritage aujourd'hui, et l'écran historique n'en avait pas non
    /// plus — ce n'est donc pas une régression, c'est une capacité absente des
    /// deux côtés.
    private func applyRememberedAudience() {
        guard let remembered = PostVisibility(rawValue: lastVisibility),
              PostVisibility.composerSelectableCases.contains(remembered) else {
            visibility = .public
            return
        }
        visibility = remembered
    }

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
        .adaptiveOnChange(of: text) { _, newValue in
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
/// 2. **l'envoi** — `setStatus(...)`, le chemin 2 de la republication, celui que
///    le mood emprunte depuis toujours (`POST /posts` type `STATUS` +
///    `repostOfId`). Le meuble ne publie pas : il tend un `ComposerDocumentDraft`
///    à la fermeture que ce site lui donne ;
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
/// **Le seul `false` qu'elle rende aujourd'hui est sa garde de FORMAT**, et il
/// faut le dire au mot près pour que la session suivante ne croie pas l'échec
/// d'envoi déjà couvert : `publish` rend `true` inconditionnellement une fois
/// `setStatus` revenue, parce que `StatusViewModel.setStatus` ne rend rien —
/// elle avale l'erreur réseau dans un `catch` qui se contente d'un toast. Un
/// gateway qui répond 500 referme donc ce composer et perd l'emoji, la phrase,
/// l'audience et les mentions, exactement comme l'écran historique le faisait.
/// **DETTE consignée, non refermée par ce lot** : la remontée d'échec commence
/// par faire rendre un résultat à `setStatus`, et elle n'est écrite nulle part.
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

    var body: some View {
        MeeshyComposerHost(
            intent: intent,
            // Le mood ne lit pas cette valeur : sa mémoire d'audience est
            // `@AppStorage("lastStatusVisibility")`, dans la surface, parce que
            // c'est la mémoire du FORMAT status (loi 10). Une seconde clé posée
            // ici en ferait une seconde mémoire à faire diverger. Le paramètre
            // reste obligatoire pour la SCÈNE, que cette porte ne monte jamais.
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
            moodSeed: seed ?? recoveredSeed,
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

    /// **L'ENVOI** — et le premier `guard` est la garde négative du format
    /// sortant.
    ///
    /// Un brouillon qui n'est pas un `.status` n'a rien à faire sur ce chemin :
    /// l'ANCRAGE en post (loi 5) part par `POST /posts/:id/repost`, le seul qui
    /// instantanie les octets d'une source éphémère. Refuser plutôt que
    /// supposer — l'éventail offrirait sinon un choix que la publication
    /// ignore, « le pire des deux mondes, puisqu'il aurait eu l'air de
    /// marcher ». Aujourd'hui ce refus est inatteignable : aucun écran ne peint
    /// l'éventail sous le mood (dette nommée en `ComposerIntent`, porte
    /// `.repost`). Il est écrit pour le jour où il le sera.
    private func publish(_ draft: ComposerDocumentDraft) async -> Bool {
        guard draft.format == .status, let emoji = draft.emoji else { return false }

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
}
