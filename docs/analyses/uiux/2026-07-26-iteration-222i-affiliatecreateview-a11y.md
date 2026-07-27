# iOS UI/UX — Iteration 222i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/AffiliateCreateView.swift`
**Axe** : Accessibilité VoiceOver — convergence d'un écran sur son jumeau déjà soldé
**Base** : `main` HEAD `242a82c5`

## Contexte : deux écrans jumeaux, un seul accessible

Meeshy a **deux** formulaires « créer un lien », de structure identique — deux
champs de texte, un CTA principal, une erreur en ligne :

| | `CreateTrackingLinkView` | `AffiliateCreateView` |
|---|---|---|
| Libellé des champs | `formField(…)` : caption masquée + `.accessibilityLabel` sur le `TextField` (l.145-155) | **aucun** |
| Glyphe décoratif | `.accessibilityHidden(true)` (l.80) | **aucun** |
| Libellé du CTA | `.accessibilityLabel` (l.135) | **aucun** |
| Erreur de création | `UIAccessibility.post(.announcement:)` (l.184) | **aucun** |

L'écran de tracking a été rendu accessible ; **son jumeau ne l'a jamais été**.
Les quatre défauts ont donc survécu au même endroit, sur le seul écran resté en
arrière. 222i ne conçoit rien de neuf : il applique au second exactement ce que
le premier fait déjà.

## Les défauts

### A. Les deux champs ne sont pas nommés (le plus grave)

Un `Text` posé **au-dessus** d'un `TextField` est un élément d'accessibilité
**distinct** — il ne devient pas le libellé du champ. SwiftUI retombe alors sur
le *placeholder* :

| Champ | Ce que VoiceOver annonçait | Ce qu'il fallait |
|---|---|---|
| Nom du lien | « Ex: Invitation Twitter » | « Nom du lien » |
| Utilisations max | « Illimite » | « Utilisations max (optionnel) » |

Un utilisateur VoiceOver entendait donc un **exemple** et une **valeur par
défaut**, jamais la fonction du champ. WCAG 1.3.1 (relations programmatiques) et
3.3.2 (étiquettes).

### B. Le glyphe du CTA est lu avant son libellé

`Image(systemName: "link.badge.plus")` est dans le label du bouton, à côté du
`Text`. Le nom du symbole SF est vocalisé en tête. Doctrine du dépôt, écrite
dans `StatusComposerView` : *« Decorative repost glyph — the adjacent text
already conveys the repost, so hide the symbol from VoiceOver instead of reading
its SF Symbol name. »*

### C. L'échec de création est silencieux

En cas d'erreur, `errorMessage` est rendu **dans le formulaire**, loin du bouton
qui a le focus. VoiceOver ne s'y déplace pas tout seul : l'utilisateur reçoit le
`HapticFeedback.error()` et **rien n'est dit**. Il sait que quelque chose a raté,
pas quoi.

## Correctifs (222i)

1. **Champs nommés** : `.accessibilityLabel(…)` sur chaque `TextField`,
   `.accessibilityHidden(true)` sur la caption correspondante (sans quoi elle
   deviendrait un second arrêt répétant les mêmes mots).
2. **Glyphe** : `.accessibilityHidden(true)`.
3. **CTA** : `.accessibilityLabel(…)` explicite — le bouton ne peut pas rester
   sans nom une fois son glyphe masqué.
4. **Erreur** : `UIAccessibility.post(notification: .announcement, argument:)` sur
   le chemin d'échec, à côté du haptic.

**0 clé i18n neuve.** Les libellés réutilisent **les clés des captions visibles**
(`affiliate.create.name.label`, `affiliate.create.maxUses.label`,
`affiliate.create.button`) : la voix et l'écran disent strictement la même
chose, et resteront synchronisés à la moindre retraduction.

**0 changement visuel** — que des modificateurs d'accessibilité.

**Aucun `import` ajouté** : les trois autres appelants de `UIAccessibility.post`
du dossier (`CreateTrackingLinkView`, `ShareLinkDetailView`,
`TrackingLinkDetailView`) importent exactement `SwiftUI` / `Combine` /
`MeeshySDK` — identique à ce fichier.

## Test

`apps/ios/MeeshyTests/Unit/Views/AffiliateCreateViewAccessibilityTests.swift`
(neuf) — 5 tests / 9 assertions, idiome d'introspection de source du dépôt, sur
la source **commentaires retirés** (les doc-comments nomment volontairement les
API testées : un `contains` brut passerait sur la prose seule).

1. **Garde de couverture** : exactement 2 `TextField(` — si l'écran gagne un
   champ, le test le signale au lieu de le laisser hors couverture. Et 3
   `.accessibilityLabel(` (2 champs + CTA).
2. **0 clé neuve, prouvé** : chaque clé de caption apparaît **exactement deux
   fois** — une fois pour l'affichage, une fois pour le libellé vocal. Une clé
   inventée casserait ce compte.
3. Captions + glyphe masqués (≥ 3 `.accessibilityHidden(true)`).
4. **Assertion ancrée** sur le glyphe : le masquage est cherché dans les 220
   caractères qui suivent `Image(systemName: "link.badge.plus")`, pas dans tout
   le fichier — sinon les captions masquées auraient suffi à verdir le test.
5. **Assertion ancrée** sur l'annonce : `UIAccessibility.post` doit se trouver
   dans les 200 caractères suivant `HapticFeedback.error()`, donc bien sur le
   chemin d'échec et pas ailleurs.

**RED prouvé : 8/8 assertions rouges** contre `main` `242a82c5` (recalculées sur
la source de `main` extraite par `git show`). GREEN 9/9 après correctif.

## Vérification

- Pas de toolchain Swift (Linux) → les 9 assertions ont été **recalculées
  indépendamment** hors Xcode, sur la source réelle avant et après. Équilibre
  accolades / parenthèses / crochets des 2 fichiers au tokenizer : **0 / 0 / 0**.
- Collision essaim : 12 PR ouvertes ; `AffiliateCreateView.swift` n'apparaît dans
  **aucune**. Fichier froid (dernier commit le touchant : un passage de masse du
  2026-07-25).
- Fichier de test neuf → enregistré par `xcodegen generate` (globbing récursif),
  **0 édition de `project.pbxproj`**.

Gate réel = CI `iOS Tests`.

## Bilan

**1 fichier de production, +19 / −4 lignes** (dont 12 de commentaire).
Deux champs de formulaire enfin nommés, un glyphe décoratif retiré du flux
vocal, un CTA nommé explicitement, un échec rendu audible. 0 clé i18n, 0
couleur, 0 métrique de layout, 0 logique, 0 réseau, 0 changement visuel.

## Piste 223i+

1. **Le duo `formField` reste dupliqué.** `CreateTrackingLinkView.formField`
   encapsule exactement le motif que 222i vient de réécrire à la main.
   L'extraire en composant partagé supprimerait la classe entière de défaut —
   mais c'est un refactor de deux écrans, à faire quand aucun des deux n'est en
   vol. **Ne pas le tenter tant que l'essaim est dense.**
2. **`AffiliateCreateView` : l'état occupé reste muet.** Pendant `isCreating`, le
   CTA passe `.disabled` : VoiceOver dit « estompé » sans dire pourquoi. Un
   `.accessibilityValue` ou un `.accessibilityHint` conditionnel le dirait —
   changement de comportement vocal, donc itération dédiée.
3. **Le message d'erreur reste signalé par la seule couleur** (`MeeshyColors.error`,
   sans icône) — WCAG 1.4.1. Ajouter un glyphe **change le visuel** → itération
   dédiée, à arbitrer avec le design.
