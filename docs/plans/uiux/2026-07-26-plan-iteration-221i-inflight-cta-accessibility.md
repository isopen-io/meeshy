# Plan — iOS UI/UX Iteration 221i

**Date** : 2026-07-26
**Axe** : Design system (extraction d'un modificateur réutilisable) ·
Accessibilité VoiceOver (CTA en vol) · i18n
**Base** : `main` HEAD `16f8197` — la branche `claude/quirky-curie-qzp0o7`
porte 220i, **non mergée** (aucun outil GitHub dans cette session), rebasée sur
ce HEAD. 221i s'empile donc dessus.

## Origine

Le pointeur 220i (piste 5) proposait d'appliquer la doctrine
« label stable / valeur transitoire » aux autres boutons qui échangent leur
`Text` contre un `ProgressView`. Un balayage du dépôt a été mené pour en établir
la population réelle.

## Le balayage, et sa correction

Un premier tri automatique a compté **11** boutons portant la forme
`if <flag> { ProgressView() … }`, dont **8** sans le moindre modificateur
d'accessibilité. **Ce chiffre était faux** : la fenêtre de contexte du script
tronquait les modificateurs situés plus bas, et surtout le tri ne distinguait
pas deux formes visuellement proches mais radicalement différentes pour
VoiceOver.

Relecture site par site :

| Forme | Effet VoiceOver | Sites |
|---|---|---|
| **`if flag { ProgressView() } else { Text }`** | Le `Text` **disparaît** → le bouton **perd son nom accessible** | **4** |
| `HStack { if flag { ProgressView() }; Text }` | Le `Text` **reste** → le nom survit | 3 |
| `Text(flag ? "…en cours" : "…")` | Le texte **dit** l'état, VoiceOver le lit | 1 |

**Seuls les 4 premiers sont le défaut de 220i.** Les 7 autres sont écartés de
cette itération, et la raison est consignée pour qu'aucune itération future ne
les re-flagge.

### Population retenue (4)

| Site | Clé du texte visible | Drapeau |
|---|---|---|
| `MagicLinkView.swift:166` | `auth.magiclink.send` | `isLoading` |
| `EditPostSheet.swift:164` | `feed.post.edit.publish` | `isSaving` |
| `ReportMessageSheet.swift:68` | `report.message.send` | `isSubmitting` |
| `FeedView+Attachments.swift:638` | `feed.post.composer.publish` | `isUploading` |

Les quatre sont le **CTA de confirmation** de leur écran ou de leur feuille
(trois sont en `ToolbarItem(placement: .confirmationAction)` ou équivalent).
Perdre leur nom accessible pendant l'action, c'est perdre le seul repère du seul
contrôle qui compte, au moment de l'attente.

### Sites écartés — **ne plus re-flagger**

| Site | Pourquoi ce n'est pas ce défaut |
|---|---|
| `DeleteAccountView:212` | `Text` conservé **et** `.accessibilityLabel` + `.accessibilityHint` déjà présents |
| `ChangePasswordView:223` | `Text` conservé → le nom survit |
| `AffiliateCreateView:95` | `Text` conservé → le nom survit |
| `CreateShareLinkView:340` | le `Text` **bascule** sur « Création en cours… » : l'état est déjà dit |
| `ReportUserView:172`, `ThreadView:217`, `CreateTrackingLinkView:120` | déjà conformes (label + hint, et valeur pour le dernier) |

## Le correctif : un modificateur, pas quatre copies

220i a posé la doctrine en trois modificateurs inline sur un site. La reproduire
telle quelle sur quatre sites de plus serait quatre copies d'une même règle.
`apps/ios/Meeshy/Features/Main/Views/Modifiers/` existe déjà pour ça.

Nouveau fichier `InFlightActionAccessibility.swift` :

```swift
extension View {
    func inFlightActionAccessibility(
        _ label: String,
        isInFlight: Bool,
        inFlightValue: String? = nil,
        unavailableReason: String? = nil
    ) -> some View
}
```

- `.accessibilityLabel(label)` — **épinglé**, donc il survit au remplacement du
  `Text` par le `ProgressView`. Chaque site passe **la clé de son propre texte
  visible** → le nom accessible contient le libellé affiché (**WCAG 2.5.3**), et
  **0 clé de libellé neuve**.
- `.accessibilityValue(…)` — `inFlightValue` si en vol (défaut : la clé partagée
  `a11y.action.in-progress`), sinon `unavailableReason` s'il est fourni, sinon
  `""`.

**1 seule clé i18n neuve** — `a11y.action.in-progress` — ajoutée au catalogue
**traduite dans les 7 locales**, insertion additive.

### `StatusComposerView` (220i) adopte le modificateur

Ses trois modificateurs inline sont remplacés par un appel unique passant
`inFlightValue:` (« Publication en cours ») et `unavailableReason:`. **Aucune
perte de spécificité** : sa formulation propre est conservée via le paramètre.
Le `.accessibilityHint` reste séparé (c'est le seul site à en porter un).

Résultat : **une** doctrine, **un** point d'implémentation, 5 sites.

## Hors périmètre

- Les 7 sites écartés ci-dessus.
- L'état désactivé des sites où l'indisponibilité est signalée par la couleur
  seule mais dont le nom ne disparaît pas (`ChangePasswordView`,
  `AffiliateCreateView`) : défaut réel mais **d'une autre famille** (WCAG 1.4.1,
  pas 4.1.2), à traiter par une itération dédiée avec ses propres formulations.
- Placement SDK : le modificateur lit une clé du catalogue de l'app et sert des
  écrans produit → **app-side**, conformément au test du grain de
  `apps/ios/CLAUDE.md`.

## Tests

`InFlightActionAccessibilityTests.swift` (neuf) :

1. **Sweep de non-régression** — aucun bouton du dépôt ne présente la forme
   « `ProgressView` en branche `if`, `Text` en branche `else` » **sans** que le
   `Button` porte `inFlightActionAccessibility` ou un `.accessibilityLabel`.
   C'est l'assertion qui empêche la réapparition du défaut, et elle est écrite
   pour **échouer** si un cinquième site apparaît.
2. Les 4 sites adoptent le modificateur, chacun avec **la clé de son texte
   visible** (vérifié clé par clé, ancré sur la fenêtre du bouton).
3. Le modificateur épingle le label et n'expose la valeur en vol que quand
   `isInFlight` (introspection de sa source : `accessibilityLabel` inconditionnel,
   `accessibilityValue` ternaire sur `isInFlight`).
4. `StatusComposerView` passe par le modificateur et **conserve** sa formulation
   propre (`…publish.publishing`, `…publish.disabled`) + son hint.
5. `a11y.action.in-progress` existe au catalogue, 7 locales, toutes
   `translated` et non vides.

Mise à jour de `StatusComposerPublishAccessibilityTests` (220i) : les assertions
qui visaient les trois modificateurs inline visent désormais l'appel au
modificateur partagé — même exigence, nouvelle forme.

**RED attendu** contre l'état actuel de la branche : le modificateur n'existe
pas, les 4 sites n'ont aucun modificateur d'accessibilité, la clé est absente du
catalogue.

## Vérification

- Pas de toolchain Swift (Linux) → chaque assertion rejouée déterministement
  hors Xcode, contre l'arbre de travail **et** contre l'état d'avant correctif ;
  équilibre accolades/parenthèses/crochets de tous les fichiers touchés au
  tokenizer ; JSON du catalogue revalidé + comparaison clé à clé (aucune clé
  préexistante déplacée).
- Fichiers neufs → `xcodegen generate` les enregistre (globbing récursif),
  **0 édition de `project.pbxproj`**.
- Gate réel = CI `iOS Tests`.

## Bilan attendu

4 CTA de confirmation qui gardent leur nom VoiceOver pendant l'attente,
1 modificateur réutilisable qui remplace 5 copies potentielles d'une même règle,
1 clé i18n neuve traduite dans 7 locales, 1 sweep de non-régression qui ferme la
famille. 0 logique, 0 réseau, 0 layout, 0 couleur.
