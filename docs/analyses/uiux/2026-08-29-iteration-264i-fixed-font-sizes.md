# Iteration-264i — Une doctrine tenue à la main, jusqu'au jour où elle ne l'est plus

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surface** : bandeau de statistiques du profil · doctrine des tailles de police figées
**Base** : `main` HEAD `a2ce8815` · **Issue** : #4311
**Précédent direct** : 263i (quarante écrans épinglés au cliquet i18n)

---

## 1. Ce que l'itération cherchait, et ce qu'elle a trouvé

Balayage d'accessibilité, deux passes. **La première n'a rien donné, et c'est un
résultat.**

| passe | mesure | verdict |
|---|---|---|
| bouton à glyphe seul sans libellé VoiceOver | 871 `Button`, **6** candidats | **0 défaut** — les six sont agrégés par leur conteneur (`children: .ignore` / `.combine`) et ré-exposés en action de rotor, chacun avec le commentaire qui le dit |
| taille de police figée (Dynamic Type) | **247** sites, 88 fichiers | **1 défaut**, et un manque d'instrument |

Le premier scanner rendait six « prises » ; les six étaient des faux positifs par
construction, parce qu'il cherchait `.accessibilityLabel` sans regarder
`.accessibilityHidden` — l'idiome 183i du dépôt, qui masque le bouton imbriqué et
rend son action au conteneur. **Compter les prises d'un scanner avant d'avoir lu
la doctrine qu'il traverse revient à mesurer sa propre ignorance.**

---

## 2. La doctrine des tailles figées, et son unique fuite

Le dépôt possède `MeeshyFont.relative` (documenté « a mechanical swap ») et une
règle énoncée sous trois numéros d'itération — **53i**, **82i**, **86i** : une
taille reste FIGÉE quand le glyphe est **borné par un cadre fixe** qui déborderait
s'il scalait.

| receveur du `.font(.system(size:))` | sites |
|---|---|
| glyphe (`Image`) | 207 |
| glyphe après un bloc `if/else` (tête = `}`) | 2 |
| **texte** (`Text` / `Label` / `TextField`) | **37** |

**36 des 37 sites de texte portaient leur justification en commentaire,
nommément** — la touche de pavé 72×56, le cercle d'upload 50×50, la pastille
capsule « tight », le rail de 56 pt de large. La doctrine était tenue à la main,
site par site, avec un soin réel.

### Le 37ᵉ

`ProfileUserPostsList.chip` — le bandeau « Postes / Réels / Stories » du profil :

```swift
VStack(spacing: 4) {
    Image(systemName: icon).font(.system(size: 15, weight: .semibold))    // figé
    Text(display).font(.system(size: 18, weight: .bold, design: .rounded)) // figé — LE CHIFFRE
    Text(label).font(.caption2)                                            // SCALE
}
.frame(maxWidth: .infinity)
.padding(.vertical, 12)
```

La tuile **n'a pas de hauteur fixe** : `maxWidth: .infinity` + padding vertical,
le `VStack` grandit librement. Rien ne déborderait si le chiffre scalait — et la
troisième ligne, en `.caption2`, scale déjà.

> **En AX5, le libellé « Postes » (≈ 28 pt) devient une fois et demie plus gros
> que le nombre qu'il légende (18 pt).** La hiérarchie typographique de la carte
> s'inverse : la donnée principale devient le plus petit élément de sa propre
> tuile. Le glyphe subit la même inversion.

### Pourquoi la relecture ne pouvait pas le voir

Ses trente-six voisins ont tous un cadre fixe qui justifie le gel. **Un site dont
les voisins sont justifiés RESSEMBLE à un site justifié** — c'est l'angle mort
exact d'une règle tenue par la discipline plutôt que par un instrument.

---

## 3. Le remède, en deux moitiés

### 3.1 La tuile

Deux lignes, un remplacement — `MeeshyFont.relative(15, weight: .semibold)` et
`MeeshyFont.relative(18, weight: .bold, design: .rounded)`. Les trois lignes de
la tuile scalent désormais ensemble ; le `minimumScaleFactor(0.6)` +
`lineLimit(1)` déjà posés absorbent la largeur, donc aux grandes tailles la tuile
rétrécit-pour-tenir au lieu de tronquer.

**À nombre de lignes constant** : `ProfileUserPostsList.swift` fait 1274 lignes,
donc appartient à la dette héritée de #4302, où ajouter est interdit. La
justification vit ici et dans la garde, pas dans le fichier hors budget.

### 3.2 Le cliquet manquant

`MeeshyTests/Unit/Guards/FixedFontSizeGuardTests.swift` — quatre règles, aucune
touche au code de production :

| règle | ce qu'elle empêche |
|---|---|
| 1 · aucun fichier NEUF n'introduit de taille figée (87 noms épinglés) | un écran neuf qui recommence |
| 2 · le texte figé ne monte jamais (**≤ 36**) | l'inversion de hiérarchie qu'on vient de corriger |
| 3 · la population entière ne monte jamais (**≤ 245**) | l'ajout dans un fichier DÉJÀ porteur, que la règle 1 ne verrait pas |
| 4 · un fichier qui sort de la liste en est retiré | une liste qui garde des noms sans site et cesse de dire la vérité |

