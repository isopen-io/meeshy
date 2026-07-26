# iOS UI/UX — Iteration 221i

**Date** : 2026-07-26
**Axe** : Design system (extraction d'un modificateur réutilisable) ·
Accessibilité VoiceOver (CTA en vol) · i18n
**Base** : `main` HEAD `16f8197`. La branche `claude/quirky-curie-qzp0o7` porte
220i, **non mergée** (aucun outil GitHub disponible dans cette session) ; elle a
été rebasée sur ce HEAD et 221i s'empile dessus.

## Origine

Piste 5 du pointeur 220i : appliquer la doctrine « nom stable / états
transitoires dans la valeur » aux autres boutons qui échangent leur `Text`
contre un `ProgressView`. Il fallait d'abord établir la population réelle.

## Le balayage — et sa correction en cours de route

Un premier tri automatique a compté **11** boutons de la forme
`if <flag> { ProgressView() … }`, dont **8** sans modificateur d'accessibilité.
**Ce chiffre était faux, deux fois.**

1. La fenêtre de contexte du script tronquait les modificateurs situés plus bas :
   `DeleteAccountView` a été classé « sans a11y » alors qu'il porte label **et**
   hint.
2. Plus grave, le tri ne distinguait pas trois formes visuellement proches mais
   **radicalement différentes** pour VoiceOver :

| Forme | Effet | Verdict |
|---|---|---|
| `if flag { ProgressView() } else { Text }` | le `Text` **disparaît** → **le bouton perd son nom accessible** | **défaut** |
| `HStack { if flag { ProgressView() }; Text }` | le `Text` **reste** → le nom survit | pas ce défaut |
| `Text(flag ? "…en cours" : "…")` | le texte **dit** l'état | pas ce défaut |

Un détecteur correct a donc été écrit : il **scope les deux branches** par
comptage d'accolades (au lieu d'une fenêtre de lignes), exige un `ProgressView`
**seul** côté `if` et un `Text` côté `else`, et vérifie que le tout est bien
dans un *label* de `Button` — un état de chargement au niveau de la vue ne perd
aucun nom.

Ce détecteur, lancé sur `origin/main`, donne la mesure honnête :

> **13 boutons** portent la forme qui fait disparaître le nom.
> **8 d'entre eux n'avaient aucun nom accessible.**

Le premier chiffre de 8 « sans a11y » était donc une coïncidence numérique : ce
n'étaient pas les mêmes 8 sites.

### Les 8 sites convergés

| Site | Libellé passé | Drapeau |
|---|---|---|
| `MagicLinkView.swift` | `auth.magiclink.send` | `isLoading` |
| `EditPostSheet.swift` | `feed.post.edit.publish` | `isSaving` |
| `ReportMessageSheet.swift` | `report.message.send` | `isSubmitting` |
| `FeedView+Attachments.swift` | `feed.post.composer.publish` | `isUploading` |
| `OnboardingAnimations.swift` | `title` (paramètre du composant) | `isLoading` |
| `ConversationEncryptionDetailSheet.swift` | `conversation.encryption.detail.activate` | `isEnabling` |
| `MessageReportDetailView.swift` | `message-detail.report.send` | `isSubmittingReport` |
| `NewConversationView.swift` | `Creer` | `viewModel.isCreating` |

Ce sont, pour la plupart, des **CTA de confirmation** — plusieurs en
`ToolbarItem(placement: .confirmationAction)`. Perdre leur nom pendant l'action,
c'est perdre le seul repère du seul contrôle qui compte, au moment de l'attente.

`OnboardingAnimations` est le cas le plus rentable : c'est un **composant
réutilisable** dont le libellé vient de l'appelant (`let title: String`) — un
seul correctif nomme tous ses usages.

### Sites écartés — **ne plus re-flagger**

| Site | Pourquoi |
|---|---|
| `DeleteAccountView`, `ChangePasswordView`, `AffiliateCreateView` | `Text` conservé à côté du spinner → le nom survit |
| `CreateShareLinkView` | le `Text` bascule sur « Création en cours… » : l'état est déjà dit |
| `EmailVerificationView:156` | **déjà conforme** — `.accessibilityLabel(verifyButtonAccessibilityLabel)`, avec un commentaire énonçant exactement cette doctrine. Corroboration indépendante, antérieure à 220i |
| `ReportUserView`, `ThreadView`, `CreateTrackingLinkView`, `MessageDetailSheet`, `RecentMediaStrip`, `MessageTranscriptionDetailView`, `FeedView` | déjà nommés |

## Le correctif : un modificateur, pas neuf copies

220i avait posé la règle en trois modificateurs inline sur un site. La répéter
sur huit sites de plus en aurait fait neuf copies. `Features/Main/Views/Modifiers/`
existe pour ça.

`InFlightActionAccessibility.swift` (neuf) :

```swift
func inFlightActionAccessibility(
    _ label: String,
    isInFlight: Bool,
    inFlightValue: String? = nil,
    unavailableReason: String? = nil
) -> some View
```

- **`.accessibilityLabel(label)` inconditionnel** → il survit au remplacement du
  `Text` par le `ProgressView`. Chaque site passe **le libellé de son propre
  texte visible** : le nom accessible contient ce qui est affiché
  (**WCAG 2.5.3 *Label in Name***, également ce que Contrôle Vocal apparie), et
  **0 clé de libellé neuve** — les huit réutilisent des clés existantes.
- **`.accessibilityValue`** : `inFlightValue` en vol (défaut = la clé partagée
  `a11y.action.in-progress`), sinon `unavailableReason` s'il est fourni, sinon
  `""`.

