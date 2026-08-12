# Iteration 220i — Contraste des feuilles sous forçage sombre + dernier `NavigationView`

**Date** : 2026-07-26
**Piste** : iOS (suffixe `i`)
**Branche** : `claude/quirky-curie-bj90ld`
**Base** : `main` HEAD `ffef1339e` (#2325 dernier merge)
**Essaim** : `list_pull_requests` (open) = **0 PR** → aucune collision de fichiers possible.

---

## Contexte : la dette épinglée par 219i est débloquée

Le pointeur 219i listait cinq pistes pour 220i+, dont trois bloquées par des PR en vol.
Ces trois PR sont **toutes mergées** depuis :

| Piste | Bloquant | État |
|---|---|---|
| (b) resserrer l'ensemble SSOT du test de partage | #2325 | mergée (`ffef1339e`) |
| (d) `StatusComposerView` `NavigationView`→`NavigationStack` | #2275 | mergée (`131f7939e`) |
| (e) `Localizable.xcstrings` pour `MeeshyShareExtension` | #2319 | mergée (`26b8ef1d8`) |
| (c) **audit Dark Mode généralisé** | — | jamais bloquée |

220i traite **(c)** et **(d)**. La piste (e) est **abandonnée sur constat** (voir plus bas) ;
(a) et (b) restent ouvertes.

---

## A. Le balayage Dark Mode (piste (c)) — ce qu'il a trouvé

### A.1 La famille de défaut de 219i est éteinte sous sa forme directe

219i avait pour signature : *une couleur de marque de mode CLAIR posée
inconditionnellement, dans un fichier qui ne lit pas le `colorScheme`.* Balayage de
`apps/ios/Meeshy` sur `MeeshyColors.indigo{50,100,200,300}` — les jetons dont la valeur
n'a de sens qu'en mode clair — en excluant les fichiers qui portent un signal
d'adaptation (`isDark`, `colorScheme`, `ThemeManager`, `theme.`) :

```
0 fichier
```

Les deux seuls porteurs de ces jetons (`MessageDaySeparator`, `LinkPreviewCard`) reçoivent
`isDark` en paramètre — c'est le patron leaf-view correct. **La forme directe du défaut
n'existe plus dans l'app.**

### A.2 La forme INDIRECTE, elle, était bien vivante — et pire

219i avait identifié le vrai piège en note : *« toute surface descendant de
`StoryViewerView` doit se brancher sur `colorScheme`, JAMAIS sur `ThemeManager.mode` »*.
Le balayage a donc été refait par **point de présentation** plutôt que par jeton.

`StoryViewerView.swift:453` porte `.preferredColorScheme(.dark)` sur `viewerContent`, et
`body` (l. 688) **est** `viewerContent` — toutes les `.sheet` / `.fullScreenCover`
attachées ensuite en héritent. **Huit** présentations descendent de cette hiérarchie, et
toutes ont été examinées :

| Présentation | Source des couleurs | Fond opaque à elle ? | Verdict |
|---|---|---|---|
| `StoryViewersSheet` | `colorScheme` | — | ✅ correct |
| `StoryExportShareSheet` | `colorScheme` | — | ✅ soldé en 219i |
| `ShareSheet` (lien traçable) | UIKit natif | — | ✅ |
| `SharePickerView` | `ThemeManager` (11×) | **oui** (`theme.backgroundPrimary`) | ⚠️ incohérent, pas illisible |
| `StoryComposerView` (SDK) | aucune (`colorScheme`) | oui | ✅ correct |
| `UnifiedPostComposer` (SDK) | `ThemeManager` (10×) | **oui** (`theme.backgroundPrimary`) | ⚠️ même catégorie que `SharePickerView` — hors périmètre (SDK) |
| `UserProfileSheet` (SDK) | `ThemeManager` (20×) | — | ⚠️ à instruire — hors périmètre (SDK) |
| **`ReportMessageSheet`** | **`ThemeManager` (10×)** | **NON** | ❌ **rupture de contraste** |

Le discriminant est la colonne « fond opaque à elle ». `SharePickerView` peint son propre
`theme.backgroundPrimary` : sous le forçage sombre, un utilisateur en thème clair obtient
une feuille entièrement claire — dépaysante, mais **cohérente et lisible**, car son texte
de thème clair est posé sur son fond de thème clair. `ReportMessageSheet` n'a **aucun fond
à elle** : elle s'appuie sur le fond de feuille système, lequel suit le mode **rendu**.
Les deux référentiels se croisent donc directement, texte contre fond.

### A.3 `ReportMessageSheet` — le défaut, mesuré

**Un seul point de présentation**, et c'est justement celui-là :
`StoryViewerView+Sidebar.swift:1063`. La feuille ne se rend donc **jamais** hors forçage
sombre : elle est dans son état fautif **en permanence**, pour tout utilisateur dont le
thème d'app n'est pas « Sombre ».

`ThemeManager.textPrimary` vaut littéralement `MeeshyColors.textPrimary(isDark: mode.isDark)`,
et `mode` porte le thème **choisi dans l'app**. Pour un utilisateur en thème clair,
`mode.isDark == false` → `indigo950` (`#1E1B4B`, presque noir) — peint sur le fond de
feuille système sombre (`#1C1C1E`, presque noir).

Mesures WCAG 2.1 (composition alpha « source over », linéarisation sRGB, luminance
relative). Seuil AA texte normal = **4,5:1** :

| Élément | Couleur écrite | Sur | Avant | Après |
|---|---|---|---|---|
| Titre « Pourquoi signalez-vous… » | `textPrimary` | fond de feuille | **1,06:1** | **15,22:1** |
| Libellé « Détails (facultatif) » | `textSecondary` (α 0,6) | fond de feuille | **1,50:1** | **8,53:1** |
| Texte saisi dans le champ | `.primary` (**blanc**) | `inputBackground` | **1,10:1** | **17,99:1** |
| *(mode clair, non touché)* | `textPrimary` | blanc | 15,99:1 | **15,99:1** |

Le troisième cas est le plus révélateur : le `TextField` ne fixe pas la couleur de son
texte, donc celui-ci est `.primary` — **blanc** sous le forçage sombre — tandis que son
fond venait du thème clair (`#F5F3FF`, presque blanc). **L'utilisateur ne voyait pas ce
qu'il tapait.**

**C'est un parcours de sûreté** : signaler du harcèlement, de la violence ou de
l'usurpation d'identité. Le formulaire était illisible pour la majorité des utilisateurs
(tout thème sauf « Sombre »).

### A.4 Le correctif, et pourquoi `colorScheme` est *strictement* meilleur

La vue **déclarait déjà** `@Environment(\.colorScheme)` et `isDark` — et ne s'en servait
nulle part (l. 9-10). Le signal était présent, inutilisé. Le correctif le branche.

L'invariant qui rend le changement sûr, vérifié dans `MeeshyApp.swift:162` :

```
.preferredColorScheme(theme.preferredColorScheme)
```

`ThemePreference` pilote **les deux** référentiels depuis la même préférence :

| Préférence | `preferredColorScheme` | `colorScheme` rendu | `mode.isDark` | accord ? |
|---|---|---|---|---|
| `.light` | `.light` | `.light` | `false` | ✅ |
| `.dark` | `.dark` | `.dark` | `true` | ✅ |
| `.system` | `nil` (pas de forçage) | système | système | ✅ |

Les deux coïncident donc **partout dans l'app** ; ils ne divergent que sous un
`.preferredColorScheme` **imbriqué** — où `colorScheme` a raison et `mode` a tort.
`colorScheme` est ainsi égal au thème partout, et correct **en plus** sous un forçage :
le remplacement est un **no-op** dans tout contexte non forcé, et une **réparation** dans
le seul contexte où cette feuille est présentée.

Le correctif n'introduit **aucune valeur de couleur nouvelle** : `ThemeManager.textPrimary`
étant déjà défini comme `MeeshyColors.textPrimary(isDark:)`, passer à
`MeeshyColors.textPrimary(isDark: isDark)` ne change **que la source du booléen**. La
parité des valeurs est vraie *par construction*, pas par recopie. Seul
`ThemeManager.inputBackground` n'a pas d'équivalent `(isDark:)` exposé par `MeeshyColors` :
il est repris mot pour mot dans une fonction pure colocalisée `ReportSheetPalette`
(idiome 219i `StoryExportSheetPalette`), et les deux littéraux sont verrouillés par test.

### A.5 Ce qui a été examiné et délibérément **non** modifié

- **`SharePickerView`** — mélange `theme.*` (11 sites) et `isDark`/`colorScheme` (2 sites,
  des voiles à 3 %/6 % qui s'inversent sous le forçage). Son fond opaque à elle la rend
  **lisible** ; le défaut y est cosmétique, pas un échec de contraste. La corriger
  imposerait de trancher tout le fichier sur un seul référentiel — un refactor à part,
  sans urgence d'accessibilité. **Consigné, pas corrigé.**
- **`UserProfileSheet`** — 20 lectures `ThemeManager`, aucune de `colorScheme`, présentée
  elle aussi sous forçage. Mais elle vit dans `packages/MeeshySDK/Sources/MeeshyUI/` :
  **hors périmètre** de cette routine (iOS-app uniquement). À porter à une itération SDK.

---

## B. Dernier `NavigationView` (piste (d))

`StatusComposerView.swift:37` était le **dernier** `NavigationView` des trois cibles
expédiées, épinglé depuis 214i par `NavigationContainerMigrationTests` avec un attendu
explicite `{"StatusComposerView.swift"}` et un commentaire disant de réduire cet ensemble
dès que la PR détentrice (#2275) atterrirait. Elle a atterri.

`NavigationView` est déprécié depuis iOS 16 et adopte par défaut le style à deux colonnes :
en environnement de largeur régulière (iPad), un `NavigationView` à enfant unique se rend
comme un split view dont la colonne de détail est vide — masquant le contenu de la feuille
et déplaçant son unique affordance de fermeture. Le plancher de déploiement du projet est
iOS 16.0 (`project.yml`), donc `NavigationStack` est disponible **sans garde de
disponibilité**.

Balayage après migration sur `Meeshy` + `MeeshyShareExtension` + `MeeshyNotificationExtension` :

```
0 occurrence de "NavigationView {"
```

Le test change donc de nature : d'**épinglage de dette tolérée**, il devient une
**interdiction pure** (attendu = ensemble vide). Toute réintroduction le fait virer au
rouge.

Au passage, `StatusComposerView` portait le même `isDark` mort que `ReportMessageSheet`.
Il est supprimé — mais `@Environment(\.colorScheme)` est **conservé et documenté** : `theme`
y est lu sans `@ObservedObject`, donc cette dépendance d'environnement est la **seule**
chose qui ré-évalue la vue quand le mode bascule. La supprimer figerait les jetons `theme.*`
sur leur valeur d'ouverture. C'est un piège qu'un nettoyage naïf aurait déclenché.

---

## C. Piste (e) abandonnée sur constat — `MeeshyShareExtension`

La piste demandait de câbler un `Localizable.xcstrings` à l'extension de partage
(3 chaînes crues : `Button("Cancel")`, `Button("Send")`, `.navigationTitle("Share to Meeshy")`).
Le déblocage de #2319 la rendait faisable. Elle est **abandonnée**, pour trois constats
vérifiés qui rendent le travail sans valeur utilisateur :

1. **La cible n'est pas expédiée.** `project.yml:90` retire délibérément
   `MeeshyShareExtension` des `dependencies` de l'app : le bundle id
   `me.meeshy.app.share-extension` n'est pas enregistré côté Apple Developer, et l'embarquer
   fait échouer l'archive de distribution. Elle compile isolément, mais **n'atteint aucun
   utilisateur**.
2. **Le sélecteur de contacts est peuplé de données fabriquées, toujours.**
   `loadRecentContacts()` lit la clé `recent_contacts` de l'App Group — clé que
   **personne n'écrit** dans tout le dépôt (`grep` : 1 référence, la lecture elle-même).
   Le `guard else` tombe donc **à 100 %** sur `ContactPreview.sampleContacts` :
   « John Doe », « Jane Smith », « Bob Johnson ».
3. **Le chemin d'envoi ne mène nulle part.** `sendToContact` → `saveSharedContent` écrit la
   clé `pending_shared_content`, que **personne ne lit** (`grep` : 1 référence, l'écriture).

Localiser en cinq langues le chrome d'un écran qui n'est pas expédié, dont les contacts
sont fictifs et dont le bouton d'envoi écrit dans le vide serait du polissage de maquette.
**Le vrai travail est produit, pas i18n** : exporter les conversations récentes vers l'App
Group, consommer `pending_shared_content` côté app, puis finir le dossier de signature.
Consigné dans le pointeur pour qu'aucune itération future ne re-tente l'angle i18n.

---

## D. Vérification

### Tests neufs — `ReportMessageSheetPaletteTests` (10 tests)

Ils **mesurent le contraste réel** plutôt que de comparer des `Color` (l'égalité
structurelle SwiftUI ne dit rien du pixel produit, et peut virer au vert par accident) :
`UIColor(color).getRed`, composition « source over », linéarisation sRGB, luminance
relative WCAG 2.1.

Les trois **références du défaut** réécrivent explicitement les valeurs fautives et les
assertent `< 4,5` : la divergence avant/après est prouvée **dans** le test, sans dépendre
de l'historique git. Deux tests de **loi structurante** balaient la source :
`ReportMessageSheet` ne doit contenir aucune lecture `ThemeManager` (commentaires retirés
avant balayage) et doit porter `@Environment(\.colorScheme)` ; et le point de présentation
sous forçage sombre est ancré, car c'est lui qui rend la démonstration valide.

### Dette de test remboursée

`WCAGContrast` (`MeeshyTests/Helpers/`) extrait la mesure WCAG dupliquée. Les membres
privés de `StoryExportShareSheetPaletteTests` deviennent une **façade mince** qui délègue :
ses 25 sites d'appel restent **inchangés mot pour mot**, ce qui rend la convergence
vérifiable par `grep` plutôt que par relecture. Il n'y a plus qu'**une** implémentation de
la formule.

`@MainActor` sur le helper est délibéré : `MeeshyTests` est compilé en
`SWIFT_DEFAULT_ACTOR_ISOLATION: nonisolated` (sinon chaque `XCTestCase` casse, cf.
`project.yml:227`), mais les ponts `UIColor(_: Color)` sont historiquement appelés depuis
des classes de test `@MainActor`. Épingler l'outillage au main actor **reproduit exactement
le contexte d'appel existant** au lieu d'en ouvrir un nouveau.

### RED prouvé contre `ffef1339e`

- `ReportSheetPalette` n'y existe pas → la suite neuve n'y compile pas.
- `test_theSheetResolvesItsSurfacesFromTheRenderedColorScheme` : la source y contient
  `ThemeManager` hors commentaire (10 sites) → rouge.
- `test_noNavigationViewRemains` : `StatusComposerView.swift` y porte `NavigationView {` →
  rouge sur l'ensemble vide.

### Sans toolchain Swift (Linux)

- **7 assertions numériques recalculées indépendamment hors Xcode (7/7)** — reproduction
  autonome de la formule WCAG en Python, résultats identiques aux valeurs du tableau A.3.
- Valeurs `indigo50/300/700/950` vérifiées contre `MeeshyColors.swift`.
- Les 4 assertions de balayage de source simulées avec la logique exacte de dépouillement
  des commentaires (4/4 conformes).
- Tokenizer accolades/parenthèses/crochets (chaînes et commentaires exclus) sur les
  6 fichiers modifiés : **0/0/0**.
- `0` édition de `project.pbxproj` — les deux fichiers de test neufs sont pris par le
  globbing récursif de `project.yml`, que la CI régénère via `xcodegen generate`.

**Gate** : CI `iOS Tests`.

---

## E. Périmètre

| Fichier | Δ |
|---|---|
| `Meeshy/Features/Main/Components/ReportMessageSheet.swift` | +35 / −10 |
| `Meeshy/Features/Main/Views/StatusComposerView.swift` | +5 / −2 |
| `MeeshyTests/Helpers/WCAGContrast.swift` | **neuf** (105 l.) |
| `MeeshyTests/Unit/Views/ReportMessageSheetPaletteTests.swift` | **neuf** (10 tests) |
| `MeeshyTests/Unit/Views/StoryExportShareSheetPaletteTests.swift` | +16 / −42 (façade, math déléguée) |
| `MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift` | +16 / −11 |

**2 fichiers de production** (+40 / −12), 4 fichiers de test.

**0** clé i18n neuve · **0** changement en mode clair (prouvé) · **0** logique · **0** réseau
· **0** layout · **0** valeur de couleur nouvelle.

---

## F. Restes pour 221i+

1. **`UserProfileSheet` (SDK)** — 20 lectures `ThemeManager`, 0 `colorScheme`, présentée
   sous le forçage sombre du lecteur de stories. Même famille que 220i. Vit dans
   `packages/MeeshySDK/Sources/MeeshyUI/` → nécessite une itération SDK, hors périmètre iOS-app.
2. **`SharePickerView`** — trancher tout le fichier sur un seul référentiel
   (`colorScheme`), ce qui aligne aussi ses voiles 3 %/6 % inversés. Cosmétique, pas a11y.
3. **`StoryViewerView+Content.shareStory()`** — code mort, 0 site d'appel (établi 217i).
   Sa suppression permettrait de resserrer l'ensemble toléré du test SSOT de 219i.
4. **Ensemble SSOT de 219i** — #2325 est mergée ; vérifier si `TrackingLinkDetailView` a
   bien convergé, et retirer les entrées tolérées devenues inutiles.
5. **`MeeshyShareExtension`** — travail **produit**, pas i18n (cf. section C).
