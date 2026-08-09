# Sélecteur de lieu iOS — couleurs de conversation, alignement, précision de partage et type de carte

Date : 2026-08-09
Statut : design validé, prêt pour plan d'implémentation

## Problème

La capture du `LocationPickerView` (simulateur, 2026-08-09) montre trois défauts :

1. **La barre de recherche recouvre le bouton de recentrage.** Ce bouton est le
   `MapUserLocationButton` système, rendu par `mapControls` en haut-trailing,
   sous la barre de recherche flottante. Il est inatteignable.
2. **Les couleurs de la conversation ne sont qu'à moitié utilisées.** Le picker
   reçoit un seul `accentColor: String` — qui est en réalité
   `conversation.colorPalette.primary`. La couleur d'accent de la conversation
   (`palette.accent`) n'apparaît nulle part ; le CTA « Confirmer » dégrade
   primary vers primary@80 %, ce qui lit comme un dégradé générique.
3. **Aucun contrôle sur la précision de la position envoyée ni sur le type de
   carte.** Le picker envoie systématiquement les coordonnées brutes, et la
   carte est toujours en mode Plan.

S'y ajoute une redondance : le bouton « Ma position » de la carte du bas et le
`MapUserLocationButton` du haut font la même chose.

## Objectifs

- Utiliser **primary et accent** de la conversation, avec une répartition
  explicite et justifiée.
- **Un seul** contrôle de recentrage, positionné pour ne jamais être masqué par
  la barre de recherche.
