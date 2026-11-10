# K00 — Catalogue du kit (socle)

Relevé sur `origin/dev` `c7bbb1fb24` le 2026-11-10. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`. Loi 13. Issue du lot : #17335 (ouverte).
La planche ne dessine pas le catalogue : `vues: []`, aucune de ses fonctions JS ne le rend, aucune de ses 70 vues ne l'emploie. Sa disposition est donc libre.
Sur `dev`, rien du kit n'existe encore (ni `MeeshyUI/Kit/`, ni `:feature:kit`, ni `components/kit/`, ni `docs/product/kit/`). Le côté iOS est écrit dans la PR #17336 (branche `claude/kit-k00-ios`) : cette fiche reprend son API telle quelle, pour qu'il n'y ait rien à refaire.

## 1. Rôle
Le catalogue montre chaque composant LIVRÉ du kit dans tous ses états, au repos et pressé, et prouve par instantané et par garde qu'un composant livré a son fichier, son témoin, ses images et son entrée.

Il ne fait pas :
- un écran du produit : ni réseau, ni session, ni donnée, absent des binaires publiés ;
- la définition des états d'un composant : chaque fiche Kxx les fixe, le catalogue les énumère ;
- un tableau d'avancement : pas de compteur « n sur 25 », pas de ligne « à venir » (l'état vit dans les issues) ;
- du verre : son chrome est fait de contrôles système, car il existe avant K01 ;
- de la traduction : ses libellés sont des identifiants techniques (clé, nom du type, `id`, vue).

## 2. API (mêmes noms sur les trois plateformes)
| Type | Champs et défauts |
|---|---|
| `MeeshyKitCatalogEntry` | `key: String` (« K02 »), `name: String` (« MeeshyGlassButton »), `states: [MeeshyKitCatalogState] = []` ; dérivés : `isDelivered` (au moins un état), `accessibilityName` (« K02 MeeshyGlassButton »), `tiles` |
| `MeeshyKitCatalogState` | `id: String` (kebab, stable : c'est le nom de l'image), `boardView: String? = nil` (« R3 »), `backdrop: MeeshyKitCatalogBackdrop = .dark`, `isTouchable: Bool = false` |
| `MeeshyKitCatalogBackdrop` | `dark`, `light`, `media` : les trois fonds de la planche (`.glass.deep`, `.onlight`, `.glass` sur une photo) |
| `MeeshyKitCatalogTile` | `state`, `isPressed: Bool = false` ; `id` = `id` de l'état, suffixé `-presse` |
| `MeeshyKitCatalog` | `entries` (les 25 clés du registre, dans l'ordre), `listedEntries` (les livrées), `listedEntry(matching:)` (casse ignorée), `content(key, state, isPressed)` |
| `MeeshyKitCatalogStage` | `key`, `state`, `isPressed = false` : le composant à sa taille naturelle, marge `md`, sur le fond de l'état. L'écran et les instantanés partagent cette scène. |
| `MeeshyKitCatalogEmptyState` | aucun champ : la phrase de l'état vide sur le fond du thème. L'écran et le premier instantané de K00 la partagent. |

Emplacement unique : le contenu d'une tuile, rendu par `content`.

Enregistrement sans collision (les lots tournent en parallèle) : K00 crée UN fichier d'entrée VIDE par clé K01 à K25 et écrit UNE fois le répartiteur. Ensuite chaque lot ne modifie que son propre fichier d'entrée.

| | Modèle | Entrées et répartiteur | Écran et accès |
|---|---|---|---|
| iOS | `MeeshyUI/Kit/MeeshyKitCatalogEntry.swift` | `MeeshyUI/Kit/Catalog/MeeshyKitCatalog.swift`, `MeeshyKitCatalogStage.swift`, `MeeshyKitCatalogEmptyState.swift`, `MeeshyKitCatalog+K02.swift` ; tout sous `#if DEBUG`, `@ViewBuilder` sans `AnyView` | `apps/ios/Meeshy/Features/Kit/` : `KitCatalogLaunch` (argument `-MeeshyKitCatalogue [clé]`) et `KitCatalogScreen`, montés dans le bloc `#if DEBUG` de `RootScene` |
| Android | `me.meeshy.ui.component.kit.MeeshyKitCatalogEntry` (`:sdk-ui`, données seules, aucun composable) | module `:feature:kit`, espace de noms `me.meeshy.feature.kit` : `MeeshyKitCatalog`, `MeeshyKitCatalogStage`, `KitCatalogK02.kt` | `KitCatalogScreen` et `KitCatalogActivity` ; module lié à `:app` en `debugImplementation` seulement ; lancé par `adb shell am start -n me.meeshy.app.debug/me.meeshy.feature.kit.KitCatalogActivity --es kit K02` |
| Web | `src/components/kit/meeshy-kit-catalog.tsx` (types, fonctions pures, `MeeshyKitCatalogStage`) | `src/components/kit/catalog/index.ts` et `k02.tsx` | `src/routes/kit.tsx` : `/kit` et `/kit/$composant`, inscrites dans `route-table.tsx` seulement quand `__FIXTURES__` est vrai, hors de `PRIVATE_ROUTES` (aucune session) |