**1 seule clé i18n neuve** — `a11y.action.in-progress` — ajoutée au catalogue
**traduite dans les 7 locales**, insertion additive (1370 → 1371, comparaison
clé à clé : aucune clé préexistante déplacée).

### `StatusComposerView` (220i) adopte le modificateur

Ses trois modificateurs inline deviennent un appel unique passant
`inFlightValue:` (« Publication en cours ») et `unavailableReason:`. **Aucune
perte de spécificité** — c'est précisément à quoi servent les deux paramètres
optionnels. Le `.accessibilityHint` reste séparé : c'est le seul site à en
porter un.

Résultat : **une** doctrine, **un** point d'implémentation, **9** sites.

## Hors périmètre

- Les sites écartés ci-dessus.
- L'indisponibilité signalée par la couleur seule sur des boutons dont le nom
  **ne disparaît pas** (`ChangePasswordView`, `AffiliateCreateView`) : défaut
  réel mais d'une **autre famille** (WCAG 1.4.1, pas 4.1.2), avec ses propres
  formulations à écrire. Itération dédiée.
- Placement SDK : le modificateur lit une clé du catalogue de l'app et sert des
  écrans produit → **app-side**, conformément au test du grain de
  `apps/ios/CLAUDE.md`.

## Tests

`InFlightActionAccessibilityTests.swift` (neuf), **5 tests** :

1. **Le modificateur énonce la règle une fois** : label inconditionnel, valeur
   ternaire sur `isInFlight`, repli `inFlightValue ??` sur la clé partagée,
   repli `unavailableReason ??`.
2. **Chaque site convergé** porte l'appel, avec **son propre libellé** et **son
   propre drapeau** — assertions ancrées sur la fenêtre qui suit l'appel, pas un
   `contains` global.
3. **`StatusComposerView`** passe par le modificateur **sans perdre** ses quatre
   clés propres.
4. **Sweep de non-régression** — le détecteur branch-scopé décrit plus haut,
   réimplémenté en Swift, doit rendre l'**ensemble vide**. C'est l'assertion qui
   empêche l'apparition d'un dixième site.
5. `a11y.action.in-progress` : 7 locales, toutes `translated`, non vides.

`StatusComposerPublishAccessibilityTests` (220i) mis à jour : les assertions qui
visaient les trois modificateurs inline visent l'appel au modificateur partagé —
**même exigence, nouvelle forme**. Les assertions de non-régression (branche
`ProgressView`, règle `.disabled`, hint) sont inchangées.

## Vérification

Pas de toolchain Swift sous Linux → chaque assertion rejouée déterministement
hors Xcode.

- **GREEN (arbre de travail)** : **40/40** assertions, dont les 6 assertions
  220i re-pointées.
- **RED (`origin/main`)** : le sweep remonte **8 boutons sans nom** ; sur
  l'arbre de travail il remonte l'**ensemble vide**. Le modificateur et la clé
  n'existent pas sur `main`, donc les 34 autres assertions y échouent aussi.
- **Limite connue, assumée** : le détecteur est **conservateur**. Il ne voit pas
  `MagicLinkView` (son `if` est imbriqué dans un `ZStack` du label, hors de la
  fenêtre de recherche du `Button`) — ce site est convergé quand même, et
  couvert par l'assertion n° 2. Le sweep sous-déclare, il ne sur-déclare jamais :
  il ne peut pas rendre la CI rouge sur du code correct.
- Les numéros de ligne rapportés par le sweep sont fiables : les lignes de
  commentaire sont **blanchies, pas supprimées**.
- Équilibre accolades / parenthèses / crochets des **12** fichiers Swift touchés
  au tokenizer (chaînes retirées avant les commentaires) : **0 / 0 / 0**.
- Catalogue : JSON revalidé, comparaison clé à clé, `sourceLanguage`/`version`
  inchangés.
- Fichiers neufs → `xcodegen generate` les enregistre (globbing récursif),
  **0 édition de `project.pbxproj`**.

Gate réel = CI `iOS Tests`.

## Bilan

**9 fichiers de production** (1 neuf, 8 modifiés d'une ligne d'appel).

- **8 CTA de confirmation** gardent leur nom VoiceOver pendant l'attente — dont
  un composant d'onboarding réutilisable qui nomme d'un coup tous ses usages.
- **1 modificateur** remplace 9 copies potentielles d'une même règle ; la
  doctrine de 220i a désormais **un seul point d'implémentation**.
- **1 clé i18n neuve**, traduite dans 7 locales ; **0 clé de libellé neuve** —
  les 8 sites réutilisent leur propre texte visible.
- **1 sweep** ferme la famille et la garde fermée.

**0 logique, 0 réseau, 0 layout, 0 couleur, 0 édition de `project.pbxproj`.**

## Piste 222i+

1. **Famille WCAG 1.4.1 des CTA** : `ChangePasswordView`, `AffiliateCreateView`
   — bouton désactivé dont la raison n'est signalée que par la couleur. Le
   paramètre `unavailableReason:` du modificateur de 221i les attend ; il
   manque les formulations.
2. **`StoryViewerView+Content.shareStory()`** — code mort (0 caller, établi
   217i) portant le dernier parcours de fenêtres.
3. **`MeeshyShareExtension` i18n** — débloqué, 3 chaînes crues.
4. **Balayage Dark Mode généralisé** (famille 219i) — attention aux deux pièges
   déjà documentés.
5. **`sensoryFeedback` (iOS 17+)** — 0 usage vs 11 `UIImpactFeedbackGenerator`.
