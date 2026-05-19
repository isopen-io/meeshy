# Bubble Footer Unification — Design

- **Date** : 2026-05-19
- **Statut** : design validé (brainstorming) — en attente du plan d'implémentation
- **Périmètre** : iOS uniquement (`apps/ios/`)

## Problème

Le footer des bulles de message est éclaté sur ~4 chemins de rendu incohérents :

- `identityBarSection` (`BubbleStandardLayout`) → 2 variantes `UserIdentityBar` (`metaRow` / `messageBubble`)
- `BubbleMediaTimestampOverlay` + `BubbleMediaDeliveryCheckmark` (capsule sur image)
- `audioTranslationRow` + barre d'identité injectée (widget audio)
- la coche de livraison est ré-implémentée 2-3 fois différemment

`identityBarSection` mélange **identité** (avatar/nom) et **méta** (horodatage/coche/drapeaux). Ajouter un footer à un nouveau type de bulle oblige à choisir et adapter l'un de ces chemins.

## Objectif

Un seul système de footer — un **modèle descripteur flexible** + **une seule vue** — utilisé par tous les types de bulle : texte, emoji-sans-bulle, image, carrousel d'images, vidéo (avec/sans bulle), réponse à une story, audio.

Invariant de layout : affordances secondaires à gauche, **horodatage + coche de livraison à droite**.

## Architecture

### `BubbleFooterModel` — le descripteur (« contrôleur »)

Value type pur (`Equatable`, `Sendable`), **données uniquement**. Construit **synchroniquement** dans `BubbleContentBuilder` en même temps que `BubbleContent` (aucun I/O, aucun async → instantané). Exposé comme `BubbleContent.footer`.

```swift
struct BubbleFooterModel: Equatable, Sendable {
    var sender: SenderIdentity?      // identité — présent = message reçu ; nil = aucune identité
    var flags: [FooterFlag]          // drapeaux de langue
    var showsTranslate: Bool         // icône translate
    var timestamp: String?           // nil = masqué (gating ou par design)
    var delivery: DeliveryStatus?    // nil = message reçu / masqué
    var isPending: Bool              // .sending / .clock / .slow / .invisible
    var isFailed: Bool               // .failed
    var isOffline: Bool              // réseau hors-ligne → sablier au lieu de l'horloge
    var isMe: Bool                   // bulle sortante (fond teinté) → texte/glyphes blancs
}

struct SenderIdentity: Equatable, Sendable {
    var name: String
    var username: String?            // 2e ligne du footer-identité
    var role: MemberRole?            // badge rôle (créateur/admin/modérateur) ; nil ou .member = aucun badge
    var avatarURL: String?
    var accentColor: String          // teinte de l'avatar
    var moodEmoji: String?           // emoji d'humeur posé sur l'avatar
    var presence: PresenceState      // pastille en-ligne / absent sur l'avatar
    var storyRing: StoryRingState    // anneau de story autour de l'avatar
}

struct FooterFlag: Equatable, Sendable {
    var code: String                 // code langue (ex. "fr")
    var isActive: Bool               // langue actuellement affichée → soulignée + agrandie
}
```

**Énumération complète des éléments du footer** (audit contre `UserIdentityBar` / `BubbleMediaTimestampOverlay` / `BubbleDeliveryBadge`) :

| Élément | Source modèle | Notes |
|---|---|---|
| Avatar | `sender.avatarURL` + `accentColor` | porte aussi mood / présence / anneau story |
| Pastille de présence | `sender.presence` | sur l'avatar (en-ligne / absent / hors-ligne) |
| Emoji d'humeur | `sender.moodEmoji` | sur l'avatar |
| Anneau de story | `sender.storyRing` | autour de l'avatar |
| Nom | `sender.name` | ligne 1 du footer-identité |
| Nom d'utilisateur | `sender.username` | ligne 2 du footer-identité |
| Badge de rôle | `sender.role` | masqué si `.member` |
| Drapeaux de langue | `flags` | chacun : actif/inactif |
| Icône translate | `showsTranslate` | |
| Horodatage | `timestamp` | toujours à droite |
| Coche de livraison | `delivery` | voir `BubbleDeliveryCheck` |
| Sablier hors-ligne / bouton relance | `isOffline` / `isFailed` | voir `BubbleDeliveryCheck` |

