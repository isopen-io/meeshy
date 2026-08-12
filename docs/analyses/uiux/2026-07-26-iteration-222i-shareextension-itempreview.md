# iOS UI/UX — Iteration 222i

**Date** : 2026-07-26
**Surface** : `apps/ios/MeeshyShareExtension/ShareViewController.swift`
(`SharedItemPreview` + en-tête « Send to » de `ShareContentView`)
**Axe** : Accessibilité — VoiceOver (nommage des tuiles, rotor Titres)
**Base** : `main` HEAD `ffef1339e` — suite directe de 221i, même branche

## Contexte

221i a soldé `ContactRow` et la barre d'action de la feuille de partage, et
laissait `SharedItemPreview` en tête de la piste 222i. C'est fait ici.

`SharedItemPreview` rend la bande horizontale de tuiles 120×120 qui montre
**ce que l'on s'apprête à partager** — la seule confirmation visuelle du contenu
avant envoi.

> **⚠️ Même réserve de portée qu'en 221i** : `MeeshyShareExtension` est
> **délibérément hors des `dependencies` de l'app** (bundle id non enregistré
> pour la signature) et son chemin d'envoi ne mène nulle part (constat 220i).
> Travail **préparatoire sur du code non livré** — correct et sans risque, mais
> sans gain utilisateur tant que l'extension n'est pas embarquée.

## Écarts constatés

### A. Le glyphe décoratif était lu comme du contenu
Cinq des six branches `case` sont un `VStack` « SF Symbol + légende ». Aucune
n'était `.accessibilityHidden`, aucun `.accessibilityElement` ne regroupait la
tuile : VoiceOver annonçait « Doc Text Fill » puis le texte, soit deux arrêts
dont le premier est du bruit.

### B. La tuile `.image` était totalement anonyme
`case .image` rend un `Image(uiImage:)` **sans légende ni label** — c'est la
seule branche qui n'imprime aucun texte. VoiceOver annonçait une image sans nom.
Partager une photo ne donnait donc aucune confirmation audible du contenu de la
bande. C'est l'écart le plus net de la surface.

### C. `share.type.text` / `.url` / `.image` n'existaient pas
Le namespace ne couvrait que `video`, `file` et `location` — les trois branches
qui impriment une légende. Les trois autres n'avaient aucun nom déclaré.

### D. « Send to » n'était pas un en-tête
`Text(String(localized: "share.sendTo"))` en `.font(.headline)` : titre visuel
uniquement, sans trait `.isHeader`. Le rotor « Titres » de VoiceOver ne
proposait aucun point de saut vers la liste de contacts.

## Correctifs (222i)

1. **A + B** → la tuile devient un élément unique :
   `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(typeName)`
   + `.accessibilityValue(spokenContent)`. Le glyphe décoratif cesse d'être
   annoncé, et la tuile `.image` porte enfin un nom.
2. **C** → `typeName` est **total** sur `SharedItemType` (6 branches, exhaustif
   à la compilation). Les trois branches qui affichent déjà une légende
   **réutilisent la clé de cette légende** (`share.type.video`, `.file`,
   `.location`) : le nom prononcé ne peut pas diverger de ce qui est à l'écran,
   et aucune clé « a11y-only » parallèle n'est créée. Trois clés neuves pour les
   branches qui n'en avaient aucune : `share.type.text`, `.url`, `.image`.
3. **B (suite)** → `spokenContent` expose la charge partagée (`item.content as?
   String`) en valeur, pour que replier la tuile ne fasse pas **perdre** l'aperçu
   texte/URL. VoiceOver dit désormais « Lien, https://… » au lieu de « Link,
   https://… » lu en deux arrêts précédés d'un glyphe.
4. **D** → `.accessibilityAddTraits(.isHeader)` sur « Send to ».

`.image` porte toujours un `UIImage` et `.video` une `URL` (vérifié aux 4 sites
de construction, l.76–97) : `spokenContent` est vide pour `.video`, ce qui est
correct — le libellé « Video » porte seul le sens. Les branches `.file` et
`.location` ne sont construites nulle part, mais restent nommées pour que
`typeName` demeure total.

Aucun changement de logique, de réseau, ni de rendu visuel.

## Vérification

- 3 tests ajoutés à `ShareExtensionAccessibilityTests` (9 au total sur la
  surface). Le test `namesEveryContentKind` verrouille les deux invariants :
  les 6 sortes sont nommées, **et** les 3 clés réutilisées apparaissent
  exactement deux fois dans le fichier (légende + nom prononcé) — ce qui échoue
  si quelqu'un réintroduit une clé a11y-only parallèle.
- Le helper de scoping des tests a été durci : `declaration(of:in:)` borne une
  région au **type suivant** au lieu d'un span fixe. Un span fixe cesse
  silencieusement de couvrir la queue d'un type qui grandit (c'est exactement ce
  qui s'est produit ici : le span de 3000 de la première rédaction ne couvrait
  plus les modificateurs après l'ajout des deux propriétés calculées) et peut
  déborder sur le type voisin — dans les deux cas l'assertion passerait ou
  échouerait pour la mauvaise raison. Absence de débordement vérifiée dans les
  deux sens.
- Les 9 assertions ont été évaluées déterministiquement hors Xcode avant commit.
  Toolchain Swift absente de l'environnement → gate = CI `iOS Tests`.

## Statut

Écarts A–D **résolus**. Ne plus re-flagger `SharedItemPreview` (nommage VoiceOver
des tuiles soldé) ni l'en-tête « Send to » (trait `.isHeader` soldé).

Avec 221i, la surface `MeeshyShareExtension/ShareViewController.swift` est
désormais couverte pour l'accessibilité VoiceOver, le contraste, les cibles
tactiles et la convention i18n.

## Reste à faire (216i+)

- **Ajouter un `Localizable.xcstrings` à la cible `MeeshyShareExtension`.** Reste
  le plus fort reliquat de la surface : sans catalogue, les **11** clés `share.*`
  (5 préexistantes + 3 de 221i + 3 de 222i) retombent toutes sur leur
  `defaultValue` anglais dans **toutes** les locales. Chantier distinct — il
  touche `project.yml` et les ressources de la cible, et n'est pas vérifiable
  sans toolchain Swift ; à mener dans sa propre itération, idéalement dans un
  environnement où le build est reproductible.
- La bande horizontale d'aperçu n'a pas de libellé de conteneur ; les tuiles
  étant désormais nommées individuellement, le gain serait marginal et le risque
  d'avaler les enfants réel. Écarté sciemment.
- `MemberManagementSection.emptyState` (l.306-322) — `VStack` fait-main →
  `EmptyStateView(compact:)`, en vérifiant le risque layout `maxHeight: .infinity`.
