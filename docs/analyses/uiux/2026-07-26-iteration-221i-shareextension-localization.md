# Itération 221i — `MeeshyShareExtension` : une extension entièrement anglophone

**Date** : 2026-07-26
**Périmètre** : iOS uniquement
**Base** : `main` HEAD `16f8197` (rebase de 220i inclus)
**Branche de travail** : `claude/quirky-curie-52be0w`

## Contexte

Piste n° 4 de 220i (héritée de 219i) : « câbler un `Localizable.xcstrings` à la
cible `MeeshyShareExtension` (3 chaînes crues) ». Le frein cité — la PR #2319 —
est mergée. L'inspection révèle que le diagnostic « 3 chaînes crues » était
**très en dessous de la réalité**.

## Le défaut

Une extension d'application possède **son propre bundle**. `Bundle.main`, à
l'intérieur de `MeeshyShareExtension`, désigne l'`.appex`, pas l'app hôte : une
extension **ne peut pas** lire le catalogue de chaînes de son app hôte.

Or `ShareViewController.swift` appelait déjà `String(localized:defaultValue:)` à
**cinq** endroits — `share.sendTo`, `share.searchContacts`, `share.type.video`,
`share.type.file`, `share.type.location` — alors que la cible ne livrait
**aucun** `Localizable.xcstrings` (`ls MeeshyShareExtension/` → `Info.plist`,
`MeeshyShareExtension.entitlements`, `ShareViewController.swift`, point final).

Conséquence : chacun de ces cinq appels retombait silencieusement sur son
`defaultValue` **anglais**, dans **toutes** les locales. Le code *semblait*
localisé — il ne l'était pas. C'est le pire cas de figure : la dette est
invisible à la relecture.

**Preuve matérielle** : les cinq clés existent, **entièrement traduites dans les
7 locales**, dans le catalogue de l'**app** (`Meeshy/Localizable.xcstrings`,
marquées `stale` — plus aucun code de l'app ne les consomme, à l'exception de
`share.sendTo` réutilisé par `SharePickerView:333`). Le travail de traduction
avait donc bien été fait ; il atterrissait simplement dans le mauvais bundle.

S'y ajoutaient **trois littéraux crus**, tous sur le chemin nominal de
l'extension :

| Ligne | Avant | Rôle |
|---|---|---|
| 350 | `Button("Cancel")` | Seule affordance d'abandon |
| 359 | `Button("Send")` | **Action primaire** de l'extension |
| 373 | `.navigationTitle("Share to Meeshy")` | Titre de la feuille |

`Button(_:action:)` et `.navigationTitle(_:)` prennent un `LocalizedStringKey` :
ces trois-là étaient donc *techniquement* résolus contre le bundle — mais avec la
copie anglaise **comme clé**, hors de la convention `share.*` du fichier, non
greppable et absente de tout catalogue.

Bilan : un utilisateur francophone, allemand, espagnol, brésilien, italien ou
arabophone partageant un contenu vers Meeshy voyait une feuille **intégralement
en anglais**, y compris son bouton d'envoi.

### Défaut connexe : `CFBundleLocalizations` en retard