Les éléments génériques de `UserIdentityBar` (`.memberSince`, `.actionButton`, `.actionMenu`) **ne sont pas** des éléments de footer de message — ils restent sur `UserIdentityBar` pour les écrans profil/listing/commentaire. `BubbleFooter` ne couvre que l'ensemble ci-dessus.

**Composabilité** — chaque élément visuel est conditionné par son propre champ. États valides :

- coche seule (`delivery` renseigné, tout le reste nil/`[]`)
- coche + horodatage
- drapeaux + translate + horodatage + coche
- complet (avec `sender`)

Le footer rend **exactement** ce que le modèle porte, ni plus ni moins.

**Extensibilité** — un nouvel élément de footer plus tard = un nouveau champ optionnel (nil/`[]` = absent). Aucune rupture pour les appelants existants. Pas de système de plugin (YAGNI).

### `BubbleFooterActions` — callbacks par élément

Les callbacks sont **séparés du modèle** (les closures ne sont pas proprement `Equatable` ; les garder dehors permet au modèle de piloter `.equatable()`). Chacun est **optionnel** — le consommateur câble uniquement ce qu'il souhaite, sur l'élément qu'il souhaite.

```swift
struct BubbleFooterActions {
    var onFlagTap: ((String) -> Void)? = nil   // code drapeau → change le contenu affiché de la bulle
    var onTranslate: (() -> Void)? = nil       // icône translate → ouvre le sheet de traduction
    var onRetry: (() -> Void)? = nil           // livraison échouée → relance l'envoi
    var onSenderTap: (() -> Void)? = nil       // avatar / nom → ouvre le profil
    var onViewStory: (() -> Void)? = nil       // anneau de story de l'avatar → ouvre la story du sender
}
```

Énumération complète des actions : `onFlagTap`, `onTranslate`, `onRetry`, `onSenderTap`, `onViewStory`. Chacune optionnelle et indépendante — le consommateur câble ce qu'il veut sur l'élément qu'il veut.

Règles de câblage par élément, appliquées par la vue :

| Élément | Affiché si | Interactif si |
|---|---|---|
| `sender` (avatar + nom) | `sender != nil` | `onSenderTap != nil` |
| anneau de story | `sender?.storyRing != .none` | `onViewStory != nil` |
| menu contextuel avatar | appui long, si ≥ 1 action | « Voir la story » (`onViewStory`) + « Voir le profil » (`onSenderTap`) |
| `flags` | `!flags.isEmpty` | `onFlagTap != nil` |
| icône translate | `showsTranslate && onTranslate != nil` | toujours (élément purement actionnable) |
| `timestamp` | `timestamp != nil` | jamais (affichage seul) |
| coche `delivery` | `delivery != nil` | bouton de relance si `isFailed && onRetry != nil` |

### `BubbleFooter` — la vue

`BubbleFooter(model:, actions:, style:)` — **une seule** vue `Equatable` (égalité via `model` ; `.equatable()` garde les cellules de liste à zéro re-render).

Deux styles, même `model` / `actions` :

- **`.row`** — `HStack { [sender? · flags · translate] · Spacer · [horodatage · coche] }`. Pour texte, emoji-sans-bulle, audio (slot bas du widget audio), réponse story.
- **`.overlay`** — capsule sombre `[horodatage · coche]` posée sur le média. Pour image / carrousel / vidéo (validé : la capsule reste sur la photo).

### `BubbleDeliveryCheck` — la vue de coche

