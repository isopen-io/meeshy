# iOS UI/UX — Iteration 214i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift`
- `apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift`
- `apps/ios/MeeshyShareExtension/ShareViewController.swift`

**Axe** : Intégration plateforme native / HIG — conteneur de navigation déprécié
**Base** : `main` HEAD `b41c95b`

## Contexte

Le suivi 213i orientait la suite vers « la migration `NavigationView` →
`NavigationStack` de `StatusComposerView` ». Un balayage complet des cibles iOS
(`Meeshy`, `MeeshyShareExtension`, `MeeshyNotificationExtension`) montre que le
défaut n'est pas isolé : **4 fichiers** déclarent encore le conteneur déprécié,
contre 34 fichiers déjà passés à `NavigationStack`. La migration n'avait jamais
été terminée — c'est une poche de dette résiduelle, pas un cas particulier.

## Défaut

`NavigationView` est **déprécié depuis iOS 16**. Surtout, son style par défaut
est `DoubleColumnNavigationViewStyle` : à largeur *regular* (iPad, et la feuille
de partage système sur iPad), un `NavigationView` à enfant unique se rend comme
une **vue divisée dont la colonne de détail est vide**. Le contenu réel de la
feuille est repoussé dans la colonne maître, et les `ToolbarItem(placement:
.navigationBarTrailing)` atterrissent dans la barre de la mauvaise colonne.

Aucun des trois sites ne pose `.navigationViewStyle(.stack)` — la parade
historique. Conséquences concrètes :

| Surface | Contenu | Impact iPad |
|---|---|---|
| `EmojiPickerSheet` | grille d'emojis + bouton « Fermer » en `navigationBarTrailing` | grille en colonne maître, détail vide |
| `VoiceProfileManageView.addSamplesSheet` | enregistrement d'échantillons vocaux ; le bouton « Fermer » est **l'unique** affordance de sortie (pas de `navigationTitle`, pas de bouton dans le corps) | le seul chemin de sortie peut être mal placé |
| `MeeshyShareExtension` sélecteur de contact | aperçu du contenu partagé + liste de contacts + CTA Envoyer/Annuler | la feuille de partage iPad est présentée en *form sheet* (largeur regular) → cas le plus exposé |

Le plancher de déploiement est **iOS 16.0** (`apps/ios/project.yml:10`, et 16.0
sur chaque cible concernée) : `NavigationStack` est disponible
**inconditionnellement**, sans garde `@available` ni couche de compatibilité.

## Correctifs (214i)

Substitution du conteneur sur les **trois** sites libres de collision :
`NavigationView {` → `NavigationStack {`. Un mot-clé par fichier, accolades et
corps inchangés.

Migration mécanique et sûre : vérifié sur les trois fichiers qu'il n'y a
**aucun** `NavigationLink`, `navigationDestination`, `navigationViewStyle` ni
`navigationBarItems` — ce sont des conteneurs mono-colonne purs. Sur iPhone
(largeur compacte) le rendu est identique ; le gain porte sur iPad et sur la
sortie de dépréciation.

**`StatusComposerView.swift` est délibérément laissé de côté** : le fichier est
détenu par la PR ouverte #2275 (213i). Le migrer ici créerait une collision
d'essaim sur un fichier en vol. C'est la cible de l'itération suivante.

## Test

`apps/ios/MeeshyTests/Unit/Views/NavigationContainerMigrationTests.swift` (neuf),
idiome d'introspection de source établi (`ConversationInfoSheetAccessibilityTests`,
`CallViewAccessibilityTests`).

Quatre tests : trois assertions par fichier migré (absence de `NavigationView {`
**et** présence de `NavigationStack {`), plus un **balayage** qui énumère toutes
les sources SwiftUI des cibles app et fige l'ensemble des fichiers encore
fautifs à exactement `{StatusComposerView.swift}`.

Ce balayage a deux vertus : il empêche l'introduction d'un nouveau
`NavigationView`, et il **échouera** dès que le dernier fichier sera migré —
forçant la mise à jour, donc la clôture explicite de la dette plutôt que son
oubli.

## Portée

- **3 fichiers de prod**, 3 lignes (1 mot-clé chacun). **1 fichier de test neuf**.
- 0 logique / 0 réseau / 0 clé i18n / 0 couleur / 0 layout / 0 changement visuel
  sur iPhone.

## Vérification