**La liste des fichiers est un SURENSEMBLE** (tout site figé compte, quel que
soit son receveur) : elle ne dépend d'aucune classification, donc aucune
divergence de classifieur ne peut la faire rougir à tort.

La garde ne dit PAS si un gel est justifié — cela demanderait de lire un cadre
fixe posé trois vues plus haut. Elle borne la POPULATION, exactement comme
`FileSizeBudgetGuardTests` borne la dette de taille.

---

## 4. RED → GREEN, prouvé et non décrété

Le correctif fait descendre le compte de texte de **37 à 36** et le total de
**247 à 245**. Les plafonds sont épinglés sur l'APRÈS :

```
PRE-FIX  ProfileUserPostsList : [(135, glyph), (138, text)]
POST-FIX ProfileUserPostsList : []
```

Le cliquet est donc **rouge sur l'état d'où il vient**. Pinner sur l'avant aurait
scellé le défaut dans la garde — la faute même que #4292 reprochait au cliquet
i18n, et que 261i avait dû réparer en payant sa dette dans le même lot.

---

## 5. Les bornes, et celle qui compte le plus

Toute la règle 2 repose sur la séparation texte / glyphe. **Un classifieur
effondré rendrait `0` texte — et le cliquet resterait VERT en ne protégeant plus
rien.** C'est le mode de panne payé au 256i puis rejoué au 257i, transposé d'un
balayage de fichiers à une classification.

| borne | exigence | mesure |
|---|---|---|
| le balayage voit le dépôt | > 400 fichiers | 604 |
| les 87 noms épinglés existent sur disque | 0 manquant | 0 |
| la classification **sépare** — glyphes non vides | > 150 | 207 |
| la classification **sépare** — textes non vides | > 20 | 36 |
| témoin synthétique — tête sur la même ligne | `Text(…)` → `text` | ✓ |
| témoin synthétique — tête via chaîne de modificateurs | `[glyph, text]` | ✓ |
| témoin synthétique — un site EN COMMENTAIRE n'existe pas | 1 site vu, pas 2 | ✓ |

Le troisième témoin n'est pas décoratif : la doctrine s'écrit JUSTE au-dessus du
site qu'elle justifie, et ces commentaires contiennent le motif recherché. Sans
`DeclarationBodyScanner.mask`, la garde compterait ses propres justifications.

| autre mesure | valeur |
|---|---|
| accolades / parenthèses / crochets de la garde | équilibrés |
| lignes de la garde (budget 1100) | 382 |
| `ProfileUserPostsList.swift` avant / après | 1274 / **1274** |
| diff de production | 2 lignes remplacées, 0 ajoutée |

**Gate réel = CI `iOS Tests`.** Pas de chaîne d'outils Apple ici : la compile
n'est pas prouvée localement, et c'est dit plutôt que supposé.

---

## 6. Ce qui change à l'écran

À la taille de Dynamic Type par défaut : le chiffre passe de 18 à 17 pt (mapping
documenté `..<18.5 → .body`), le glyphe reste à 15 pt (`.subheadline`, exact).
Écart d'un point, invisible.

Aux grandes tailles — et c'est là tout le sujet — les trois lignes de la tuile
grandissent **ensemble**, et le nombre reste plus gros que son libellé.

---

## 7. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | **mûre** sur la tuile ; les 36 gels restants sont justifiés un par un et désormais bornés |
| 8 · Expérience utilisateur | mûre — la hiérarchie de la carte tient à toutes les tailles |
| 11 · Maintenabilité | mûre — la doctrine 53i/82i/86i a enfin un instrument |
| 13 · Complétude | **partielle** — la garde borne la population, elle ne juge pas la justification d'un gel |

---

## 8. Ce qui reste HORS périmètre, et pourquoi

**Migrer les 36 sites restants.** Ils sont justifiés un par un, et les dégeler
déborderait leurs cadres fixes — c'est le contraire d'une amélioration. Le
cliquet borne la population et force sa décrue ; chaque dégel éventuel est un lot
à lui seul, avec un simulateur.

**Le helper mort de `UniversalComposerBar`.** `toolbarButton(icon:action:)` (ligne
889) n'a **aucun site d'appel** dans le dépôt — Swift n'avertit pas sur une
méthode privée inutilisée. Ce n'est pas un défaut visible par l'utilisateur ; c'en
serait un le jour où quelqu'un l'appellerait, puisqu'il rend un bouton à glyphe
seul sans libellé. À traiter comme un lot de maintenabilité, pas ici.

---

## 9. Suites

1. **#4308** — les 648 `defaultValue` divergents, qui bloquent l'épinglage des
   écrans les plus riches au cliquet i18n.
2. **92 fichiers** propres non encore épinglés à `fullyLocalizedScreens` : le
   parseur du 263i a été validé par la CI, la confiance est désormais mesurée.
3. **#4298** — le cube des stories et le swipe de bulle, au simulateur en arabe.
4. **#4288** / **#4289** — l'écran de réglages d'accessibilité absent ; le
   `@propertyWrapper` à valider avec un compilateur.
