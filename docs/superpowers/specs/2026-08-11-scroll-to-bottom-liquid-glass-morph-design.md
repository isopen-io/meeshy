# Bouton scroll-to-bottom : morph cercle→ovale + type "appel"

Date : 2026-08-11
Statut : approuvé (user « Oui »)
Périmètre : `ConversationScrollControlsView` (`packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift`) + `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift`. Le composant SDK reste un **pur renderer à paramètres opaques** (aucun type produit dans sa signature, aucune règle « quel état ⇒ quelle couleur ») — c'est la contrainte qui a dicté la forme de l'API en § B.

⚠️ Ce fichier existe AUSSI dans 3 worktrees actifs au moment de l'écriture de ce spec — **vérifié, les 3 existent bien** : `.claude/worktrees/agent-ac887328413edef97`, `.claude/worktrees/android-ios-parity-routine`, `.claude/worktrees/agent-af37c535fe9774606` (+ un 4e worktree frère hors `.claude/` : `../v2_meeshy-pr2851-resolve`). Avant toute implémentation : `git log --oneline -5 -- packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift` sur `main` AU MOMENT DU DÉMARRAGE (pas au moment de ce spec) et être prêt à rebaser le diff si une de ces sessions a mergé entre-temps — pas un risque de conflit sur le PLAN, un risque d'exécution à surveiller. (État à la relecture 2026-08-11 : `main` a avancé jusqu'à `dc067a2c6` **sans** toucher ce fichier ; tous les numéros de ligne ci-dessous sont vérifiés contre cet état.)

## Constat : la majeure partie existe déjà

`ConversationScrollControlsView` couvre déjà, en production :
- Liquid Glass (`.adaptiveGlass`, lignes 158-161) avec teinte accent (ou `neutral500` hors ligne).
- Aperçu riche du dernier message non lu : lecteur audio inline (play/pause tappable, `:319-329`), miniature image/vidéo (`ProgressiveCachedImage`, `:330-347`), glyphe de type pour fichier/localisation (`:348-355`), texte du dernier message (`lastMessageLine:291-309`), compteur "N messages" (`:258-262`), indicateur de frappe animé (`typingDotsView:361-375`).
- États : hors-ligne, recherche de message cité (pulse), contenu non lu, repos (chevron seul).

Ce qui MANQUE, précisément :
1. **Forme** : le conteneur est un `RoundedRectangle(cornerRadius: (hasUnreadContent || isOffline || isSearchingQuotedMessage) ? 16 : 20, style: .continuous)` (ligne 159) — pas un morph `Circle()` (repos) → `Capsule()`/ovale (contenu riche). Le user veut explicitement "un cercle parfait qui devient oval".
2. **Type "appel"** : `unreadAttachmentSymbol` (`ConversationView+ScrollIndicators.swift:110-119`) et `unreadAttachmentTypeLabel` (`:97-106`) ne couvrent que `.image/.video/.audio/.file/.location` (les types d'`MessageAttachment`). Un message-système d'appel n'a pas d'attachment → `unreadAttachment` (`:15-17`) est `nil` → `hasAttachmentPreview` faux → aucun aperçu spécifique. Vérifié aussi : un message-système d'appel PEUT bien devenir `lastUnreadMessage` — `ConversationSocketHandler.swift:524` l'assigne pour tout message entrant d'autrui, sans filtre sur `messageSource`.

## Design cible

### A. Morph de forme (SDK, `ConversationScrollControlsView`)
Remplacer le `RoundedRectangle(cornerRadius: ...)` unique par un morph explicite piloté par le même booléen qui décide déjà du corner radius (`hasUnreadContent || isOffline || isSearchingQuotedMessage`) :
- **Repos** (aucun contenu à montrer, juste le chevron) : `Circle()`.
  ⚠️ **Passer `Circle()` à `.adaptiveGlass(in:)` ne rend PAS le bouton circulaire.** Le verre est peint dans la shape inscrite dans les bounds de la vue : sur iOS 26 `glassEffect(_:in:)`, sur iOS < 26 `background(shape.fill(...))` (`AdaptiveGlass.swift:36`, `:78-87`). Or au repos le label est `Image("chevron.down").font(.system(size: 13, weight: .bold)).padding(12)` (`:149-152`) → une boîte NON carrée (~37×32) : un `Circle()` y donnerait un disque de 32 pt centré, plus étroit que le glyphe, qui déborderait horizontalement. Pour un « cercle parfait », **imposer une frame carrée explicite** au label de repos (ex. `.frame(width: 44, height: 44)` — au passage on atteint le minimum de cible tactile HIG, ce que `padding(12)` n'atteint pas) AVANT `.adaptiveGlass(in: Circle())`. Le diamètre exact (40 / 44) est un arbitrage visuel à faire au simulateur.
- **Contenu riche** (unread/offline/recherche) : `Capsule()` (ovale parfait, pas un `RoundedRectangle` à coins arrondis fixes — la capsule s'adapte nativement à `frame(maxWidth: 260)`, `:284`).
- Transition : `.adaptiveGlass(in:)` accepte n'importe quelle `Shape` en paramètre générique (`<S: Shape>`, signature confirmée `AdaptiveGlass.swift:28-32`). ⚠️ Contrainte de typage : `adaptiveGlass` est générique sur `S: Shape`, donc `Circle()` et `Capsule()` sont deux types distincts — un `let shape = cond ? Circle() : Capsule()` ne compile pas. Il faut soit brancher au niveau du modificateur (`if cond { view.adaptiveGlass(in: Capsule()) } else { view.adaptiveGlass(in: Circle()) }` dans un `@ViewBuilder`), soit passer par `AnyShape` (iOS 17+ ; le plancher du projet est iOS 16 → exclu), soit garder un `RoundedRectangle(cornerRadius:)` avec un rayon interpolé (voir ci-dessous). Le branchement `@ViewBuilder` est le défaut.
  Si une transition ANIMÉE fluide entre les deux formes est souhaitée (et pas juste un cross-fade/redraw au changement d'état), le branchement `@ViewBuilder` change l'identité structurelle de la vue et produira un cross-fade, pas un morph : la seule voie qui morphe réellement sur iOS 16 est un `RoundedRectangle(cornerRadius:)` unique dont le rayon est animé vers `hauteur/2` (capsule) — au prix du renoncement au `Circle()` géométrique strict, sauf frame carrée au repos (voir plus haut), auquel cas rayon = 22 ⇒ cercle exact. **Décision d'implémentation à trancher au rendu réel** ; les deux lisent différemment.

### B. Détection du type "appel"

**Correction d'investigation (relecture 2026-08-11) : l'appel EN COURS existe bien au niveau message.** `CallSummaryMetadata` (SDK, `packages/MeeshySDK/Sources/MeeshySDK/Models/CallSummaryMetadata.swift`, `Codable/Sendable/Equatable`) décode DEUX `kind` (`:89-103`) :
- `kind: "call"` — résumé POST-HOC, appel terminé ;
- `kind: "call-live"` — **message LIVE posté à `call:initiate`, pendant que l'appel est en cours** → exposé par `public let isLive: Bool` (`:51-54`). Son `outcome` est un placeholder neutre : **lire `isLive` AVANT `outcome`** (règle déjà appliquée par `CallNoticePresentation.isLive`, `BubbleCallNoticeView.swift:263-265`).

`Outcome` = `completed | missed | rejected | failed` (`:18-23`) ✓. « Annulé » n'est PAS un `Outcome` : c'est `isCancelled(viewerIsInitiator:)` (`:143-145`) = `.missed` + `endedByInitiator == true` + le lecteur est l'initiateur — donc **non dérivable du seul `Outcome`**, il faut l'identité du lecteur (disponible app-side via `viewModel.currentUserIdForView`, déjà utilisé pour `CallSummaryDetailSheet`).

**DÉCISION — les 4 états sont couverts** (`isLive` inclus, maintenant qu'il est établi qu'il existe au niveau message) :

| État | Condition (lue app-side, dans cet ordre) | Glyphe | Teinte passée au composant | Source SSOT |
|---|---|---|---|---|
| En cours | `summary.isLive` | `phone.fill` / `video.fill` selon `callType` | `nil` (voir note) | `CallNoticePresentation.isLive:265`, `tint:268`, `mediaGlyph:277-279` |
| Manqué / rejeté | `.missed` \| `.rejected` | idem `mediaGlyph` | hex de `MeeshyColors.error` | `:271` |
| Annulé | `.missed` + `isCancelled(viewerIsInitiator:)` | idem `mediaGlyph` | hex de `MeeshyColors.error` (même famille que manqué) | `:143-145`, `:271` |
| Échoué | `.failed` | idem `mediaGlyph` | hex de `MeeshyColors.warning` — **pas `error`** | `:272` |
| Abouti | `.completed` | — | — | aucun indicateur : un appel réussi n'est pas une action en attente |

**`isLive` se lit AVANT `outcome`** (un message vivant porte un `outcome` placeholder `.completed`) — règle déjà appliquée par `CallNoticePresentation` et rappelée dans `CallSummaryMetadata:51-54`.

**Note sur la teinte « en cours ».** `CallNoticePresentation.tint` renvoie l'accent de la conversation pour un appel live (`:268`) — mais ici la pastille ENTIÈRE est déjà teintée à l'accent (`.adaptiveGlass(tint: Color(hex: accentColor).opacity(0.85))`, `:160`) : un glyphe accent sur verre accent serait invisible. On passe donc `nil`, et le composant retombe sur `contentColor` (`:121-123`), qui bascule blanc/noir selon la luminance WCAG de l'accent. Le message « c'est l'accent de la conversation » est déjà porté par la pastille ; le glyphe n'a qu'à rester lisible. (À noter : la branche « symbole générique » existante code `.foregroundColor(.white)` en dur (`:353`) au lieu de `contentColor` — incohérence PRÉEXISTANTE, hors périmètre ; la nouvelle branche appel utilise `contentColor`, elle.)

**DÉCISION — API du composant : opaque (String), pas d'enum typé.** Le composant SDK reste un pur renderer. Il ne décode pas `CallSummaryMetadata`, ne connaît pas `Outcome`, ne porte aucune table de correspondance état→couleur. Deux champs, strictement symétriques à `unreadAttachmentSymbol: String?` (`:21`) qui est déjà un nom de SF Symbol calculé app-side :

```swift
/// SF Symbol du dernier message non lu quand c'est une notice d'appel
/// (téléphone / caméra). `nil` quand le dernier non-lu n'est pas un appel.
public var unreadCallSymbol: String? = nil
/// Teinte hex du glyphe d'appel (ex. "F87171"). Même convention que
/// `accentColor`/`secondaryColor`. `nil` → pas de teinte spécifique.
public var unreadCallTint: String? = nil
```
**La teinte est un hex `String?`, pas un `Color?`** — c'est la convention déjà en place dans ce composant : `accentColor: String` et `secondaryColor: String` (`:25-26`), consommés via `Color(hex:)` (`:122`, `:160`). Introduire un `Color?` créerait deux conventions de couleur dans la même vue.

TOUTE la logique isLive/missed/rejected/cancelled/failed → symbole + hex vit **côté app**, dans `ConversationView+ScrollIndicators.swift`, à côté de `unreadAttachmentSymbol` (`:110-119`) qu'elle imite. `CallNoticePresentation` reste la SSOT unique du vocabulaire d'appel.

**Contraintes techniques vérifiées** :
1. **Pas d'`import MeeshySDK` à ajouter** dans `ConversationScrollControlsView.swift` : avec deux `String?`, aucun type SDK ne transite par l'API du composant. Le fichier garde ses seuls `import SwiftUI` / `import Combine` (`:1-2`). C'est précisément l'intérêt de l'option opaque.
2. Le composant a un **`public init` explicite** (`:31-67`) : un `public var … = nil` seul ne suffit PAS, les deux champs sont insettables depuis l'app tant qu'ils ne sont pas ajoutés à l'init — avec valeur par défaut `nil`, en fin de liste avant les closures, pour ne casser aucun call site.
3. `CallNoticePresentation` (`BubbleCallNoticeView.swift:257-326`) est `internal` **à l'app** — mais c'est sans conséquence ici : le calcul se fait app-side, dans le même module, donc `CallNoticePresentation` est directement réutilisable plutôt que dupliquée. C'est l'argument décisif en faveur de l'API opaque.

Côté app (`ConversationView+ScrollIndicators.swift`), la source est **`viewModel.lastUnreadMessage?.callSummary`** — le champ `public var callSummary: CallSummaryMetadata?` existe DÉJÀ sur le modèle (`packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift:733`, alimenté par `APIMessage.toMessage`, `MessageModels.swift:440/858`) et est déjà consommé ailleurs dans `ConversationView` (`msg.callSummary`, cf. `callDetailMessage` et le garde de `buildNativeMessageMenu`). **Ne PAS re-décoder `message.metadata` à la main** comme l'indiquait la version précédente de ce spec — le décodage est déjà fait, et le refaire dupliquerait la garde `kind == "call"/"call-live"`.

`unreadAttachmentPreview` (lignes 317-359) gagne une branche supplémentaire pour ce cas — sur `unreadCallSymbol != nil`, au même niveau que les branches audio / image-vidéo / symbole générique, et rendue comme la branche « symbole générique » (`:348-355`) mais teintée par `unreadCallTint`.

## Non-régression (intouchés)
- Tous les autres champs et comportements du composant (frappe, hors-ligne, recherche de message cité, lecteur audio inline, miniatures) : inchangés.
- `shouldShowAttachmentPreview(unreadCount:hasAttachmentPreview:)` (`:229-231`, `nonisolated static`, testée) : **signature et corps INCHANGÉS** — pas de `hasCallPreview` parallèle, pas de garde `unreadCount > 0` dupliquée. Le cas appel entre par `hasAttachmentPreview` (`:215-221`, `private var`), qui gagne un simple `|| unreadCallSymbol != nil`. La garde `unreadCount > 0` est ainsi réutilisée telle quelle, et les 3 tests existants de `shouldShowAttachmentPreview` restent verts sans modification.
- `contentColor` (luminance WCAG, `:121-123`), `typingDotsView` (`:361-375`), `quotedMessageSearchContent` (`:172-211`), `typingLabel(for:)` (`:86-95`) : non touchés.
- `@State private var typingDotTimer` (`:114`) doit RESTER un `@State` — il existe un test de source dédié qui l'exige (`test_typingDotTimer_isDeclaredAsState`).
- Côté app, `unreadAttachment` (`ConversationView+ScrollIndicators.swift:15-17`) reste `attachments.first` : le cas appel s'ajoute à côté, il ne le remplace pas.
- **Indépendance des 4 chantiers** : ce spec touche `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift` + `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift`. Aucun recouvrement avec les 3 autres chantiers (qui touchent `ConversationView.swift` — fichier DIFFÉRENT de `ConversationView+ScrollIndicators.swift` — `MessageMoreSheet.swift`, `MessageActionResolver.swift`, `MeeshyUI/Media/**`). Le seul risque de collision est celui des worktrees externes signalé en tête.

## Tests (TDD)
1. Test SDK : XCTest ne sait pas introspecter la `Shape` passée à un modificateur SwiftUI. Deux patterns disponibles dans ce composant, par ordre de préférence : **(a)** extraire la décision en fonction pure `nonisolated static` testable — exactement le pattern déjà utilisé pour `shouldShowAttachmentPreview(unreadCount:hasAttachmentPreview:)` (`:229`) et `typingLabel(for:)` (`:86`) — par ex. `static func isCompactShape(hasUnreadContent:isOffline:isSearchingQuotedMessage:) -> Bool` ; **(b)** garde de source sur le fichier (précédent dans ce même fichier de tests : `test_typingDotTimer_isDeclaredAsState`). (a) d'abord.
2. **Le mapping des 4 états se teste côté APP, pas côté SDK** — c'est la conséquence directe de l'API opaque : le composant SDK ne fait plus que rendre un `String?` qu'on lui donne, il n'y a plus de règle à y tester. Le test à écrire vit donc dans `apps/ios/MeeshyTests/`, sur la fonction pure app-side qui produit `unreadCallSymbol` / `unreadCallTint` depuis un `CallSummaryMetadata` — à extraire en `static` testable (pattern `CallNoticePresentation`, déjà « internal (not private) for unit-testability », `BubbleCallNoticeView.swift:254-255`). Cas RED, un par ligne du tableau § B :
   - `isLive == true` → glyphe `phone.fill` (audio) / `video.fill` (vidéo), teinte = accent de la conversation, **même quand `outcome == .completed`** (placeholder — vérifie que `isLive` est bien lu en premier) ;
   - `.missed` et `.rejected` → `MeeshyColors.error` ;
   - `.missed` + `endedByInitiator == true` + lecteur initiateur → « annulé », teinte `error` ;
   - `.failed` → `MeeshyColors.warning` (garde anti-régression : ce n'est PAS `error`) ;
   - `.completed` (non live) → `nil` / `nil`, aucun indicateur ;
   - dernier non-lu sans `callSummary` → `nil` / `nil` (le cas nominal texte/pièce jointe n'est pas perturbé).
   Côté SDK, un seul test suffit : `unreadCallSymbol` non nil ⇒ la branche d'aperçu d'appel est retenue ; nil ⇒ comportement identique à aujourd'hui.
3. Non-régression : les tests existants sont dans `packages/MeeshySDK/Tests/MeeshyUITests/ConversationScrollControlsViewTests.swift` et couvrent **uniquement** `typingLabel` (6 cas), `shouldShowAttachmentPreview` (3 cas) et la déclaration `@State` du timer. **Il n'existe AUCUN test de rendu** (pas de test audio play/pause, thumbnail, texte, compteur — contrairement à ce que disait ce point). Ils resteront donc verts quoi qu'il arrive sur la shape : ils ne constituent PAS un filet de sécurité pour ce chantier, d'où l'importance du point 1.
4. Vérification visuelle simulateur : repos = cercle net (pas un rectangle à coins très arrondis qui APPROCHE un cercle sans l'être), contenu riche = capsule/ovale, sur iPhone 16 Pro et iPhone SE 375pt. Vérifier les 4 états (repos, non-lus, hors-ligne, recherche de message cité) et la lisibilité du contenu (`contentColor` bascule blanc/noir selon la luminance de l'accent).
5. Suite SDK complète (`meeshy.sh test` phase 0, scheme `MeeshySDK-Package`) : elle fait partie du verdict du gate, ne pas la sauter.
