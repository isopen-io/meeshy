# Iteration-268i — Le code disait « Reply » là où l'app affiche « Répondre »

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surface** : `defaultValue` inline vs catalogue · cliquet `fullyLocalizedScreens`
**Base** : `main` HEAD `a9b5ee8c` · **Issue** : #4308 (avancée, non close)
**Précédent direct** : 267i (les 92 écrans restants épinglés)

---

## 1. Le verrou que 267i avait identifié

267i a épuisé le vivier des écrans épinglables sans toucher au code, et a produit
en passant le renseignement qui désigne la suite : sur les 164 fichiers restants,
**154 échouaient sur la SEULE règle B** — le `defaultValue` inline divergent du
catalogue. Ce n'était plus la traduction qui bornait le cliquet, c'était la dette
de littéraux (#4308).

---

## 2. J'avais dit que ça demandait un compilateur. C'était faux, et mesurable

#4308 pose la contrainte ainsi :

> Mécanique, mais **à faire avec un compilateur** : 648 littéraux Swift à
> réécrire, dont beaucoup contiennent des apostrophes (`J'aime`) et des accents.
> Une erreur d'échappement casse la compilation.

Je l'avais répétée. **Les apostrophes et les accents ne demandent AUCUN
échappement dans un littéral Swift** — seuls `"` et `\` en demandent. Mesure sur
les 504 divergences du lot :

| classe | occurrences |
|---|---|
| aucun échappement requis | **500** |
| contient `%` (spécificateur, sans effet sur l'échappement) | 13 |
| contient `"` ou `\` ou un saut de ligne | **0** |
| sans valeur source plate au catalogue (non réconciliable) | 4 |

> **Le risque énoncé n'existait pas sur ce lot.** Il était plausible — il est
> même la bonne inquiétude en général — mais personne ne l'avait mesuré, et
> l'énoncé a suffi à figer la tâche pendant plusieurs itérations. **Vérifier la
> contrainte qu'on hérite avant de la transmettre.**

---

## 3. Le sens de la réconciliation

`String(localized:defaultValue:)` porte deux textes ; **à l'exécution le
catalogue gagne** dès que la clé y existe. Le `defaultValue` n'est qu'un repli
pour clé absente — donc du texte mort quand il diverge.

| clé | ce que le CODE disait | ce que l'app AFFICHE |
|---|---|---|
| `notifications.action.reply` | `"Reply"` | « Répondre » |
| `notifications.action.send` | `"Send"` | « Envoyer » |
| `notifications.action.markRead` | `"Mark as read"` | « Marquer comme lu » |
| `notifications.action.accept` | `"Accept"` | « Accepter » |

Le code se lit comme une app **anglaise** ; elle expédie du français. C'est le
catalogue qui fait foi : ce sont les littéraux qui s'alignent.

---

## 4. La transformation, et ce qui la rend sûre sans compilateur

Le remplacement ne se fait pas par expression régulière sur le fichier, mais sur
les **bornes absolues** du littéral, extraites du segment d'appel à parenthèses
équilibrées — et chaque borne est vérifiée avant écriture
(`src[start:end] == inline`). Les éditions sont appliquées **de droite à gauche**
pour que les décalages restent valides.

Trois contrôles par fichier, après écriture :

| contrôle | pourquoi |
|---|---|
| la liste des CLÉS est identique | une borne fausse aurait déplacé un littéral de clé |
| le nombre de lignes est identique | aucune valeur ne contient de saut de ligne |
| le nombre d'appels `String(localized:` est identique | la structure n'a pas bougé |

Diff obtenu : **105 fichiers, +487 / −487** — strictement neutre en lignes, ce
qui importe puisque plusieurs de ces fichiers sont dans la dette de taille
héritée de #4302, où ajouter est interdit.

---

## 5. Preuve

| mesure | valeur |
|---|---|
| littéraux réconciliés | **498** dans **105** fichiers |
| écrans épinglés | 135 → **240** |
| clés gardées | 1 210 → **2 761** |
| **règle A** — clé non traduite dans les 6 locales | **0** |
| **règle B** — `defaultValue` ≠ entrée `fr` | **0** |
| fichiers bloqués | 164 → **59** |
| chemins introuvables / doublons (bornes) | **0** / **0** |

Les deux règles sont vérifiées **contre la liste relue depuis le fichier édité**.

Les trois écrans que #4308 nommait comme objectif sont épinglés :
`SettingsView` (87 clés, déjà pris au 263i), `NotificationSettingsView` (56),
`SecurityView` (58).

**Gate réel = CI `iOS Tests`.** Pas de chaîne d'outils Apple ici : la compile
n'est pas prouvée localement, et c'est dit plutôt que supposé.

---

## 6. Ce qui reste, et pourquoi #4308 NE se ferme PAS

| reste | fichiers | nature |
|---|---|---|
| divergences réconciliables | 186 dans 40 fichiers | mêmes conditions, **0 hasard d'échappement** — un lot suivant |
| clés **absentes du catalogue** | ~30 | le `defaultValue` EST ce qui s'affiche, dans toutes les locales : il manque une entrée, pas un alignement |
| clés **PLURIELLES** | 4 | leur `fr` vit sous `variations.plural`, sans `stringUnit` plat |

Les 186 restants sont dans des fichiers que la **règle A** bloque de toute façon
(clés non traduites) : les réconcilier ne débloquerait aucun écran. Le faire dans
ce lot aurait doublé le diff pour zéro gain de cliquet — c'est la doctrine du
263i (« un lot que la CI valide, puis on poursuit »).

### Un défaut de la garde elle-même, trouvé en passant

**La règle B ne peut PAS être satisfaite par une clé PLURIELLE.** Elle compare le
littéral à `sourceValues[key]`, lu depuis le `stringUnit` PLAT ; un pluriel n'en
a pas, la valeur est `nil`, et la comparaison échoue quoi qu'on écrive. Trois
fichiers (`StatsTimelineChart`, `MembersCountLabel`, `UnreadCountLabel`) sont
donc **inépinglables par construction**, pas par dette.

C'est la même famille que le correctif 226i, qui avait appris la pluralité à
`loadTranslations` — et l'a oubliée pour `values`. Corriger cela change la
SÉMANTIQUE de la règle : c'est une décision, pas un nettoyage, donc un lot à
part.

---

## 7. Dimensions

| dimension | état |
|---|---|
| 9 · Compatibilité (7 langues) | **mûre** sur 240 écrans (2 761 clés) |
| 11 · Maintenabilité | **mûre** — le code ne ment plus sur 498 chaînes |
| 13 · Complétude | **partielle** — 59 fichiers restants, dont 3 inépinglables par construction |

---

## 8. Suites

1. **#4308 reste ouverte** : 186 divergences réconciliables dans 40 fichiers.
2. **Les ~30 clés absentes du catalogue** : leur `defaultValue` s'affiche partout
   — il leur faut une entrée et des traductions, pas un alignement.
3. **La règle B et les pluriels** — décision sur la sémantique de la garde.
4. **Les 74 écrans à `ProgressView`** sans squelette (#4319).
