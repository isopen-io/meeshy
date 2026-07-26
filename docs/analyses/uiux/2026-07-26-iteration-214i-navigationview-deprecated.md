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

## ✅ Clôture (220i, 2026-07-26)

Le point n° 1 du « Reste à faire » est **soldé** :
`StatusComposerView.swift` — dernier `NavigationView` des cibles de
l'application — est passé à `NavigationStack` en **220i** (#2275, qui le
détenait, ayant été mergée). L'attendu de `NavigationContainerMigrationTests`
est **réduit à l'ensemble vide** : le balayage n'est plus un *pin* de dette mais
un **invariant** (toute réintroduction du conteneur déprécié échoue au test).

**Ne plus re-flagger** : `EmojiPickerSheet`, `VoiceProfileManageView`,
`MeeshyShareExtension/ShareViewController` (214i) et `StatusComposerView` (220i)
pour leur conteneur de navigation — la migration de l'application est terminée.

Le point n° 3 (catalogue de chaînes de `MeeshyShareExtension`) est **soldé en
221i** : la cible a désormais son `Localizable.xcstrings` (8 clés × 7 locales) et
son `InfoPlist.xcstrings`, les 3 littéraux crus sont localisés et
`CFBundleLocalizations` est aligné sur les 7 locales de l'app.

Restent ouverts, inchangés : le n° 2 (5 `NavigationView` dans
`packages/MeeshySDK/Sources/MeeshyUI/` — **hors périmètre** de la routine iOS
app) et le n° 4 (`navigationTitle` de `VoiceProfileManageView.addSamplesSheet`).

Détail : `docs/analyses/uiux/2026-07-26-iteration-220i-statuscomposer-navigationstack.md`
