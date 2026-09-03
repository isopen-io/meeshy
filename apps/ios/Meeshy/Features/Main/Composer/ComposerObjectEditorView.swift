import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'éditeur d'OBJET, plein écran — un mélange de `1c` et de `2e`** (#4634,
/// directive porteur 2026-08-31).
///
/// > « L'édition `2e` doit être bien appliquée, plein écran avec toutes les
/// > options affichées lors de l'édition. […] Pour l'édition de texte il faut un
/// > mélange de `1c` — Éditeur de scène, objet sélectionné — et de `2e`. […]
/// > Puisque la sélection d'un élément, on doit pouvoir indiquer d'où à où il
/// > apparaît, son style, taille, alignement si nécessaire, et position
/// > temporelle avec la vision dans le plan 2D, le tout dans un espace assez
/// > large en 2D pour bien positionner. »
///
/// ## Le défaut que cet écran ferme
///
/// Les dix-huit styles vivaient en BANDE basse, servie par `bandTextStylesContent`.
/// Or `ComposerLowZone.resolve` donne le bas à `.toolOptions` dès qu'un outil est
/// ouvert — et éditer un texte OUVRE un outil. **Le spécimen était donc
/// inatteignable pendant l'édition**, c'est-à-dire au seul moment où l'on
/// choisit un style ; il ne se montrait qu'après avoir refermé l'éditeur, par un
/// jeton.
///
/// Pire, `MeeshyToolOptionsPanel` ne rend quelque chose que si un outil est
/// DÉPLIÉ. Tant qu'aucune bulle du rail n'était tapée, la zone basse d'une
/// édition de texte était **vide**. « Toutes les options » n'existait nulle part.
///
/// ## Ce que « toutes affichées » veut dire ici
///
/// Les outils de `TextEditTool` — sept alors, huit depuis l'EFFET (#4870) —
/// sont EMPILÉS, chacun sous son titre, sans bulle à déplier — plus un choix à
/// faire avant de pouvoir choisir. Le style
/// prend la forme du spécimen `2e` (le vrai texte sur son vrai fond, la grille
/// des dix-huit) parce que c'est celle que la planche donne, et le TEMPS ferme
/// la liste avec le plan 2D, qui montre la fenêtre au lieu de la décrire.
///
/// ## Pourquoi la scène occupe la moitié haute
///
/// « Un espace assez large en 2D pour bien positionner » : l'objet se déplace,
/// se pince et se tourne DANS cet écran. Une vignette suffirait à montrer le
/// résultat d'un style ; elle ne suffit pas à poser un objet au pixel près.
struct ComposerObjectEditorView: View {

    @ObservedObject var viewModel: StoryComposerViewModel
    let objectId: String
    let aspectRatio: CGFloat
    let plateauTint: Color
    let sceneImages: [String: UIImage]
    let sceneImagesVersion: UInt64
    let onClose: () -> Void
    /// Remonte au meuble l'objet que le plan 2D vient de désigner — c'est lui
    /// qui possède `editedObject`, et deux sources pour « quel objet est ouvert »
    /// divergeraient au premier tap.
    let onSelectObject: (String) -> Void

    /// **Ce qui est DÉPLIÉ, une section à la fois** (#4842). L'état est LOCAL
    /// à l'écran, et jamais celui que le ViewModel porte pour la rangée
    /// d'outils : c'est ce dernier qui rendait la zone basse d'une édition de
    /// texte vide tant qu'aucune bulle n'avait été tapée, et ce lot ne le
    /// ramène pas. (Son identifiant n'est pas cité ici : une garde de source
    /// l'interdit dans ce fichier, et un doc-comment qui le nomme la fait
    /// rougir aussi sûrement qu'un appel — mesuré.)
    /// **L'outil dont le bas montre les options — NON optionnel** (#4936).
    ///
    /// Le point d'interrogation d'hier n'était pas un détail : il disait
    /// « tout replié », un état que la liste dépliante rendait UTILE (la
    /// hauteur revenait à la scène). Dans un rail, refermer ne rend rien — le
    /// rail occupe le couloir, pas le bas — et un `nil` y viderait la zone
    /// basse, c'est-à-dire rejouerait le défaut que cet écran existe pour
    /// fermer. Le type porte donc l'invariant : le vide est irreprésentable.
    @State private var selectedTool: ComposerObjectEditorSection =
        ComposerObjectEditorRail.initiallySelected

    /// **Le panneau de l'outil est-il REPLIÉ ?** (#5027)
    ///
    /// Un fait d'AFFICHAGE, posé à côté de `selectedTool` et jamais à sa
    /// place : l'outil reste sélectionné, donc rouvrir ramène celui qu'on
    /// réglait. Le rendre optionnel aurait cassé l'invariant de #4936 pour
    /// exprimer un état que ce booléen dit sans y toucher.
    @State private var optionsAreCollapsed = false

    @State private var planZoom: Plan2DZoom = .fit
    @State private var moveOrigin: Double?

    /// **Le plan TIENT le geste, donc le scroller doit lâcher.** Sans ce
    /// verrou, le contenu panne sous le doigt pendant que la barre se rogne —
    /// les deux se disputent le même doigt, et `Plan2DView` documente
    /// explicitement le signal qu'il émet pour l'éviter.
    @State private var planHoldsGesture = false

    /// La fenêtre de l'objet, LUE du modèle à chaque rendu — jamais recopiée
    /// dans un `@State`, qui divergerait de ce que le plan 2D dessine.
    private var timing: ComposerObjectTiming {
        // **Générique depuis #4937** : `MeeshySceneObject` expose `startTime` et
        // `duration` pour les cinq familles, en uniformisant le `Float?` de
        // l'audio. Lire `textObject` ici aurait rendu la fenêtre d'un sticker
        // « permanente » quelle que soit sa vraie valeur — un réglage qui ment
        // plutôt qu'un réglage absent.
        ComposerObjectTiming.timing(start: sceneObject?.startTime,
                                    duration: sceneObject?.duration)
    }

    /// **L'objet courant, TOUTES familles** (#4937) — lu du modèle à chaque
    /// rendu, jamais recopié : le plan 2D permet d'en désigner un autre sans
    /// quitter l'écran, et une copie divergerait au premier tap.
    private var sceneObject: MeeshySceneObject? {
        viewModel.currentSlide.sceneObject(id: objectId)
    }

    /// La famille de l'objet ouvert. Le repli sur `.text` n'est pas un défaut
    /// masqué : il ne survient que si l'objet vient d'être supprimé pendant que
    /// l'écran le tenait — un état NOMINAL que `sceneObject(id:)` documente — et
    /// l'écran se referme alors de lui-même.
    private var family: MeeshySceneObject.Kind {
        sceneObject?.kind ?? .text
    }

    private var textObject: StoryTextObject? {
        viewModel.currentEffects.textObjects.first { $0.id == objectId }
    }

    private var slideDuration: Double {
        max(1, viewModel.currentSlide.duration)
    }

    /// **L'anatomie du PLATEAU, ici aussi** (#4936) — et les outils dans le
    /// couloir de TÊTE (#5026, directive porteur 2026-09-03, seconde).
    ///
    /// > « Cette vue plein écran, la rangée canonique doit être rangée à
    /// > gauche, scrollable. »
    ///
    /// ## Deux directives contraires en une journée, et la seconde gagne
    ///
    /// Le #4997 avait descendu ce rail du couloir vers une rangée basse, sur la
    /// directive « lister les outils entièrement en bas […] pour laisser la
    /// place au canvas ». Sa mesure était juste : le couloir coûtait 52 pt de
    /// LARGEUR de carte, donc ≈ 92 pt de hauteur, le ratio 9:16 les liant.
    ///
    /// Ce que cette mesure ne pouvait pas voir : **elle avait été prise sans le
    /// clavier.** Le cas nominal de cet écran est l'édition d'un texte — donc
    /// clavier LEVÉ — et le bas n'existe alors plus. La rangée s'y retrouvait
    /// écrasée entre les options et le clavier, tronquée à droite, pendant que
    /// le couloir de tête restait vide sur toute la hauteur.
    ///
    /// > **Une place justifiée par une mesure prise dans un seul état cesse de
    /// > l'être dans l'autre.** La question à poser n'était pas « le couloir
    /// > coûte-t-il de la largeur ? » — il en coûte — mais « que vaut le bas
    /// > quand le clavier l'occupe ? ». Aucune des deux directives n'a tort ;
    /// > c'est l'état mesuré qui manquait à la première.
    ///
    /// La justification du #4997 est RÉVOQUÉE ici plutôt qu'effacée : un
    /// commentaire qui explique pourquoi le code fait quelque chose se relit
    /// comme une raison de ne pas y toucher, et celui-là décrivait un arbitrage
    /// renversé.
    ///
    /// Ce qui NE change pas : le sujet reste en haut et ne défile jamais hors
    /// de l'écran, l'historique garde son couloir droit — « au même endroit »
    /// était la moitié explicite de la directive du #4936 —, et le bas montre
    /// les options de l'outil ouvert.
    var body: some View {
        VStack(spacing: 0) {
            header
            HStack(alignment: .center, spacing: 0) {
                toolRail
                scene
                historyRail
            }
            options
        }
        .background(plateauTint.ignoresSafeArea())
        .preferredColorScheme(.dark)
        // **Le glissement du bord de tête RAMÈNE à la scène** (#4997).
        //
        // `fullScreenCover` ne donne pas le geste que le système offre à une
        // pile de navigation : l'écran n'avait qu'une sortie, le chrome haut.
        // La zone est une lisière ÉTROITE posée sur le bord, jamais le geste
        // posé sur toute la vue — le canvas y déplace des objets, et un
        // glissement horizontal capté partout lui volerait chaque translation.
        .overlay(alignment: .leading) { edgeBackStrip }
        // **Le glissement BAS rend l'écran à la scène** (#5027) : le clavier
        // part, puis le panneau de l'outil se replie.
        //
        // Posé en `simultaneousGesture` et non en `gesture` : la zone
        // d'options défile et le plan 2D panne. Un `gesture` exclusif leur
        // volerait le doigt ; la règle, elle, refuse tout ce qui n'est pas
        // franchement vertical, donc les deux cohabitent.
        .simultaneousGesture(
            DragGesture(minimumDistance: 24)
                .onEnded { valeur in
                    guard ComposerObjectEditorDismissGesture.completes(
                        translation: valeur.translation) else { return }
                    yieldScreenToScene()
                }
        )
        // **Changer d'objet peut changer de FAMILLE** (#4937), et l'outil
        // courant peut ne plus exister pour elle : passer d'un texte réglé sur
        // POLICE à un sticker laisserait le bas vide.
        //
        // Le type non optionnel garantit qu'une valeur EXISTE ; il ne garantit
        // pas qu'elle soit SERVIE par la famille courante. Deux propriétés
        // distinctes, et la seconde demande sa règle.
        .adaptiveOnChange(of: family, initial: true) { _, nouvelle in
            selectedTool = ComposerObjectEditorRail.selection(forFamily: nouvelle,
                                                              keeping: selectedTool)
        }
    }

    // MARK: - L'en-tête

    /// Le nombre d'objets POSÉS sur la slide — lu du modèle à chaque rendu, donc
    /// il suit l'ajout et le retrait sans qu'on quitte l'écran.
    private var objectCount: Int {
        ComposerSceneObjectCount.posed(on: viewModel.currentSlide)
    }

    private var header: some View {
        HStack {
            // **`< N` à la place du titre** (#4935, directive porteur
            // 2026-09-03). Le titre nommait l'écran ; il ne disait ni d'où l'on
            // vient, ni que cet écran édite UN objet parmi N — alors que le
            // plan 2D permet justement d'en désigner un autre sans sortir.
            //
            // Le chiffre est peint SANS le mot : le glyphe et le nombre tiennent
            // dans le pouce, et c'est VoiceOver qui reçoit la phrase entière
            // (`spokenLabel`) — une chaîne pour l'œil, une pour l'oreille, parce
            // qu'un « 4 » annoncé seul ne dit pas ce qu'il compte.
            Button(action: onClose) {
                HStack(spacing: 3) {
                    // `chevron.backward`, jamais `chevron.left` : le second nomme
                    // un côté PHYSIQUE et ne se retourne pas en arabe, où le
                    // retour est à droite. `RightToLeftLayoutGuardTests` l'a
                    // attrapé — la flèche pointait vers l'avant du fil pour la
                    // moitié RTL de nos sept langues.
                    Image(systemName: "chevron.backward")
                        .font(MeeshyFont.relative(15, weight: .semibold))
                    Text(LocalizedNumber.exact(objectCount))
                        .font(MeeshyFont.relative(16, weight: .semibold).monospacedDigit())
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .frame(minWidth: 44, minHeight: 40)
                // **Verre ADAPTATIF, jamais `glassEffect` en direct** (#4997) :
                // l'enrobage du SDK rend le vrai Liquid Glass sur iOS 26 et un
                // matériau translucide en dessous — le plancher du projet est
                // iOS 16, et un appel direct ne compilerait pas sans une garde
                // de version que ce site n'a pas à porter.
                .adaptiveGlass(in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ComposerSceneObjectCount.spokenLabel(count: objectCount))
            .accessibilityAddTraits(.isButton)
            Spacer()
            Button(action: onClose) {
                Text(ComposerObjectEditorCopy.done)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    // Blanc sur la capsule PROÉMINENTE, comme « Publier » : les
                    // deux sont l'action terminale de leur écran, et le même
                    // geste doit avoir partout le même relief.
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 40)
                    .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.brandPrimary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - La scène, en grand

    /// L'objet reste SÉLECTIONNÉ tout du long : c'est la doctrine de `1c` — « un
    /// seul objet à la fois ».
    ///
    /// **Mais il n'est plus ENCADRÉ** (#4850, directive porteur 2026-09-02) :
    ///
    /// > « En plein ecran pourquoi mettre un cadre violet autour du texte, je
    /// > trouve inutile... »
    ///
    /// Cette ligne portait la justification inverse — « le cadre qui l'encadre
    /// est ce qui rend le réglage lisible pendant qu'on le change ». Elle était
    /// vraie SUR LA SCÈNE, où le cadre désigne, parmi plusieurs objets, celui
    /// que le doigt saisit. Ici l'objet EST le sujet de l'écran : le titre le
    /// nomme, les dix sections le règlent, il n'y a rien dont le distinguer.
    /// Un signe qui n'apprend rien occupe la place de ce qui apprend.
    ///
    /// La justification est révoquée ICI plutôt qu'effacée : un commentaire qui
    /// explique pourquoi le code fait quelque chose se relit comme une raison
    /// de ne pas y toucher, et celui-ci décrivait une décision annulée.
    ///
    /// Mesuré avant de retirer : `selectedItemId` ne gouverne QUE le marqueur
    /// (`StoryCanvasRepresentable` → `setSelectionMarker`). Il ne décide ni de
    /// ce qui répond au doigt, ni de ce qui s'édite en ligne — le passer à
    /// `nil` n'enlève donc aucun geste.
    private var scene: some View {
        EmbeddedSceneCanvas(
            slide: Binding(
                get: { viewModel.currentSlide },
                set: { viewModel.currentSlide = $0 }
            ),
            aspectRatio: aspectRatio,
            cornerRadius: 20,
            // **Taper un autre texte l'OUVRE** — le même geste que sur une barre
            // du plan 2D, et la même raison : sur un écran dont le sujet EST
            // l'objet sélectionné, un tap qui ne sélectionne rien est un
            // contrôle inerte. Les autres kinds n'ont pas d'éditeur ici (#4082),
            // donc ils ne répondent pas plutôt que de répondre à moitié.
            onItemTapped: { id, _ in
                // **Toutes les familles depuis #4937.** La garde `kind == .text`
                // datait du temps où cet écran ne savait éditer qu'un texte :
                // taper un sticker ne faisait alors RIEN, ce qui se lit comme
                // une scène morte plutôt que comme une limite.
                guard id != objectId else { return }
                openEditor(id)
            },
            loadedImages: sceneImages,
            loadedImagesVersion: sceneImagesVersion,
            editingTextId: viewModel.textEditingMode.activeTextId,
            onInlineTextChanged: { id, texte in
                viewModel.updateTextContent(id: id, text: texte)
            },
            // **Vide, et c'est le comportement voulu.** Sur la scène incrustée,
            // fermer la saisie SORT du mode d'édition ; ici l'écran EST
            // l'édition, et en sortir au premier « retour » du clavier
            // refermerait tout pendant qu'on règle un style. La sortie a son
            // geste : « Terminé », qui appelle `closeObjectEditor`.
            onInlineTextEditEnded: { _ in },
            // `nil` — voir le doc-comment : pas de cadre en plein écran (#4850).
            selectedItemId: nil
        )
        // **Le sujet RÉCLAME la hauteur libre** (#4997) : la carte est figée à
        // son ratio et se centre dans ce qu'on lui donne, donc sans
        // `maxHeight` elle se contente de sa taille idéale et laisse le reste
        // en bande vide. C'est la moitié du correctif qui ne se voit pas — le
        // plafond posé sur les options ne rend la place à personne si le sujet
        // ne la demande pas.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .layoutPriority(1)
        // Les DEUX couloirs sont de nouveau occupés (#5026) — les outils à
        // gauche, l'historique à droite — et la carte s'encastre entre eux,
        // comme sur la surface de scène.
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    // MARK: - Les deux rails, dans les couloirs

    /// **Le rail d'OUTILS, dans le couloir de tête** (#5026) — glyphes plats,
    /// SANS nom (#5029, retirée), sans barre de défilement (#5038).
    ///
    /// ## La place : le couloir, parce que le bas appartient au clavier
    ///
    /// Voir la doctrine du `body`. Ce que le rail gagne à revenir ici n'est pas
    /// de la surface, c'est de la DISPONIBILITÉ : clavier levé, le bas est
    /// occupé et le couloir ne l'est pas.
    ///
    /// ## Le nom sous le glyphe a été ESSAYÉ, puis retiré
    ///
    /// #5029 l'avait posé — les dix glyphes sont une iconographie provisoire,
    /// et `rectangle.dashed` (CADRE) contre `square.on.square.dashed`
    /// (BORDURE) se distinguent mal. Vérifié au simulateur : dix libellés
    /// empilés dans un couloir de 56 pt débordaient des deux côtés et venaient
    /// toucher la carte.
    ///
    /// > Directive porteur 2026-09-03 : « Supprime les noms des tool, ça gâche
    /// > tout ; de toute façon les options apparaissent en bas du titre de
    /// > l'outil. »
    ///
    /// Et la raison est juste, pas seulement esthétique : **le nom est DÉJÀ
    /// servi**, par le titre de la section d'options que `section(_:_:content:)`
    /// peint sous la carte. Le mettre aussi dans le rail le disait deux fois
    /// pour un glyphe à la fois — et une seule ligne d'écran peut le dire, celle
    /// de l'outil OUVERT, qui est la seule dont on a besoin.
    ///
    /// L'iconographie reste provisoire et relève de la planche (#4936) ; ce
    /// lot ne la fixe pas, il retire la béquille qui la compensait mal.
    ///
    /// ## Aucun indicateur de défilement
    ///
    /// Il était MONTRÉ au #4936, et pour une raison mesurée : deux entrées sur
    /// dix tombent hors du rail visible, et rien ne disait qu'il fallait
    /// défiler. La directive le retire — « lorsqu'on scrolle sur la liste des
    /// outils à gauche on ne doit pas montrer la barre de défilement ».
    ///
    /// > La mesure qui justifiait la barre n'a pas disparu : ce qui la remplace
    /// > est le DÉBORDEMENT VISIBLE — la dernière entrée est coupée au bord du
    /// > couloir, ce qui dit « ça continue » sans peindre de chrome. Une barre
    /// > qui n'apparaît qu'au geste ne le disait de toute façon pas avant le
    /// > geste.
    private var toolRail: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 6) {
                ForEach(ComposerObjectEditorRail.entries(for: family), id: \.self) { entree in
                    Button {
                        selectedTool = entree
                        // Taper un outil le REND : le repli est un fait
                        // d'affichage, et le geste qui choisit un outil dit
                        // qu'on veut le régler.
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
                            optionsAreCollapsed = false
                        }
                    } label: {
                        Image(systemName: ComposerObjectEditorRail.symbolName(entree))
                            .font(.title3)
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(ComposerObjectEditorRail.isSelected(entree, selected: selectedTool)
                                             ? MeeshyColors.brandPrimary
                                             : Color.white.opacity(0.55))
                            // 44 pt de CIBLE quel que soit le glyphe
                            // (dimension 5) : dessiné à sa taille naturelle, un
                            // `clock` donnerait 17 pt que personne n'atteint du
                            // pouce.
                            .frame(width: ComposerObjectEditorRail.railWidth, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(ComposerObjectEditorCopy.entry(entree))
                    .accessibilityAddTraits(ComposerObjectEditorRail.isSelected(entree, selected: selectedTool)
                                            ? [.isButton, .isSelected] : .isButton)
                }
            }
            .padding(.vertical, 4)
        }
        .frame(width: ComposerObjectEditorRail.railWidth)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(ComposerObjectEditorCopy.toolRow)
    }

    /// **La lisière du bord de tête** (#4997) — la zone où le geste de retour
    /// se prend, et rien d'autre.
    ///
    /// `leading` et non « gauche » : en arabe le retour est à droite, et une
    /// lisière codée sur un côté PHYSIQUE y refuserait le geste que
    /// l'utilisateur vient d'apprendre.
    ///
    /// Elle est TRANSPARENTE mais pas vide : `Color.clear` seule ne reçoit
    /// aucun toucher — `contentShape` est ce qui lui en donne, et c'est
    /// l'oubli classique qui rendrait ce geste silencieusement inerte.
    private var edgeBackStrip: some View {
        Color.clear
            .frame(width: ComposerEdgeBackGesture.stripWidth)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 12, coordinateSpace: .global)
                    .onEnded { valeur in
                        guard ComposerEdgeBackGesture.completes(
                            startX: valeur.startLocation.x,
                            translation: valeur.translation
                        ) else { return }
                        HapticFeedback.light()
                        onClose()
                    }
            )
            .accessibilityHidden(true)
    }

    /// **L'historique, à DROITE** — et c'est `ComposerTrailingRail`, le composant
    /// même que la surface de scène monte.
    ///
    /// Le réemployer n'est pas une économie : c'est ce qui rend la promesse
    /// « au même endroit » VÉRIFIABLE. Deux rails écrits séparément auraient
    /// dérivé sur le glyphe, la taille ou l'ordre, et personne n'aurait rougi —
    /// ce sont des jetons, pas des signatures.
    ///
    /// `actions: []` et pas de `onAddSlide` : cet écran règle UN objet, il ne
    /// crée pas de slide et n'empile rien. Le rail se réduit donc à ce que
    /// l'auteur peut vraiment défaire ici, et disparaît si rien ne l'est.
    private var historyRail: some View {
        ComposerTrailingRail(
            actions: [],
            plateauTint: plateauTint,
            onUndo: viewModel.canUndoGlobal ? { viewModel.undoGlobal() } : nil,
            onRedo: viewModel.canRedoGlobal ? { viewModel.redoGlobal() } : nil
        )
        .frame(width: 52)
    }

    // MARK: - Toutes les options, empilées

    /// **Rendre l'écran à la scène** (#5027) — dans cet ORDRE, et il compte.
    ///
    /// Le clavier part d'abord : c'est lui qui occupe le plus de place, et le
    /// voir descendre pendant que le panneau se replie donne au geste un seul
    /// mouvement plutôt que deux. L'inverse — replier puis lâcher le clavier —
    /// fait sauter la scène deux fois.
    ///
    /// La dismission passe par le responder GLOBAL parce que le champ n'est pas
    /// à nous : le texte s'édite EN LIGNE dans le canvas UIKit, et l'éditeur
    /// n'en tient que l'identifiant. `exitTextEditingMode()` ferait plus que
    /// demandé — il sortirait de l'édition, alors que le geste ne demande que
    /// de la place.
    private func yieldScreenToScene() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                        to: nil, from: nil, for: nil)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
            optionsAreCollapsed = true
        }
        HapticFeedback.light()
    }

    @ViewBuilder
    private var options: some View {
        if !optionsAreCollapsed, let binding = viewModel.textObjectBinding(for: objectId) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    styleSection(binding)
                    // Les autres outils, dans l'ordre que la rangée du SDK
                    // a fixé — le même ordre que les bulles du rail, pour que
                    // passer de l'un à l'autre ne demande pas de réapprendre.
                    ForEach(TextEditTool.all.filter { $0 != .style }, id: \.self) { tool in
                        section(ComposerObjectEditorCopy.tool(tool), .tool(tool)) {
                            TextEditToolOptions(tool: tool, textObject: binding)
                        }
                    }
                    timingSection
                    planSection
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
            }
            // **Le bas prend ce qu'il LUI faut, jamais tout ce qui reste**
            // (#4997). Un `ScrollView` est greedy : posé en `maxHeight:
            // .infinity`, il réclamait toute la hauteur libre et laissait une
            // bande VIDE de ≈ 250 pt sous la grille des polices — mesurée au
            // simulateur —, pendant que la carte 9:16 restait à 247 pt là où sa
            // largeur lui en permet 594.
            //
            // Le plafond est celui du plus grand panneau servi (la grille des
            // dix-huit styles, deux rangées) : au-delà, le contenu défile,
            // et en deçà la place revient au sujet. C'est le sens même de la
            // directive — « laisser la place au canvas d'occuper suffisamment
            // l'espace ».
            .frame(maxHeight: ComposerObjectEditorRail.optionsMaxHeight)
            .scrollDisabled(planHoldsGesture)
        }
    }

    /// **Le spécimen `2e`, à sa vraie place** — pendant l'édition, sur le fond
    /// réel, avec le vrai texte de la scène.
    @ViewBuilder
    private func styleSection(_ binding: Binding<StoryTextObject>) -> some View {
        section(ComposerObjectEditorCopy.tool(.style), .tool(.style)) {
            TextStyleSpecimenBand(
                text: binding.wrappedValue.text,
                selection: binding.wrappedValue.parsedTextStyle,
                onDarkSurface: true,
                horizontalInset: 0,
                onSelect: { style in
                    viewModel.updateTextStyle(id: objectId, style: style)
                }
            )
        }
    }

    // MARK: - D'où à où

    /// La fenêtre se règle en DÉBUT et FIN — ce que l'auteur voit — et se range
    /// en début + durée, ce que le modèle stocke. `ComposerObjectTiming` tient
    /// la conversion, et surtout le `nil` de « permanent », qu'une paire de
    /// glissières nues perdrait au premier réglage.
    private var timingSection: some View {
        section(ComposerObjectEditorCopy.timing, .timing) {
            VStack(alignment: .leading, spacing: 10) {
                Text(ComposerObjectEditorCopy.window(timing, slideDuration: slideDuration))
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.75))
                    .accessibilityLabel(ComposerObjectEditorCopy.window(timing, slideDuration: slideDuration))

                slider(titre: ComposerObjectEditorCopy.start,
                       valeur: timing.start,
                       borne: slideDuration) { nouvelle in
                    apply(timing.moved(to: nouvelle, slideDuration: slideDuration))
                }

                if let fin = timing.end {
                    slider(titre: ComposerObjectEditorCopy.end,
                           valeur: fin,
                           borne: slideDuration) { nouvelle in
                        apply(timing.trimmingEnd(to: nouvelle, slideDuration: slideDuration))
                    }
                }

                // **Le retour vers « permanent » est un CHEMIN, pas un défaut.**
                // Sans lui, régler une fin serait irréversible : l'interface
                // offrirait un aller sans retour, et l'auteur devrait supprimer
                // l'objet pour le refaire.
                Toggle(isOn: Binding(
                    get: { timing.isPermanent },
                    set: { permanent in
                        apply(permanent
                              ? timing.madePermanent
                              : timing.trimmingEnd(to: slideDuration, slideDuration: slideDuration))
                    }
                )) {
                    Text(ComposerObjectEditorCopy.permanent)
                        .font(MeeshyFont.relative(13, weight: .regular))
                        .foregroundStyle(.white.opacity(0.85))
                }
                .tint(MeeshyColors.brandPrimary)
            }
        }
    }

    private func slider(titre: String, valeur: Double, borne: Double,
                        onChange: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(titre)
                    .font(MeeshyFont.relative(11, weight: .regular))
                    .foregroundStyle(.white.opacity(0.55))
                Spacer()
                Text(ComposerObjectEditorCopy.seconds(valeur))
                    .font(MeeshyFont.relative(11, weight: .medium).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.75))
            }
            Slider(value: Binding(get: { valeur }, set: onChange), in: 0...borne)
                .tint(MeeshyColors.brandPrimary)
                .accessibilityLabel(titre)
                .accessibilityValue(ComposerObjectEditorCopy.seconds(valeur))
        }
    }

    // MARK: - Le plan 2D

    /// **La vision dans le plan** — l'objet parmi les autres, sur l'axe du
    /// temps. C'est `Plan2DView` du SDK, monté tel quel : en écrire une version
    /// simplifiée ici perdrait les poignées de bord, le verrou des fonds et le
    /// signal de blocage du scroll, que l'atelier a déjà.
    private var planSection: some View {
        section(ComposerObjectEditorCopy.plan, .plan) {
            GeometryReader { geo in
                Plan2DView(
                    tracks: Plan2DLayout.tracks(from: viewModel.currentEffects,
                                                slideDuration: slideDuration),
                    zoom: planZoom,
                    laneWidth: max(120, geo.size.width),
                    slideDuration: slideDuration,
                    isDark: true,
                    selectedTrackId: objectId,
                    // **Taper une autre piste ouvre CET objet-là** : le plan
                    // montre toute la slide, et le seul geste qu'on attend d'une
                    // barre voisine est « celle-ci maintenant ». Sans ce
                    // branchement, le tap serait un contrôle inerte de plus.
                    onSelectTrack: { id in
                        guard id != objectId,
                              viewModel.currentEffects.textObjects.contains(where: { $0.id == id })
                        else { return }
                        openEditor(id)
                    },
                    // Les keyframes s'éditent à l'Inspecteur de l'atelier, que ce
                    // meuble ne monte pas (#4082) : DÉSIGNER un keyframe ici
                    // n'ouvrirait rien. Le rappel reste vide et le dit — un
                    // geste armé sans destination est un contrôle qui ment.
                    onSelectKeyframe: { _ in },
                    // Même raison : l'index rendu est absolu dans `tracks`, tous
                    // plans confondus, et le traduire en mutation de plan/z est
                    // exactement ce que `Plan2DView` laisse à l'appelant. Tant
                    // que l'écran ne sait pas le faire, il ne le promet pas.
                    onReorder: { _, _ in },
                    onTrimStart: { id, delta in
                        guard id == objectId else { return }
                        apply(timing.trimmingStart(to: timing.start + delta))
                    },
                    onTrimEnd: { id, delta in
                        guard id == objectId else { return }
                        apply(timing.trimmingEnd(to: (timing.end ?? slideDuration) + delta,
                                                 slideDuration: slideDuration))
                    },
                    onMove: { id, cumule in
                        guard id == objectId else { return }
                        // Le déplacement est CUMULÉ depuis le début du geste :
                        // l'origine se capture au premier appel, sans quoi les
                        // deltas s'additionneraient en boule de neige.
                        let origine = moveOrigin ?? timing.start
                        if moveOrigin == nil { moveOrigin = origine }
                        apply(timing.moved(to: origine + cumule, slideDuration: slideDuration))
                    },
                    onMoveEnded: { _ in moveOrigin = nil },
                    onScrollLockChanged: { tenu in planHoldsGesture = tenu }
                )
            }
            .frame(height: 120)
        }
    }

    // MARK: - Le gabarit d'une section

    /// **Ce que le BAS montre — l'outil sélectionné, et lui seul** (#4936).
    ///
    /// Hier un `DisclosureGroup` : la rangée portait le titre ET la bascule, et
    /// ouvrir la dernière section poussait la scène hors de l'écran. Le rail a
    /// pris la bascule ; il ne reste ici que le titre et le contenu.
    ///
    /// La forme du corps n'a pas changé — chaque appelant passe le même
    /// `content()` qu'avant. Ce qui change est QUI décide de l'afficher.
    @ViewBuilder
    private func section<Content: View>(_ titre: String,
                                        _ id: ComposerObjectEditorSection,
                                        @ViewBuilder content: () -> Content) -> some View {
        if ComposerObjectEditorRail.isSelected(id, selected: selectedTool) {
            VStack(alignment: .leading, spacing: 10) {
                Text(titre)
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.55))
                    .tracking(0.8)
                content()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func openEditor(_ id: String) {
        viewModel.exitTextEditingMode()
        viewModel.enterTextEditingMode(textId: id)
        onSelectObject(id)
    }

    /// Ranger la fenêtre dans le MODÈLE — jamais dans un état de vue. C'est ce
    /// qui garde le plan 2D, le canvas et la publication d'accord.
    ///
    /// **Elle passe par le BINDING du viewModel**, seul site qui sait écrire
    /// dans `currentEffects` — son setter est privé au SDK, et c'est une bonne
    /// clôture : une vue qui reconstruirait le tableau d'effets pour changer un
    /// champ écraserait tout ce qu'un autre chemin y aurait posé entre-temps.
    private func apply(_ nouveau: ComposerObjectTiming) {
        guard let binding = viewModel.textObjectBinding(for: objectId) else { return }
        var objet = binding.wrappedValue
        objet.startTime = nouveau.storedStartTime
        objet.duration = nouveau.storedDuration
        binding.wrappedValue = objet
    }
}

