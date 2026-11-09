# K00 — Catalogue du kit (socle)

Relevé sur `origin/dev` `6b25fc85` le 2026-11-09. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`. Loi 13. La planche ne dessine pas le catalogue (`vues: []`, aucune fonction JS) : sa disposition est libre.

Issue du lot : #17335.

## 1. Rôle
Le catalogue montre chaque composant livré du kit dans tous ses états, et prouve par instantané et par garde qu'un composant livré a son fichier, son témoin, ses images et son entrée.

Il ne fait pas :
- un écran du produit : ni réseau, ni session, ni donnée, et il est absent des binaires publiés ;
- la définition des états d'un composant : chaque fiche Kxx les fixe, le catalogue les énumère ;
- un tableau d'avancement : il ne liste que le livré, sans compteur « n sur 25 » (l'état vit dans les issues) ;
- un verre ou un composant du kit : son chrome est fait de contrôles système, car il existe avant K01.

## 2. API (mêmes noms sur les trois plateformes)
| Type | Champs et défauts |
|---|---|
| `MeeshyKitCatalogEntry` | `key: String` (« K02 »), `name: String` (« MeeshyGlassButton »), `states: [MeeshyKitCatalogState] = []` |
| `MeeshyKitCatalogState` | `id: String` (kebab, stable, c'est le nom de l'image), `boardView: String? = nil` (« R3 »), `backdrop: MeeshyKitCatalogBackdrop = .dark`, `isTouchable: Bool = false` |
| `MeeshyKitCatalogBackdrop` | `dark`, `light`, `media` (les trois fonds de la planche : `.glass.deep`, `.onlight`, `.glass` sur photo) |
| `MeeshyKitCatalog` | `entries` (les 25 clés du registre, dans l'ordre) et `content(key, state, isPressed)` |

Emplacement unique : le contenu d'une tuile d'état, rendu par `content`. Les libellés affichés sont des identifiants techniques (clé, nom du type, `id`, vue) : aucun texte à traduire.

Enregistrement sans collision (les lots tournent en parallèle) : K00 crée UN fichier d'entrée VIDE par clé K01 à K25 et écrit UNE fois le répartiteur. Ensuite chaque lot ne modifie que son propre fichier d'entrée.

| | Modèle (cible du lot) | Entrées et répartiteur | Écran et accès |
|---|---|---|---|
| iOS | `MeeshyUI/Kit/MeeshyKitCatalogEntry.swift` | `MeeshyUI/Kit/Catalog/MeeshyKitCatalog.swift` et `MeeshyKitCatalog+K02.swift`, sous `#if DEBUG`, `@ViewBuilder` sans `AnyView` | `apps/ios/Meeshy/Features/Kit/` : `KitCatalogLaunch` (`-MeeshyKitCatalogue [clé]`) et `KitCatalogScreen`, montés dans le bloc `#if DEBUG` de `RootScene` |
| Android | `me.meeshy.ui.component.kit.MeeshyKitCatalogEntry` (`:sdk-ui`) | `:feature:kit` (`me.meeshy.app.kit`) : `KitCatalog`, `KitCatalogK02.kt` | `KitCatalogScreen` et `KitCatalogActivity`, module lié à `:app` en `debugImplementation` seulement, lancé par `adb shell am start` avec l'extra `kit` |
| Web | `src/components/kit/meeshy-kit-catalog.tsx` | `src/components/kit/catalog/index.ts` et `k02.tsx` | `src/routes/kit.tsx` : `/kit` et `/kit/$composant`, inscrites dans `route-table.tsx` sous `__FIXTURES__` seulement, sans session |

K00 livre ses fichiers en UNE PR par plateforme : sa cible est un dossier, donc le premier fichier fusionné le fait passer pour livré.