`MeeshyShareExtension/Info.plist` déclarait `fr, en, de, es, pt-BR` — **5**
locales, alors que l'app en déclare **7** (`Meeshy/Info.plist`) : `it` et `ar`
manquaient. Ces deux langues sont devenues des langues d'interface réelles
récemment (commit `4f0e408`, « l'italien et l'arabe deviennent des langues
d'interface réelles »), et la mise à jour n'avait pas atteint l'extension. Pour
`ar`, l'enjeu dépasse le texte : c'est aussi le signal de mise en page **RTL**.

## Les correctifs

### 1. Les 3 littéraux rejoignent la convention du fichier

```swift
Button(String(localized: "share.cancel", defaultValue: "Cancel"))
Button(String(localized: "share.send",   defaultValue: "Send"))
.navigationTitle(String(localized: "share.title", defaultValue: "Share to Meeshy"))
```

Même forme exacte que les cinq appels préexistants du fichier (pas de `bundle:`
explicite — `Bundle.main` est déjà l'`.appex`). Les valeurs passées sont des
`String` runtime → surcharge `StringProtocol`, aucune re-localisation parasite.

### 2. Un catalogue pour la cible

Nouveau `MeeshyShareExtension/Localizable.xcstrings` : **8 clés × 7 locales**
(`ar, de, en, es, fr, it, pt-BR`), toutes à l'état `translated`.

Le câblage est **implicite** : `project.yml` déclare
`sources: - path: MeeshyShareExtension` en globbing récursif, exactement comme
`MeeshyNotificationExtension`, dont le `Localizable.xcstrings` est déjà pris en
charge par ce seul mécanisme. **0 édition de `project.yml`, 0 édition de
`project.pbxproj`** — `xcodegen generate` (que la CI exécute) enregistre le
fichier comme ressource. `knownRegions` du projet contient déjà les 7 locales
(vérifié : `ar, de, en, es, fr, it, pt, pt-BR, zh-Hans`), donc rien à élargir.

**Provenance des traductions — aucune invention là où une valeur relue existait :**

| Clé | Source |
|---|---|
| `share.sendTo`, `share.searchContacts`, `share.type.video`, `share.type.file`, `share.type.location` | **Copie verbatim** du catalogue de l'app (mêmes clés, déjà traduites/relues) |
| `share.cancel` | **Copie verbatim** de `common.cancel` de l'app (même mot, même rôle UI) |
| `share.send` | Neuve — calquée sur le verbe déjà employé par `share.sendTo` (« Envoyer à » → « Envoyer », « Invia a » → « Invia ») |
| `share.title` | Neuve — calquée sur le nom de tête de `share.picker.title` (« Partager avec… » → « Partager sur Meeshy », « المشاركة مع… » → « المشاركة على Meeshy ») |

`sourceLanguage: "en"` — cohérent avec les `defaultValue` anglais du fichier et
avec le catalogue de `MeeshyNotificationExtension`.

### 3. `CFBundleLocalizations` alignée sur l'app

Ajout de `it` et `ar` → les 7 locales de `Meeshy/Info.plist`.

## Le test

Nouveau `MeeshyTests/Unit/Views/ShareExtensionLocalizationTests.swift`, dans la
veine du balayage sur disque de `NavigationContainerMigrationTests` (même astuce
`#filePath` → `apps/ios/`, aucun runtime Xcode requis) :

1. `test_shareExtension_shipsAStringCatalog` — le catalogue existe. C'est
   l'invariant structurel : c'est **son absence**, et non une clé manquante, qui
   a rendu l'extension anglophone.
2. `test_everyRequestedKey_existsInTheCatalog` — extrait par regex toutes les
   clés `String(localized: "…"` du source et vérifie qu'aucune ne manque au
   catalogue.
3. `test_everyKey_isTranslatedIntoEveryDeclaredLocale` — chaque clé porte les 7
   locales, chacune en état `translated` et de valeur non vide.
4. `test_noUserFacingLiteralRemains` — aucun `Button("…")` ni
   `.navigationTitle("…")` cru ne subsiste (garde-fou de régression).

Fichier de test **neuf** → enregistré par le globbing récursif de la cible
`MeeshyTests` dans `project.yml` (`xcodegen generate` en CI), **0 édition de
`project.pbxproj`**.

Les 4 assertions ont été **simulées hors Xcode** contre les fichiers réels :
8 clés demandées = 8 clés du catalogue (0 manquante, 0 orpheline), 0 problème de
locale, 0 littéral cru restant.

## Ce qui n'a pas bougé

0 logique métier, 0 réseau, 0 layout, 0 palette, 0 changement de comportement.
La liste des locales du catalogue est un sur-ensemble strict de ce que
l'extension affichait (l'anglais reste identique, mot pour mot : les
`defaultValue` sont conservés).

## Validation

- **Gate réel = CI `iOS Tests`**. L'environnement d'exécution est Linux : aucun
  toolchain Apple, donc aucune compilation locale — conforme au mode opératoire
  des itérations précédentes.
- Vérifications statiques effectuées : JSON du catalogue valide et conforme au
  schéma de `MeeshyNotificationExtension/Localizable.xcstrings` (`sourceLanguage`
  / `strings` / `version`) ; les 4 invariants du test tiennent ; `knownRegions`
  couvre les 7 locales ; précédent de câblage implicite prouvé par
  `MeeshyNotificationExtension`.
- Collision essaim : `MeeshyShareExtension/` et le fichier de test neuf ne sont
  touchés par aucune branche distante récente.

## Bilan

**4 fichiers** (1 source, 1 catalogue neuf, 1 `Info.plist`, 1 test neuf). Une
surface entière de l'application — la feuille « Partager sur Meeshy », point
d'entrée depuis **toute autre app iOS** — passe de l'anglais forcé à 7 langues,
dont l'arabe en RTL. 6 des 8 clés réutilisent des traductions déjà relues plutôt
que d'en inventer. Le test transforme l'invariant en garde-fou permanent.

## Piste 222i+

1. **⚠️ PRIORITÉ — Faux contacts en production.**
   `ShareViewController.loadRecentContacts()` (l. 388-397) retombe sur
   `ContactPreview.sampleContacts` — **« John Doe », « Jane Smith », « Bob
   Johnson », « Online », « Away »** — quand l'App Group ne contient pas encore
   `recent_contacts`. Ce n'est pas une preview SwiftUI : c'est le chemin nominal
   du **premier lancement**. L'utilisateur voit trois contacts fictifs, peut en
   sélectionner un et appuyer sur « Envoyer ». Volontairement **hors périmètre
   ici** : le remède est un changement de comportement (état vide + invite à
   ouvrir l'app pour peupler l'App Group), qui mérite sa propre itération et son
   propre arbitrage produit. C'est le défaut le plus grave de cette surface.
2. **`ContactRow` n'est pas un contrôle.** La sélection passe par
   `.onTapGesture` sur un `HStack` (l. 335-340) : VoiceOver ne voit ni bouton, ni
   trait `.isSelected`, et la rangée n'est pas atteignable au clavier. Le
   `checkmark.circle.fill` sauve WCAG 1.4.1 (l'état n'est pas *que* couleur) mais
   la rangée reste inutilisable en VoiceOver. Lead déjà noté en 209i, toujours
   ouvert.
3. **`CFBundleDisplayName` de l'extension** (« Share to Meeshy ») — c'est le
   libellé affiché dans la feuille de partage **du système**, et il reste
   anglophone. Le localiser demande un `InfoPlist.strings` par locale (ajout
   structurel distinct d'un `.xcstrings`).
4. **Incohérence de présentation des 3 sites de `StatusComposerView`** (lead 220i
   inchangé) : `RootViewComponents:743` pose `.presentationDragIndicator(.visible)`,
   les 2 sites de `ConversationListView` non → unifier **sur la vue**.
5. **`StatusComposerView` et le Dynamic Type** (lead 220i inchangé) — à mesurer
   avant de corriger.
6. **Catalogue de `MeeshyNotificationExtension` désaligné** : il porte `pt` et
   `zh-Hans`, absentes des `CFBundleLocalizations` de l'app (qui a `pt-BR` et pas
   de chinois) — traductions probablement mortes, et `pt-BR` possiblement non
   couverte. À auditer.
7. **Balayage Dark Mode généralisé** (piste 219i, inchangée).