/// L'objet en cours d'édition. Un type plutôt qu'un `String?` parce que
/// `fullScreenCover(item:)` exige `Identifiable` — et parce qu'un identifiant nu
/// se confondrait, à la relecture, avec `selectedSceneItemId`, qui répond à une
/// autre question : celui-là est SÉLECTIONNÉ, celui-ci est OUVERT.
nonisolated struct ComposerEditedObject: Identifiable, Equatable {
    let id: String
}

/// Les mots de l'éditeur d'objet. Hors du `body` — une chaîne composée dans une
/// vue est hors de portée d'un témoin.
nonisolated enum ComposerObjectEditorCopy {

    static var title: String {
        String(localized: "composer.object.editor.title",
               defaultValue: "Modifier l'objet", bundle: .main)
    }

    static var done: String {
        String(localized: "composer.object.editor.done", defaultValue: "Terminé", bundle: .main)
    }

    static var timing: String {
        String(localized: "composer.object.editor.timing", defaultValue: "APPARITION", bundle: .main)
    }

    /// Le nom du GROUPE que VoiceOver annonce en entrant dans la rangée basse.
    /// Sans lui, le lecteur d'écran énumère dix boutons sans dire de quoi ils
    /// règlent — le même service que `ComposerRailCopy.railLabel` rend au rail
    /// de la scène.
    static var toolRow: String {
        String(localized: "composer.object.editor.toolRow",
               defaultValue: "Outils de l'objet", bundle: .main)
    }

    /// **« TIMELINE », pas « PLAN 2D »** (directive porteur 2026-09-02).
    ///
    /// La CLÉ garde son nom : elle désigne le composant monté
    /// (`Plan2DView` du SDK), et renommer une clé de catalogue casserait les
    /// sept traductions déjà posées sans rien apporter. Ce qui change est le
    /// MOT que l'auteur lit — et il rejoint le vocabulaire que le reste de
    /// l'app emploie déjà pour la même chose (`story.tool.timeline`), au lieu
    /// d'un terme de géométrie que cette section était seule à porter.
    static var plan: String {
        String(localized: "composer.object.editor.plan", defaultValue: "TIMELINE", bundle: .main)
    }

    static var start: String {
        String(localized: "composer.object.editor.start", defaultValue: "Début", bundle: .main)
    }

    static var end: String {
        String(localized: "composer.object.editor.end", defaultValue: "Fin", bundle: .main)
    }

    static var permanent: String {
        String(localized: "composer.object.editor.permanent",
               defaultValue: "Visible du début à la fin", bundle: .main)
    }

    static func seconds(_ valeur: Double) -> String {
        String(format: "%.1f s", valeur)
    }

    /// **La phrase « d'où à où », en toutes lettres.** C'est la demande du
    /// porteur mot pour mot ; deux glissières seules obligeraient à faire le
    /// calcul de tête.
    static func window(_ timing: ComposerObjectTiming, slideDuration: Double) -> String {
        guard let fin = timing.end else {
            return String(localized: "composer.object.editor.window.permanent",
                          defaultValue: "De \(seconds(timing.start)) à la fin",
                          bundle: .main)
        }
        return String(localized: "composer.object.editor.window",
                      defaultValue: "De \(seconds(timing.start)) à \(seconds(fin))",
                      bundle: .main)
    }

    /// Le nom d'un outil, en section. Les glyphes du rail suffisent à une bulle
    /// de 44 pt ; un titre de section a besoin d'un mot.
    /// Le libellé d'une entrée du rail — ce que VoiceOver entend.
    ///
    /// Il RÉEMPLOIE `tool(_:)`, `timing` et `plan` : la même entrée porte le
    /// même mot au rail et au titre du bas. Un second jeu de libellés aurait
    /// donné deux noms à un seul outil, et l'auteur aurait cherché « POLICE »
    /// dans un rail qui dit « Style ».
    static func entry(_ entry: ComposerObjectEditorSection) -> String {
        switch entry {
        case .tool(let outil): return tool(outil)
        case .timing:          return timing
        case .plan:            return plan
        }
    }

    static func tool(_ tool: TextEditTool) -> String {
        switch tool {
        // **POLICE, pas STYLE** (#4850). La mesure a tranché contre les deux
        // formes que la directive proposait : `StoryTextStyle` est un sélecteur
        // de POLICE et rien d'autre — les dix-huit cas résolvent tous vers une
        // famille, une graisse ou un design (`storyFont(for:size:)`,
        // `StoryTextFontResolver.baseFont`), aucun n'applique d'effet.
        //
        // « Neon » ne brille pas : c'est du système semibold arrondi. « Tag » ne
        // bombe pas : c'est MarkerFelt. « Affiche » est Avenir Next Condensed.
        // Sept des dix-huit sont des polices DÉGUISÉES en effets, et c'est ce
        // mélange de VOCABULAIRE — pas un mélange d'axes — que l'auteur voyait.
        //
        // **L'axe EFFET existe depuis #4870 — comme un CHAMP à part**
        // (`textEffect` : lueur, ombre, relief), jamais comme un regroupement
        // des dix-huit. C'est la section qui suit, deuxième de la liste parce
        // que c'est la question que l'auteur se posait devant la grille. Une
        // police reste une police ; ce qui brille est un autre choix.
        case .style:
            return String(localized: "composer.object.tool.style", defaultValue: "POLICE", bundle: .main)
        case .effect:
            return String(localized: "composer.object.tool.effect", defaultValue: "EFFET", bundle: .main)
        case .color:
            return String(localized: "composer.object.tool.color", defaultValue: "COULEUR", bundle: .main)
        case .align:
            return String(localized: "composer.object.tool.align", defaultValue: "ALIGNEMENT", bundle: .main)
        case .background:
            return String(localized: "composer.object.tool.background", defaultValue: "FOND", bundle: .main)
        case .frame:
            return String(localized: "composer.object.tool.frame", defaultValue: "CADRE", bundle: .main)
        case .border:
            return String(localized: "composer.object.tool.border", defaultValue: "CONTOUR", bundle: .main)
        case .language:
            return String(localized: "composer.object.tool.language", defaultValue: "LANGUE", bundle: .main)
        }
    }
}
