# Iteration-267i — Le solde du cliquet i18n, pris avec la confiance que la CI a rendue

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surface** : cliquet `fullyLocalizedScreens` · 92 écrans restants
**Base** : `main` HEAD `6fc9486c` · **Issue** : #4322
**Précédent direct** : 266i (le squelette de démarrage à froid)

---

## 1. Le suivi que 263i avait explicitement laissé

#4309 a épinglé **40 écrans sur 132 éligibles**, et a nommé la raison de ne pas
en prendre plus :

> Ils sortent tous du **même** parseur, non compilable ici : le risque n'est pas
> par fichier mais **par PARSEUR** — s'il se trompe, il se trompe partout. […]
> On épingle donc un lot que la CI valide, puis on poursuit avec une confiance
> **mesurée** plutôt que supposée.

**La CI a validé.** Les 40 écrans sont passés aux deux règles du premier coup
(PR #4310). La confiance demandée existe ; le solde se prend.

---

## 2. Répliquer les FILTRES, pas la boucle

C'est la leçon du 258i — trois nombres faux d'affilée (1024 → 93 → 102), chacun
par un filtre omis, jamais par la boucle. La réplique a donc été refaite depuis
la source, filtre par filtre :

| filtre | ce qu'il change |
|---|---|
| segment à parenthèses **équilibrées** (chaînes et échappements suivis) | un `String(localized:)` réparti sur plusieurs lignes reste UN appel |
| `isIdentifier(key)` | une phrase française employée comme clé n'est pas un identifiant |
| `!isModuleBundle` (`.module` dans le segment) | les clés du SDK se mesurent contre le catalogue du SDK |
| `!untranslatableKeys.contains(key)` | les CGU, exclues avec leur raison |
| **`state == "translated"`** | un `needs_review` n'est PAS une traduction livrée |
| **pluriels** : chaque catégorie CLDR doit l'être | correctif 226i — sans lui, les neuf clés plurielles comptaient comme des trous |
| `requiredLocales = CFBundleLocalizations − sourceLanguage` | 7 − `fr` = 6 |
| `defaultValue` inline seulement (un bloc `"""` rend `nil`) | pas de faux littéral vide |
| `defaultValue` contenant `\(` exclu de la règle B | Xcode réécrit `"… \(x)"` en `"… %@"` à l'extraction |

**Contrôle de cohérence** : la réplique rend **92 éligibles**, exactement le
solde annoncé par #4309 (132 − 40). Deux mesures indépendantes, séparées par
quatre itérations, tombent sur le même nombre.

---

## 3. Preuve

| mesure | valeur |
|---|---|
| écrans épinglés | 43 → **135** |
| clés gardées | 930 → **1 210** (+280) |
| **règle A** — clé non traduite dans les 6 locales requises | **0** |
| **règle B** — `defaultValue` ≠ entrée `fr` du catalogue | **0** |
| chemins introuvables sur disque (borne) | **0** |
| doublons dans la liste (borne) | **0** |
| fichiers de production touchés | **0** |
| éligibles restants après ce lot | **0** — le vivier est épuisé |

Les deux règles sont vérifiées **contre la liste relue depuis le fichier
édité**, pas contre la liste que je viens d'écrire : c'est la seule façon qu'une
faute de collage se voie.

**Gate réel = CI `iOS Tests`.** Pas de chaîne d'outils Apple ici : la compile
n'est pas prouvée localement, et c'est dit plutôt que supposé.

---

## 4. Ce qui reste dehors, et par quoi

164 fichiers échouent encore, et la répartition est l'information utile :

| bloqué par | fichiers |
|---|---|
| règle B — `defaultValue` divergent | **154** |
| règle A — traduction manquante | 56 |

> **Ce n'est plus la traduction qui borne ce cliquet, c'est la dette de
> littéraux.** #4308 (648 `defaultValue` divergents) bloque à lui seul 94 % des
> fichiers restants. Tant qu'il n'est pas soldé, le cliquet ne peut plus
> beaucoup grandir — et le solder le ferait bondir d'un coup.

C'est un renseignement que le lot produit gratuitement : la prochaine action
utile sur cette surface n'est pas « traduire », c'est « réconcilier ».

---

## 5. Ce que ça protège

Le cliquet est **additif** : hors de la liste, rien n'empêche qu'une clé soit
ajoutée demain avec un simple `defaultValue`, expédiant du français aux six
autres locales sans qu'aucun test ne rougisse. Les 135 écrans ne peuvent plus
régresser en silence — ni vers le français (règle A), ni vers un littéral qui
ment au lecteur (règle B).

**Aucun fichier de production touché** : l'épinglage ne change rien à
l'exécution, il interdit seulement la régression.

---

## 6. Dimensions

| dimension | état |
|---|---|
| 9 · Compatibilité (7 langues) | **mûre** sur 135 écrans |
| 11 · Maintenabilité | mûre — le vivier éligible est épuisé, le reste est nommé |
| 13 · Complétude | **partielle** — 164 fichiers restent, 154 derrière #4308 |

---

## 7. Suites

1. **#4308** — les 648 `defaultValue` divergents : c'est désormais le seul
   verrou significatif de ce cliquet (154 des 164 fichiers restants).
2. **Les 74 écrans à `ProgressView`** sans squelette (#4319) — décision produit,
   au simulateur.
3. **#4298** — le cube des stories et le swipe de bulle, en arabe.
4. **#4293** — les 12 clés à spécificateurs interpolés.