Une seule vue de glyphe de livraison. **Énumération complète des états** (tous les cas de `MeeshyMessage.DeliveryStatus` + l'état hors-ligne) :

| État | Glyphe | Notes |
|---|---|---|
| `.invisible` | aucun (placeholder vide) | debounce 0–200 ms après envoi — layout stable |
| `.sending` / `.clock` | horloge | `.clock` (200 ms–5 s) légèrement atténuée |
| `.slow` | horloge-alerte | 5 s–30 s, couleur `warning` |
| `.sending`/`.clock`/`.slow` **+ `isOffline`** | **sablier** | remplace l'horloge quand le réseau est hors-ligne |
| `.sent` | coche simple | |
| `.delivered` | double-coche | |
| `.read` | double-coche grasse | blanc plein sur bulle teintée (`isMe`), `indigo400` sinon |
| `.failed` | glyphe d'erreur | + bouton de relance si `onRetry` est câblé |

Paramétrée par un `tint` (issu de `isMe` / du style) pour rester lisible sur une ligne claire **et** sur la capsule sombre. Remplace `BubbleMediaDeliveryCheckmark`, le glyphe interne de `UserIdentityBar`, et `BubbleDeliveryBadge` (sablier/relance) — les 3 implémentations dispersées fusionnent ici.

### Visibilité — le builder

`BubbleFooterModel.make(...)` est une **fonction pure** absorbant tout le gating : horodatage gaté au dernier envoyé / dernier reçu en conversation directe, toujours affiché en groupe, toujours affiché pour les messages en attente (`isPendingDelivery`), `delivery` nil pour les messages reçus.

Entrées : `BubbleContent`, statut de livraison du message, `isDirect`, `isLastSentMessage`, `isLastReceivedMessage`, `isLastInGroup`, état réseau. Sortie : un `BubbleFooterModel`. Pure → testable unitairement.

## Comportements

Énumération complète des comportements du footer :

1. **Gating de l'horodatage** — direct : dernier envoyé / dernier reçu uniquement ; groupe : toujours ; message en attente : toujours (`isPendingDelivery`). Décidé dans le builder.
2. **Horodatage toujours à droite — abandon de `inlineTime`** — aujourd'hui les conversations de groupe affichent l'heure en ligne avec le nom (`Nom · 12:45`). Le footer unifié édge-pin **toujours** l'horodatage à droite (cohérence « horodatage à droite » demandée). `inlineTime` est supprimé — changement de comportement intentionnel et assumé pour les groupes.
3. **Teinte `isMe`** — bulle sortante (fond coloré) : texte d'heure + glyphes en blanc atténué, `.read` en blanc plein. Bulle reçue : couleurs de thème. Style `.overlay` : toujours blanc sur la capsule sombre.
4. **Convention « méta vide »** — `timestamp == nil && delivery == nil` → le groupe de droite n'émet aucune vue (pas de `Spacer` glouton qui étirerait la ligne).
5. **Debounce optimiste** — `.invisible` (0–200 ms après envoi) : aucun glyphe, layout stable ; puis transition vers `.clock`. Le footer reflète l'état, ne le pilote pas.
6. **Footer-identité 2 lignes** — quand `sender != nil`, le style `.row` rend deux lignes : ligne 1 `[avatar · nom · rôle · drapeaux · translate] ··· [heure · coche]`, ligne 2 `[username]` (reprend l'actuel `messageBubble`). Sans `sender` : une seule ligne.
7. **Menu contextuel avatar** — appui long sur l'avatar → menu : « Voir la story » (si `storyRing != .none` et `onViewStory` câblé) + « Voir le profil » (si `onSenderTap` câblé).

## Couverture

| Type de bulle | Footer | Style |
|---|---|---|
| Texte | `BubbleFooter` | `.row` (dans la bulle) |
| Emoji-sans-bulle | `BubbleFooter` | `.row` |
| Audio | `BubbleFooter` | `.row` (slot bas du widget audio) |
| Image / carrousel | `BubbleFooter` | `.overlay` (capsule) |
| Vidéo (avec/sans légende) | `BubbleFooter` | `.overlay` sur le cadre ; `.row` si bulle-légende |
| Réponse à une story | `BubbleFooter` | `.row` |

**Drapeaux audio** : le widget audio remplace `audioTranslationRow` par `BubbleFooter(.row)`. `AudioMediaView` construit son propre `BubbleFooterModel` (`flags` = langues audio depuis `translatedAudios`) et câble `onFlagTap` sur la commutation de langue audio (`selectedAudioLangCode`). Le modèle a la même forme ; seul le consommateur change ce que les drapeaux signifient — c'est la flexibilité visée.

## Fichiers

**Nouveaux** (`apps/ios/Meeshy/Features/Main/Views/Bubble/`) — chacun exige des entrées pbxproj manuelles (objectVersion 63 ; 4 entrées + 2 UUID par fichier) :

- `BubbleFooterModel.swift` — `BubbleFooterModel`, `BubbleFooterActions`, `SenderIdentity`, `FooterFlag`, le builder `make(...)`.
- `BubbleFooter.swift` — la vue + les deux styles.
- `BubbleDeliveryCheck.swift` — le glyphe de livraison unifié.

**Tests** : `apps/ios/MeeshyTests/Unit/ViewModels/BubbleFooterModelTests.swift`.

**Modifiés** :

- `BubbleContent.swift` / `BubbleContentBuilder.swift` — construisent `BubbleContent.footer`.
- `BubbleStandardLayout.swift` — `identityBarSection` → `BubbleFooter` ; `shouldShowTime` / `isPendingDelivery` / `shouldShowDelivery` migrent dans le builder.
- `BubbleMetaBadges.swift` — `BubbleMediaTimestampOverlay` / `BubbleMediaDeliveryCheckmark` → `BubbleFooter(.overlay)` / `BubbleDeliveryCheck` (ou shims fins).
- `ConversationMediaViews.swift` — l'audio utilise `BubbleFooter` ; `audioTranslationRow` supprimé.
- `ThemedMessageBubble+Media.swift` — image / carrousel / vidéo utilisent `BubbleFooter(.overlay)`.

## Tests

- Suite unitaire sur `BubbleFooterModel.make()` : gating direct (dernier envoyé/reçu vs intermédiaire), groupe (toujours), `isPending` (toujours), `isFailed`, message reçu (`delivery == nil`). Fonction pure → tests directs sans `@MainActor`.
- `BubbleFooter` / `BubbleDeliveryCheck` : vérification de build + contrôle visuel sur simulateur.
- `./apps/ios/meeshy.sh build` et `./apps/ios/meeshy.sh test` verts avant livraison.

## Hors périmètre

- Pas de modification de `UserIdentityBar` (composant SDK) au-delà du nécessaire ; `BubbleFooter` est app-side, comme `BubbleContent`. `UserIdentityBar` continue de servir les écrans profil / listing / commentaire.
- Fichiers `StoryViewerView*` non touchés (travail en cours d'un autre agent) ; le footer reste agnostique du type de bulle.
- Pas de changement de la **fréquence** d'affichage de l'horodatage (gating actuel conservé — validé) ; la refonte ne change que la **position** et la **cohérence** du rendu (dont l'abandon de `inlineTime`).
- Les badges décoratifs **edited / pinned / forwarded / ephemeral** (`BubbleEditedIndicator`, `BubblePinnedIndicator`, `BubbleForwardedIndicator`, `BubbleEphemeralBadge`) ne sont **pas** des éléments de footer — ils restent des décorations de bulle distinctes. Ils pourront être intégrés plus tard via les champs optionnels du modèle (extensibilité) si le produit le décide.

## Risques

- **pbxproj classique** : 3 nouveaux fichiers → entrées manuelles ; un oubli casse le build. Vérifier après ajout.
- **Migration du gating** : déplacer `shouldShowTime` dans le builder doit préserver le comportement exact à l'octet près — la suite de tests du builder est la garde.
- **`.equatable()` sur `BubbleFooter`** : l'égalité ne porte que sur `model` ; si une action change sans que le modèle change, le re-câblage doit rester correct (les actions sont sans état, donc sûr).