K00 livre ses fichiers en UNE PR par plateforme : sa cible est un dossier, donc le premier fichier fusionné le fait passer pour livré.

## 3. États (aucun n'a de vue sur la planche)
- Liste : les composants livrés, par clé.
- Vide : aucun composant livré (l'état juste après K00), dessiné avec une phrase.
- Détail : une tuile par état, légendée par son `id` et sa `boardView`, sur le fond de l'état.
- Pressé : pour un état `isTouchable`, une seconde tuile figée `isPressed`, juste après la tuile vivante.
- Réglages du détail : clair ou sombre, LTR ou RTL, grande police.
- Clé inconnue ou non livrée à l'ouverture : la liste s'affiche.
- Chargement, erreur, hors ligne : sans objet (aucune donnée).

Loi 13 : un composant non livré n'apparaît pas, la tuile pressée n'existe pas pour un état qui ne se touche pas, la légende de vue est absente sans `boardView`, et le catalogue n'existe pas en production.

## 4. Gestes et retours
- Toucher une ligne ouvre le détail ; le retour est celui du système (retour du navigateur sur le web).
- Dans une tuile vivante, le composant répond lui-même : son retour haptique passe par son propre site (`HapticFeedback`, `MeeshyHaptics`, `lib/view/haptics.ts`). Le catalogue n'en ajoute aucun.
- Aucune animation propre : rien à couper sous « réduire les animations ».

## 5. Accessibilité
- Ligne : nom « K02 MeeshyGlassButton », rôle bouton (lien sur le web). Tuile : titre de niveau 2 portant l'`id`, puis le composant, qui garde ses propres nom, rôle et valeur.
- Ordre de lecture : clés dans l'ordre du registre, puis états dans l'ordre de la fiche, la tuile pressée après la vivante.
- Grande police (Dynamic Type `accessibility3`, `fontScale` 2,0, zoom du navigateur à 200 %) : les tuiles s'empilent, sans défilement horizontal ni texte rogné.
- Web : Tab parcourt les lignes, Entrée ouvre, chaque état a une ancre (`/kit/k02#actif`), focus visible, cibles de 44 px, propriétés logiques (`inline`, `block`) pour le RTL.
- Contraste : légendes sur le fond du thème (4,5:1 au moins). Les trois fonds servent à juger le verre des composants, clair et sombre.

## 5 bis. Performance
- Liste paresseuse ; le détail ne monte que l'entrée ouverte ; changer un réglage ne re-rend que les tuiles, jamais la liste.
- Rien ne s'anime, donc aucune image ne peut se perdre.
- Poids nul en production : `#if DEBUG` sur iOS, `debugImplementation` sur Android, chunk à la demande absent du build `VITE_DATA_SOURCE=gateway` sur le web, sans dépendance ajoutée.
- Web : `budgets.json` reste inchangé. La première peinture est à 96,08 Ko pour un plafond de 97, et chaque route coûte environ 0,03 Ko au module d'entrée du build de fixtures : à mesurer dans le lot.
- Images cadrées au composant (marge `md`), jamais au format de l'appareil : à 390 × 844, la tolérance de 1 % de pixels avalerait le composant entier.

## 6. Jetons et mesures
- Marges `MeeshySpacing.md` et `lg`, rayons `MeeshyRadius`, textes du système (`--space-*` sur le web).
- Fonds `dark` et `light` : fond primaire du thème (`MeeshyColors.backgroundPrimary(isDark:)`, schéma Android, `--color-ios-surface`).
- Fond `media` : dégradé de marque (`MeeshyColors.brandGradient`, `MeeshyGradients.brand`). Le web n'a pas de jeton de dégradé : il le compose des jetons `--ios-indigo-500` et `--ios-indigo-700`, les deux arrêts de `brandGradient`.
- Aucune valeur en dur. Aucune mesure de la planche ne s'applique : la tuile prend la taille naturelle du composant.

## 7. Jumeaux
- iOS : `SnapshotHelpers` (`Tests/MeeshyUITests/Timeline/Helpers/`) DEVIENT l'aide d'instantané du kit, étendue sur place dans `SnapshotHelpers+Kit.swift` (cadrage au composant, variantes), en gardant `osBaselineSuffix` et `record: nil`. Les `*PreviewLaunch` de `RootScene` sont le motif d'accès, à suivre. Les cliquets entrent dans `apps/ios/scripts/house_rules.py`.
- Android : aucun jumeau (0 `@Preview`, ni Roborazzi ni Paparazzi, aucun module de catalogue). À réutiliser : `test-support/compose-robolectric` et le motif de cliquet de `NoLocalHexColorGuardTest`.
- Web : aucune route de catalogue. À réutiliser sans second exemplaire : `scripts/lib/browser.mjs` (`launchChromium`), `scripts/lib/gate-server.mjs` (`startDistServer`), le balayage de `scripts/lib/glass-site.mjs`. `scripts/capture.mjs` reste hors lot.
- K00 ne supprime rien. Les jumeaux de composants partent avec I1 à I10.

## 8. Témoins exigés
Images, mêmes noms partout : `<Nom>/<id>.<variante>`. Par état : `clair`, `sombre`, et `presse` s'il se touche. Par composant : une planche `grande-police` et une planche `rtl`, sous l'`id` `planche`.

| | Où | Particularités |
|---|---|---|
| iOS | `Tests/MeeshyUITests/Kit/__Snapshots__/<Nom>/` | suffixe `-iOS26` pour le Liquid Glass ; références enregistrées par `sdk-tests.yml` (entrée `record_snapshots`), jamais sur un poste |
| Android | `apps/android/feature/kit/src/test/snapshots/` | Roborazzi sur Robolectric 4.13 ; version lue dans Maven Central, compatible Kotlin 2.1.20 et BOM Compose 2024.10.01 ; comparaison DANS `testDebugUnitTest` ; enregistrement par une entrée d'`android.yml` |
| Web | `docs/product/kit/captures/web/` | 390, 820 et 1440 px, clair et sombre, RTL à 390 ; produites par `CAPTURE_DIR=… node scripts/check-kit.mjs` |

Garde du registre (`KitRegistryGuardTests`, `KitRegistryGuardTest`, `check-kit.mjs`), pour chaque lot `kit` :
- cible présente ⇒ entrée non vide, témoin `<Nom>Tests` présent, images de chaque état présentes ;
- cible absente ⇒ entrée vide ;
- `entries` égale les clés et les noms du registre, dans l'ordre ;
- chaque `boardView` est un `id` de la table `S` de la planche.

Cliquets : ils ne font que descendre, et le plafond s'abaisse dans le commit qui fait baisser. Le plafond est la mesure de la garde au jour où elle est écrite, jamais un chiffre recopié de cette fiche.

| | Ce qui est compté hors du kit | Mesuré le 2026-11-10 |
|---|---|---|
| iOS, dans `house_rules.py` | appels à `adaptiveGlass`, `adaptiveGlassProminent`, `adaptiveLiquidGlass`, `glassEffect`, hors `MeeshyUI/Compatibility/` et `MeeshyUI/Kit/` : `kit-glass-call`, dont ronds `kit-glass-round`, dont sans `interactive: true` `kit-glass-no-touch` | 163, 51, 125 (PR #17336) |
| Android | appels à `MeeshyGlassSurface(` dans `src/main`, hors `chrome/` et `component/kit/`, dont sur `CircleShape` | 58 dans 44 fichiers, dont 17 ronds ; aucun ne répond au toucher |
| Web | les six classes de `glass.css` (`glass`, `glass-prominent`, `glass-card`, `glass-accent`, `glass-call`, `glass-call-prominent`) dans les `.tsx` hors tests et hors `components/kit/`, dont avec `rounded-full` | environ 149 dans 69 fichiers, dont 43 lignes rondes |

Comportements à tester :
- la liste n'affiche que les entrées non vides, dans l'ordre du registre ;
- l'argument de lancement (ou l'adresse) ouvre l'entrée demandée, et une clé inconnue laisse la liste ;
- la tuile pressée n'existe que si `isTouchable`, et suit la tuile vivante ;
- RTL et grande police sans débordement ;
- sur le web : parcours au clavier, cibles de 44 px, route et chunk absents du build `gateway`.

Câblage :
- `check-kit.mjs` entre dans `bun run gate` ET dans `ci.yml` (`gate-ci-parity.test.ts` exige les deux) ;
- le registre et la planche entrent dans les `paths` de `sdk-tests.yml`, `android.yml` et `ci.yml` ;
- `:feature:kit` entre dans `settings.gradle.kts` ;
- les fichiers de l'app iOS demandent `[xcodegen]`.

Entrée au catalogue : K00 n'en a pas, il EST le catalogue ; son propre état « vide » est son premier instantané (`MeeshyKitCatalogEmptyState`, sous le nom `Catalogue` : `Catalogue/vide.clair`, `Catalogue/vide.sombre`, `Catalogue/planche.grande-police`, `Catalogue/planche.rtl`).

## 9. Écarts connus
- La CI iOS ne tourne que sur le simulateur 26.1 préinstallé (#9701) : la capture « sur un simulateur antérieur » du contrat n'a aucun runtime. `apps/ios/CLAUDE.md` dit encore « run = simu iOS 18.2 ».
- Le rendu du vrai `glassEffect` dans une image hors écran, et du flou sous Robolectric, n'est pas vérifié. Si la matière n'apparaît pas au premier passage CI, l'instantané prouve la disposition et les états, et la matière se prouve par capture du simulateur.
- Le pressé du Liquid Glass appartient au système : seule la réponse dessinée se fige en image.
- « Un contrôle qui se touche » ne se lit pas dans le texte du code : le second cliquet compte tous les appels sans `interactive: true`, plaques comprises. Son plancher n'est donc pas zéro.
- Le registre annonce « ~45 fichiers » de verre rond sur iOS ; mesuré : 37 fichiers.
- Les chiffres Android ont bougé depuis la première version de la fiche (61 appels, 47 fichiers, 19 ronds sur `6b25fc85`).
- L'espace de noms Android suit la convention des treize modules (`me.meeshy.feature.<nom>`), pas `me.meeshy.app.kit` écrit dans la première version.
- « Hors production » sur le web se lit `__FIXTURES__` : les gates servent le `dist` de fixtures, les images déployées sont construites en `gateway`. Le catalogue web n'est donc visible ni en production ni sur staging.
- « Captures Playwright » : le web n'a pas de lanceur propre, il passe par `launchChromium` (`@playwright/test`, dépendance de la racine).
- Sur le web, « kit » nomme déjà les pièces de l'administration (`components/admin/kit-*.test.tsx`, #9463) et `lib/mee/kit.ts` : `components/kit/` est un dossier distinct, sans import croisé.
- L'ADR-016 Android promet Roborazzi pour chaque primitive et chaque écran ; K00 ne couvre que le kit, le reste est une issue.
- Les questions qui reviennent au porteur sont listées à part (« À trancher »).

## 10. Mise en oeuvre iOS (ce lot)
- Nom des images : un dossier par composant, `Kit/__Snapshots__/<Nom>/<id>.<variante>.png` (la bibliothèque de capture fixe `<test>.<nom>.png` : le test porte l'`id`, le nom porte la variante). Variantes : `clair`, `sombre`, `presse`, et `grande-police`, `rtl` sous l'`id` `planche`.
- Cliquets iOS dans `house_rules.py` : `kit-glass-call`, `kit-glass-round`, `kit-glass-no-touch` ; plafonds dans `house-rules-baseline.json`.
- État vide : `MeeshyKitCatalogEmptyState` (MeeshyUI, `#if DEBUG`), monté par `KitCatalogScreen`, donc photographiable par `SnapshotHelpers.assertKitImage` depuis MeeshyUITests. Son témoin d'image n'est pas encore au dépôt : `sdk-tests.yml` (`record_snapshots`) a enregistré ses quatre références (run 42750216430, artefact `sdk-snapshots-1`), mais le conteneur des sessions ne peut pas télécharger un artefact (stockage refusé par le proxy). Le témoin entre avec ses PNG, dans un même commit, depuis un poste qui peut lire l'artefact.