## 3. États
- Liste : les composants livrés, par clé. Vue de la planche : aucune.
- Vide : aucun composant livré (l'état juste après K00), dessiné.
- Détail : une tuile par état, avec `id` et `boardView` en légende, sur le fond de l'état.
- Pressé : pour un état `isTouchable`, une seconde tuile figée `isPressed`, à côté de la tuile vivante.
- Réglages du détail : thème clair ou sombre, sens LTR ou RTL, grande police.
- Chargement, erreur, hors ligne : sans objet.

Loi 13 : un composant non livré n'apparaît pas (ni ligne grisée, ni « à venir »), la tuile pressée n'existe pas pour un état qui ne se touche pas, et le catalogue n'existe pas en production.

## 4. Gestes et retours
- Toucher une ligne ouvre le détail ; le retour est celui du système.
- Dans une tuile, le composant est vivant : son retour haptique passe par son propre site (`HapticFeedback`, `MeeshyHaptics`, `lib/view/haptics.ts`). Le catalogue n'en ajoute aucun.
- Aucune animation propre : rien à couper sous « réduire les animations ».

## 5. Accessibilité
- Ligne : nom « K02 MeeshyGlassButton », rôle bouton (lien sur le web). Tuile : titre de niveau inférieur portant l'`id`, puis le composant.
- Ordre de lecture : clé, puis états dans l'ordre de la fiche.
- Grande police (Dynamic Type `accessibility3`, `fontScale` 2,0, racine à 200 % sur le web) : les tuiles s'empilent, sans défilement horizontal ni texte rogné.
- Web : Tab parcourt les lignes, Entrée ouvre, chaque état a une ancre (`/kit/k02#actif`), focus visible, propriétés logiques pour le RTL.
- Contraste : légendes sur les fonds du thème (4,5:1) ; les trois fonds servent à juger le verre des composants, clair et sombre.

## 5 bis. Performance
- Liste paresseuse ; le détail ne monte que l'entrée ouverte ; changer un réglage ne re-rend que les tuiles.
- Rien ne s'anime.
- Poids nul en production : `#if DEBUG` sur iOS, `debugImplementation` sur Android, et sur le web un chunk à la demande, absent du build `VITE_DATA_SOURCE=gateway` (témoin), sans dépendance ajoutée, `budgets.json` inchangé.
- Images cadrées au composant (marge `md`), jamais au format appareil : à 390×844, la tolérance de 1 % avale le composant entier.

## 6. Jetons et mesures
- Marges `MeeshySpacing.md` et `lg`, rayons `MeeshyRadius`, textes du système.
- Fonds `dark` et `light` : fond primaire du thème (`MeeshyColors.backgroundPrimary`, schéma Android, `--color-ios-surface`). Fond `media` : dégradé de marque (`brandGradient`, `MeeshyGradients.brand`).
- Aucune valeur en dur. Aucune mesure de la planche ne s'applique au catalogue ; la tuile prend la taille naturelle du composant.

## 7. Jumeaux
- iOS : `SnapshotHelpers` (`Tests/MeeshyUITests/Timeline/Helpers/`) DEVIENT l'aide d'instantané du kit, étendue sur place (cadrage au composant, variantes), en gardant `osBaselineSuffix` et `record: nil`. Les `*PreviewLaunch` de `RootScene` sont le motif d'accès, à suivre. Les cliquets entrent dans `apps/ios/scripts/house_rules.py`. Restent hors lot : les `snapshot()` privés de `NotificationReliefCaptureTests` et `NotificationDetailCaptureTests`.
- Android : aucun jumeau (0 `@Preview`, pas de Roborazzi, pas de module). À réutiliser : `test-support/compose-robolectric` et le motif de `NoLocalHexColorGuardTest`.
- Web : aucune route de catalogue. À réutiliser, sans second exemplaire : `scripts/lib/browser.mjs` (`launchChromium`), `scripts/lib/gate-server.mjs`, le balayage de `scripts/lib/glass-site.mjs`. `scripts/capture.mjs` reste hors lot.
- K00 ne supprime rien. Les jumeaux de composants partent avec I1 à I10.

## 8. Témoins exigés
Images, mêmes noms partout (`<Nom>/<id>.<variante>`, le point imposé par la bibliothèque iOS qui fixe `<test>.<nom>.png` — Android et le web suivent ce nom, voir § 9) : `clair` et `sombre` par état, `presse` par état qui se touche, puis par composant une planche `grande-police` et une planche `rtl`.

| | Où | Particularités |
|---|---|---|
| iOS | `Tests/MeeshyUITests/Kit/__Snapshots__/` | suffixe `-iOS26` pour le Liquid Glass ; références enregistrées par `sdk-tests.yml` (`record_snapshots`) |
| Android | `apps/android/feature/kit/src/test/snapshots/` | Roborazzi sur Robolectric 4.13 ; version lue dans Maven Central, compatible Kotlin 2.1.20 et BOM 2024.10.01 ; comparaison DANS `testDebugUnitTest` ; enregistrement par une entrée d'`android.yml` |
| Web | `docs/product/kit/captures/web/` | 390, 820 et 1440 px, clair et sombre, RTL à 390 ; produites par `CAPTURE_DIR=… node scripts/check-kit.mjs`, sans comparaison de pixels |

Garde du registre (`KitRegistryGuardTests`, `KitRegistryGuardTest`, `check-kit.mjs`) : pour chaque lot `kit` du registre,
- cible présente ⇒ entrée non vide, témoin `<Nom>Tests` présent, images de chaque état présentes ;
- cible absente ⇒ entrée vide ;
- `entries` égale les clés et les noms du registre ;
- chaque `boardView` est un `id` de la table `S` de la planche.

Cliquets, qui ne font que descendre, plafond abaissé dans le commit qui fait baisser :
| | Verre appelé hors du kit | dont rond | dont sans réponse au toucher |
|---|---|---|---|
| iOS (`adaptiveGlass`, `adaptiveGlassProminent`, `adaptiveLiquidGlass`, `glassEffect`, hors `Compatibility/` et `Kit/`) | voir `house-rules-baseline.json` | idem | idem |
| Android (`MeeshyGlassSurface(` hors `chrome/` et `kit/`) | 61 dans 47 fichiers | 19 sur `CircleShape` | 61 |
| Web (classes `glass*` dans les `.tsx` hors `kit/`) | 142 dans 71 fichiers | 37 avec `rounded-full` | sans objet avant K01 |

Comportements à tester :
- la liste n'affiche que les entrées non vides ;
- l'argument de lancement ouvre l'entrée demandée ;
- la tuile pressée n'existe que si `isTouchable` ;
- RTL et grande police sans débordement ;
- sur le web, parcours au clavier, cibles de 44 px, route et chunk absents du build passerelle.

Câblage :
- `check-kit.mjs` entre dans `bun run gate` ET dans `ci.yml` (`gate-ci-parity.test.ts`) ;
- le registre entre dans les `paths` de `sdk-tests.yml`, `android.yml` et `ci.yml` ;
- `:feature:kit` entre dans `settings.gradle.kts` ;
- les fichiers de l'app iOS demandent `[xcodegen]`.

## 9. Écarts connus
- La CI iOS ne tourne que sur le simulateur 26.1 préinstallé : la capture « antérieure à iOS 26 » du contrat n'a aucun runtime aujourd'hui. `apps/ios/CLAUDE.md:83` dit encore « simu iOS 18.2 ».
- Le rendu du vrai `glassEffect` dans une image hors écran, et du flou sous Robolectric, n'est pas vérifié. Au premier passage CI, si la matière n'apparaît pas, l'instantané prouve la disposition et les états, et la matière se prouve par capture du simulateur.
- Le pressé du Liquid Glass appartient au système : seule la réponse dessinée se fige en image.
- « sur un contrôle qui se touche » ne se lit pas dans le texte : le second cliquet borne tous les appels sans `interactive: true`, plaques comprises.
- Le registre annonce « ~45 fichiers » de verre rond sur iOS ; mesuré : 37.
- « Captures Playwright » : le web n'a pas de lanceur propre, il passe par `launchChromium`.
- « Hors production » sur le web se lit `__FIXTURES__` : les gates servent le `dist` de fixtures, les images déployées sont en `gateway`. `import.meta.env.DEV` n'existerait dans aucun `dist`.
- L'ADR-016 Android promet Roborazzi pour chaque primitive et chaque écran ; K00 ne couvre que le kit, le reste est une issue.

## 10. Mise en oeuvre iOS (ce lot)
- Nom des images : un dossier par composant, `Kit/__Snapshots__/<Nom>/<id>.<variante>.png` (la bibliothèque de capture fixe `<test>.<nom>.png` : le test porte l'`id`, le nom porte la variante). Variantes : `clair`, `sombre`, `presse`, et `grande-police`, `rtl` sous l'`id` `planche`.
- Cliquets iOS dans `house_rules.py` : `kit-glass-call`, `kit-glass-round`, `kit-glass-no-touch` ; plafonds dans `house-rules-baseline.json`.