- Un bouton `(i)` ouvrant des réglages **persistés et applicatifs** (partagés
  par toute l'app) : niveau de précision du partage de position, type de carte.
- Les mêmes réglages accessibles depuis **Réglages > Confidentialité**.

## Non-objectifs

- Pas de cercle d'imprécision dessiné sur la carte (MapCircle / MKOverlay). La
  carte du bas affichant les coordonnées déjà arrondies suffit à rendre la
  précision lisible, sans le coût MapKit ni le risque de ré-entrance connu
  (cf. `AdaptiveMapInitialRegion`).
- Pas de synchronisation serveur des préférences. Ce sont des préférences
  **frontend applicatives**, au même titre que `MediaDownloadPreferences`.
- Pas de refonte de `LocationFullscreenView` (surface de lecture, pas d'envoi).

## Architecture

### Répartition SDK / App

Le test du grain de `packages/MeeshySDK/CLAUDE.md` s'applique :

| Composant | Cible | Justification |
|---|---|---|
| `LocationPrecision`, `SharedMapStyle`, `LocationSharingPreferences`, `PlaceCoarseNames` | `MeeshySDK/Models/` | Types purs, `Codable`, agnostiques du produit |
| `LocationPrecision.coarsen(_:names:)` | `MeeshySDK/Models/` | Rule engine stateless — même catégorie que `MediaDownloadPolicyEngine.shouldAutoDownload` |
| `LocationSharingPreferencesStore` | `MeeshyUI/Location/` | Store de préférences — le tableau de placement les met au SDK, et `MeeshyUI` en fait partie ; miroir exact de `MediaDownloadPreferencesStore`, qui vit lui aussi dans `MeeshyUI` |
| `AdaptiveInteractiveMap(style:defaultControls:)` | `MeeshyUI/Compatibility/` | Paramètres opaques, aucune règle produit |
| `LocationPickerView` | App | Orchestration UX : cascade permission → relevé → géocodage → coarsening → envoi |
| `LocationSharingSettingsSection` | App | Encode « ces deux réglages vont ensemble dans Meeshy » |
| Section « Position » de `PrivacySettingsView` | App | Écran produit |

### Nouveaux fichiers

```
packages/MeeshySDK/Sources/MeeshySDK/Models/LocationSharingPreferences.swift
packages/MeeshySDK/Sources/MeeshyUI/Location/LocationSharingPreferencesStore.swift
apps/ios/Meeshy/Features/Main/Components/LocationSharingSettingsSection.swift
packages/MeeshySDK/Tests/MeeshySDKTests/Models/LocationPrecisionTests.swift
packages/MeeshySDK/Tests/MeeshyUITests/Location/LocationSharingPreferencesStoreTests.swift
apps/ios/MeeshyTests/Unit/Views/LocationPickerSourceGuardTests.swift
```

### Fichiers modifiés

```
packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveMap.swift
apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift
apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift
apps/ios/Meeshy/Localizable.xcstrings
```

## Modèle de précision

```swift
public enum LocationPrecision: String, Codable, CaseIterable, Sendable {
    case exact          // aucun arrondi — au mieux de ce que rend le GPS
    case around         // 3 décimales  ≈ 100 m
    case neighborhood   // 2 décimales  ≈ 1 km
    case city           // 1 décimale   ≈ 10 km
}
```

`exact` est le défaut : c'est le comportement actuel, et changer silencieusement
la précision de partage d'un utilisateur existant serait une régression
fonctionnelle déguisée en réglage.

L'enum ne porte **aucun libellé**. Il expose `decimalPlaces` et
`approximateRadiusMeters` — de la donnée. Les libellés (« Quartier »,
« ~1 km ») vivent côté app, dans `LocationSharingSettingsSection`. Mettre des
chaînes dans un enum du SDK obligerait à alimenter le catalogue `.module` et
reproduirait le défaut de `LiveLocationDuration.displayText`, qui rend du
français en dur depuis le SDK quelle que soit la langue de l'interface.

### Dégradation par palier

La règle ne se contente pas d'arrondir les coordonnées : envoyer
`« 12 rue de la Paix, Paris »` avec des coordonnées à ±10 km annule l'arrondi.
Le nom et l'adresse sont donc **remplacés** par le composant géographique de
granularité correspondante, pas simplement vidés.

| Niveau | Coordonnées | `name` | `address` | `category` |
|---|---|---|---|---|
| Exacte | brutes | POI / adresse | complète | conservée |
| Autour | 3 déc. | POI / adresse | complète | conservée |
| Quartier | 2 déc. | `subLocality` ⟶ sinon `locality` | `locality, country` | `nil` |
| Ville | 1 déc. | `locality` ⟶ sinon `administrativeArea` | `administrativeArea, country` | `nil` |

Quand aucun composant n'est disponible — plein océan, désert : le cas exact de
la capture (Tessalit, Mali) — `name` et `address` valent `nil` et seules les
coordonnées arrondies partent. C'est une dégradation propre, pas une erreur.

La catégorie POI est vidée aux deux paliers grossiers : `« restaurant »` à
±10 km reste une fuite d'information sur ce que fait la personne.

Le nombre de décimales **affichées** suit le niveau : la carte du bas passe du
`"%.5f, %.5f"` figé à un format dérivé de `LocationPrecision`. Afficher
`20.00000` pour une valeur arrondie au degré près suggérerait une précision qui
n'existe plus.

### Signature

```swift
public struct PlaceCoarseNames: Equatable, Sendable {
    public let subLocality: String?
    public let locality: String?
    public let administrativeArea: String?
    public let country: String?
}

extension LocationPrecision {
    public func coarsen(_ place: SharedPlace, names: PlaceCoarseNames) -> SharedPlace
}
```

Fonction pure, sans dépendance CoreLocation au-delà de `SharedPlace` : testable
sans simulateur ni géocodeur.

## Conséquence sur `LocationPickerModel`

`reverseGeocode` aplatit aujourd'hui le `CLPlacemark` en une seule chaîne
(`[name, thoroughfare, locality, country]` jointe). Le coarsening a besoin des
composants **séparés**. Le modèle conserve donc en plus un
`selectedCoarseNames: PlaceCoarseNames`, alimenté par le même callback de
géocodage — pas de requête supplémentaire.

`selectedPlace` reste la valeur **brute**. Le coarsening est appliqué au moment
de l'envoi et pour l'affichage de la carte du bas, via une propriété calculée
`sharedPlace(at precision:)`. Conserver le brut permet de changer de précision
sans re-géocoder.

## Couleurs

Les sept call sites passent déjà `conversation.accentColor`, qui **est**
`colorPalette.primary`. On dérive l'accent avec la formule officielle du SDK,
`DynamicColorGenerator.hueShiftedHex(primary, degrees: -30)` — ce qui reproduit
exactement `colorPalette.accent`. Aucun call site n'est touché, et la couleur
reste dérivée d'une source unique.

| Élément | Couleur |
|---|---|
| Pin de carte | primary (fill) + accent (halo, ombre portée) |
| CTA « Confirmer » | dégradé **primary → accent** |
| Loupe et curseur du champ de recherche | primary |
| Boutons `(i)` et `⌖` | glyphe **accent** sur verre neutre |
| Suffixe de précision sous les coordonnées | accent |
| Icône de résultat de recherche | accent |
| Ligne sélectionnée dans les réglages | primary |

Les surfaces de verre restent neutres : une barre de recherche et une carte
d'action flottantes lisent comme du chrome, pas comme du contenu de
conversation. C'est la doctrine déjà appliquée dans ce fichier et dans la barre
d'autocomplétion des mentions.

## Layout

```
┌──────────────────────────────┐
│ [🔍 Rechercher un lieu…     ]│  inchangé : top 8, horizontal 16
│                         ⓘ    │  colonne trailing, ancrée SOUS la barre
│                         ⌖    │  (hauteur barre + 12 pt), trailing 16
│              📍              │
│ ┌──────────────────────────┐ │
│ │ ➤ Tessalit, Mali         │ │
│ │   20.0, -0.0 · Ville (~10 km) │
│ │ [      ✓ Confirmer     ] │ │  pleine largeur
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

- `AdaptiveInteractiveMap` reçoit `defaultControls: false` → plus de
  `MapUserLocationButton` ni de `MapCompass` système. C'est le premier qui était
  masqué par la barre.
- Notre `⌖` le remplace. Bénéfice collatéral : il existe aussi sur **iOS 16**,
  où `mapControls` n'existe pas et où il n'y avait donc aucun recentrage une fois
  « Ma position » supprimé.
- Le bouton « Ma position » de la carte du bas disparaît (redondant) ; le CTA
  « Confirmer » prend toute la largeur.
- Chaque bouton de la colonne : cercle de 40 pt, cible tactile 44 pt,
  `adaptiveGlass` neutre, glyphe accent.
- La colonne s'efface (`opacity` 0 + `allowsHitTesting(false)`) dès que
  `searchResults` est non vide : la liste de résultats a la priorité visuelle,
  et c'est le seul recouvrement accepté.

## Feuille `(i)` et section Réglages

`LocationSharingSettingsSection` est une vue unique rendue à deux endroits :
dans une `sheet` depuis le picker, et dans `PrivacySettingsView` entre
*Contacts & Groupes* et *Média & Données*.

Elle est bâtie sur les composants SDK `SettingsSectionHeader` / `SettingsCard` /
`SettingsRow` / `SettingsSeparator` — **pas** sur le motif de
`MediaDownloadSettingsView`. Cette dernière a son propre style local
(`sectionBackground`, `fieldIcon`, coins de 16) qui diffère de celui de
`PrivacySettingsView` (`MeeshyRadius.xxl`, filets encartés). Une vue partagée
entre les deux surfaces doit adopter le style de sa surface la plus contrainte,
sinon la section jurera dans Confidentialité.

Chaque ligne radio est un `Button` enveloppant un `SettingsRow` dont le
`trailing` porte la coche. Le paramètre `info:` de `SettingsRow` n'est pas
utilisé sur ces lignes : le bouton englobant avalerait le tap du `(i)`.

**Section 1 — Précision du partage.** Quatre lignes, icônes `scope`,
`circle.dashed`, `house`, `building.2`. Chaque libellé porte son rayon :
« Autour (~100 m) », « Quartier (~1 km) », « Ville (~10 km) ».

**Section 2 — Type de carte.** Plan / Hybride / Satellite, icônes `map`,
`globe.europe.africa`, `photo`. **Masquée sur iOS 16** : `.mapStyle` est iOS 17+,
et afficher un contrôle sans effet tromperait l'utilisateur — c'est la règle déjà
appliquée au toggle hybride de `LocationFullscreenView`.

Toute sélection écrit dans `LocationSharingPreferencesStore.shared.preferences`,
persisté immédiatement. La carte derrière la feuille change de style en direct.

## Persistance

Miroir exact de `MediaDownloadPreferencesStore` :

- Clé `me.meeshy.locationSharingPreferences`, valeur JSON encodée.
- `@Published var preferences`, sauvegarde avec debounce 100 ms sur la main queue.
- Pas de clé legacy à migrer : la fonctionnalité est neuve.
- Défaut si absent ou illisible : `precision: .exact`, `mapStyle: .standard`.

## Tests

Ordre TDD, RED avant toute ligne de production.

**SDK — `LocationPrecisionTests`**
- Arrondi par niveau, sur une coordonnée à 5 décimales et sur des valeurs
  négatives (l'arrondi doit être symétrique autour de zéro).
- `.exact` est l'identité : coordonnées, nom, adresse et catégorie intacts.
- `.around` conserve nom, adresse et catégorie.
- `.neighborhood` prend `subLocality`, retombe sur `locality` quand il manque,
  et vide `category`.
- `.city` prend `locality`, retombe sur `administrativeArea`, vide `category`.
- `PlaceCoarseNames` entièrement vide → `name` et `address` à `nil`, coordonnées
  quand même arrondies.
- Roundtrip `Codable` de `LocationSharingPreferences`.

**SDK — `LocationSharingPreferencesStoreTests`**
- Chargement depuis un `UserDefaults` de test vide → défauts.
- Chargement d'une valeur encodée → valeur restituée.
- JSON corrompu → défauts, pas de crash.

**App — `LocationPickerModelTests`** (comportement, pas texte du source)
- `sharedPlace(at: .exact)` rend le lieu brut.
- `sharedPlace(at: .neighborhood)` rend des coordonnées à 2 décimales et le
  `subLocality` capté par le géocodage.
- `sharedPlace(at:)` rend `nil` tant qu'aucune coordonnée n'est choisie.

C'est là que se joue « ce qui part est bien coarsé » : le picker n'appelle plus
que `sharedPlace(at: store.preferences.precision)`, une fonction testable.

**App — `LocationPickerSourceGuardTests`** (deux gardes seulement)
- le picker n'instancie plus `MapUserLocationButton` ;
- il ne contient plus la clé `location.my-position`.

Une troisième garde vérifiant que `onSelect` ne reçoit jamais `selectedPlace`
brut a été écartée : c'est une assertion sur le texte du source, que le moindre
`extract` casse sans qu'aucun comportement ne change. Le test de comportement
ci-dessus couvre la même propriété sans cette fragilité.

## Localisation — porte de test, pas finition

`FrenchDefaultValueRatchetTests` est un **cliquet à zéro tolérance** : sa liste
de dette est vide depuis le 2026-07-29. Toute clé neuve sous `apps/ios/Meeshy/`
dont le `defaultValue` porte un marqueur français (accent, ou mot-outil de sa
liste) et qui n'est pas au catalogue fait **échouer la suite**.

Chaque clé introduite par ce lot entre donc dans
`apps/ios/Meeshy/Localizable.xcstrings` dans les **7 langues** du catalogue :
`fr` (source), `en`, `es`, `de`, `it`, `pt-BR`, `ar`.

Le cliquet est aveugle aux libellés sans accent ni mot-outil — « Quartier »,
« Autour », « Satellite » passeraient sous son radar. On les catalogue quand
même : un libellé de réglage non traduit sortirait en français dans une
interface anglaise, ce que le cliquet vise à empêcher même là où il ne le voit
pas.

## Risques

**Ré-entrance MapKit.** Le fichier documente longuement un gel du main thread
causé par un cycle `objectWillChange` → re-render → `updateUIView`. Ajouter
`style` à `AdaptiveInteractiveMap` introduit une nouvelle entrée qui change à
chaud. Mitigation : `style` est une valeur `Equatable` passée en `let`, appliquée
par `.mapStyle` — un modificateur, pas une écriture de camera position. Il ne
touche ni `position` ni `region`, donc n'ouvre pas le chemin de ré-entrance.

**Primaire désaturée.** `shiftHue` passe par `UIColor.getHue` : sur une couleur
grise (saturation ≈ 0), un décalage de teinte rend la couleur inchangée, donc
`accent == primary` et le dégradé du CTA devient plat. Non atteignable en
pratique — `blendColors` mélange trois couleurs de palette toutes saturées à
65 % ou plus, et le repli `colorForName` puise dans la même palette. Noté sans
mitigation : ajouter un garde-fou coûterait plus que le défaut qu'il couvre.

**Champ privé lu depuis un fichier frère.** Aucune extension `LocationPickerView+*`
n'est créée ; le piège « inaccessible due to private protection level » documenté
dans `apps/ios/CLAUDE.md` ne s'applique pas ici.

**Coche de non-régression sur l'envoi.** Sept call sites consomment le
`SharedPlace`. Le coarsening étant appliqué à l'intérieur du picker, aucun n'est
modifié — mais tous voient désormais un lieu potentiellement moins précis. C'est
l'effet voulu, et il est piloté par un réglage dont le défaut préserve le
comportement actuel.

## Vérification

- `xcodebuild test -scheme MeeshySDK-Package` vert (phase 0).
- `./apps/ios/meeshy.sh build` vert.
- Contrôle visuel au simulateur : barre de recherche ne recouvrant plus le
  recentrage, dégradé primary → accent sur le CTA, suffixe de précision suivant
  la sélection, style de carte persistant après relance de l'app.