Toolchain Swift indisponible dans l'environnement d'exécution (Linux) → les
assertions du test sont vérifiées **déterministiquement** par correspondance de
chaînes hors Xcode, puis la CI `iOS Tests` sert de portail (compile Xcode
26.1.1 / Swift 6.2, exécution simulateur iOS 18.2).

- Balayage des 3 cibles → un seul fichier fautif restant : `StatusComposerView.swift` ✔
- Aucune variante d'espacement (`NavigationView{`) dans l'arbre ✔
- Les 3 fichiers migrés : `NavigationView {` = 0, `NavigationStack {` = 1 ✔
- Absence de `NavigationLink` / `navigationDestination` / `navigationViewStyle`
  dans les 3 fichiers (migration sans effet de bord) ✔
- Plancher iOS 16.0 confirmé sur les cibles `Meeshy`, `MeeshyShareExtension`,
  `MeeshyTests` ✔

## Reste à faire (215i+)

1. **`StatusComposerView.swift`** — dernier `NavigationView`, à migrer dès que
   #2275 est mergée ou close ; réduire l'attendu du balayage à l'ensemble vide.
2. **SDK** — `packages/MeeshySDK/Sources/MeeshyUI/` porte 5 `NavigationView`
   (`UnifiedPostComposer`, `VoiceProfileWizardView`, `VoiceProfileManageView`,
   `CodeViewerView`, `DocumentViewerView`). **Hors périmètre de cette routine**
   (iOS app uniquement) — à traiter par la piste SDK.
3. **`MeeshyShareExtension` i18n** — la cible n'a **aucun** `Localizable.xcstrings`
   propre ; ses `String(localized:)` retombent toujours sur `defaultValue`, et
   trois chaînes sont crues (`"Cancel"`, `"Send"`, `"Share to Meeshy"`). Câbler
   un catalogue de chaînes à la cible est un chantier à part entière.
4. **`VoiceProfileManageView.addSamplesSheet`** — rend son titre comme un `Text`
   dans le corps alors qu'il vit désormais dans un `NavigationStack` sans
   `navigationTitle` : candidat à `.navigationTitle(...)` +
   `.navigationBarTitleDisplayMode(.inline)` (change le visuel → itération
   dédiée, pas un glissement de celle-ci).

---

## ✅ CLÔTURE — analyse entièrement soldée par 220i (2026-07-26)

**Statut : RÉSOLUE. Ne pas rouvrir d'itération « migration `NavigationView` »
côté app iOS — il n'y a plus rien à migrer.**

### Correctifs achevés

| Fichier | Itération |
|---|---|
| `EmojiPickerSheet.swift` | 214i |
| `VoiceProfileManageView.swift` | 214i |
| `MeeshyShareExtension/ShareViewController.swift` | 214i |
| `StatusComposerView.swift` | **220i** |

Le point 1 du « Reste à faire » ci-dessus est consommé : #2275 ayant été mergée
(`131f7939e`), 220i a migré le dernier `NavigationView` et **réduit l'attendu du
balayage à l'ensemble vide**, exactement comme prescrit.

### Rationale

Le balayage épinglant la dette avait été conçu pour **échouer** dès la migration
du dernier fichier, forçant une clôture explicite plutôt qu'un oubli. Ce
mécanisme a fonctionné comme prévu : 220i a été déclenchée par ce pointeur, pas
par une redécouverte du défaut.

### Vérification

- **0 `NavigationView`** dans les 4 cibles iOS livrées (`Meeshy`,
  `MeeshyShareExtension`, `MeeshyNotificationExtension`, `MeeshyWidgets`) —
  contre 4 fichiers fautifs à l'ouverture de 214i.
- `NavigationContainerMigrationTests` : 4 fichiers verrouillés individuellement
  + balayage attendu à `Set<String>()`, désormais **garde-fou de régression pur**.
- Le balayage couvre une cible **de plus** qu'à sa création (`MeeshyWidgets`
  ajoutée en 220i — c'était le seul arbre app-side non gardé).

### Reste à faire — reventilé (n'appartient plus à cette analyse)

- **Point 2 (SDK, 5 `NavigationView` dans `MeeshyUI`)** : confirmé **hors
  périmètre** de cette routine (app iOS uniquement). Appartient à la piste SDK.
- **Point 3 (`MeeshyShareExtension` i18n)** : #2319 mergée → débloqué, repris
  comme piste 221i+ n° 2.
- **Point 4 (`VoiceProfileManageView.addSamplesSheet` → `navigationTitle`)** :
  toujours ouvert, change le visuel ⇒ itération dédiée. Reste valable.
