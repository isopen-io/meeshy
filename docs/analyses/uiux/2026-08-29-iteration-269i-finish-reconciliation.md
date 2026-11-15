# Iteration-269i — Solder la réconciliation, et nommer ce qu'elle ne peut pas atteindre

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surface** : `defaultValue` inline vs catalogue · clés absentes du catalogue
**Base** : `main` HEAD `d110653a` · **Issues** : #4308 (soldée pour sa part réconciliable), #4328, #4329
**Précédent direct** : 268i (498 littéraux réconciliés, 105 écrans débloqués)

---

## 1. Le solde, avec une transformation désormais prouvée

268i a réécrit 498 littéraux dans 105 fichiers de production **sans compilateur**,
et la CI a validé : la compile est passée. La méthode — bornes absolues vérifiées
avant écriture, éditions de droite à gauche, trois contrôles par fichier — n'est
plus une hypothèse.

Les **186 divergences restantes**, dans 40 fichiers, sont donc reprises avec la
même mécanique.

| mesure | valeur |
|---|---|
| littéraux réconciliés | **186** dans **40** fichiers |
| diff | **+186 / −186** — neutre en lignes |
| écrans épinglés (inchangé) | 240 · 2 761 clés |
| règle A / règle B sur les épinglés | **0** / **0** |
| **divergences réconciliables dans TOUT le dépôt** | **0** |

**Ce lot ne débloque aucun écran, et c'est assumé** : ces 40 fichiers sont tous
retenus par la règle A (traductions manquantes). Sa valeur est que le code cesse
de mentir — le point 1 de #4308 — et que ces fichiers deviendront épinglables dès
que leurs traductions arriveront, sans repasser par ici.

---

## 2. Ce que la réconciliation ne peut PAS atteindre

Il reste exactement deux familles, toutes deux **structurellement** hors de portée
d'un alignement de littéral :

| reste | volume | pourquoi c'est autre chose |
|---|---|---|
| clés **absentes du catalogue** | 29 clés / 30 sites | il n'y a rien à quoi s'aligner : la clé n'existe pas |
| clés **plurielles** | 4 | leur `fr` vit sous `variations.plural`, sans `stringUnit` plat |

### 2.1 Le défaut que ça révèle — #4328

Une clé absente du catalogue n'a **aucune localisation** : le `defaultValue` est
rendu **tel quel dans les sept locales**. Ces 29 chaînes s'affichent donc en
**français** pour les lecteurs arabophone, germanophone, hispanophone, italophone
et lusophone — et en français **non accentué** pour le francophone
(« Repertoire vide », « Lui ecrire », « Rechercher un affilie »), parce que
personne n'a jamais relu ce littéral comme du texte affiché.

**Sept sont des libellés d'accessibilité** : un lecteur d'écran arabe annonce
« lu », « en cours d'envoi », « Mettre en pause » en français. Une surface
entière est touchée — le répertoire / contacts, 12 clés.

> **Un `defaultValue` rend INVISIBLE l'absence de sa clé.** La garde qui traque
> les clés non résolues — `test_everyUsedIdentifierKeyResolvesInDevelopmentLanguage`
> — ne regarde que les appels **sans** `defaultValue`, parce qu'un `defaultValue`
> garantit qu'on n'affichera jamais l'identifiant brut. C'est vrai pour le
> CRASH ; c'est faux pour la LANGUE. Le repli qui protège de l'un masque l'autre.

### 2.2 Le défaut de la garde — #4329

La règle B compare le littéral à `sourceValues[key]`, lu depuis le `stringUnit`
**plat**. Un pluriel n'en a pas ⇒ `nil` ⇒ violation permanente, quoi qu'on
écrive. `StatsTimelineChart`, `MembersCountLabel` et `UnreadCountLabel` sont
inépinglables **par construction**.

C'est la moitié oubliée du correctif 226i, qui avait appris la pluralité à
`loadTranslations` — la fonction voisine, lisant la même structure — et pas à
`values`.

---

## 3. Pourquoi je n'ai pas traduit les 17 chaînes manquantes

Sur les 26 clés absentes non plurielles, **9 ont déjà leur traduction ailleurs
dans le catalogue**, sous une autre clé, et se réutilisent sans rien inventer
(`action.translate` → « Traduire », `media.pauseAudio` → « Mettre en pause »…).

Les **17 autres demandent une traduction neuve dans six langues, dont l'arabe —
102 chaînes**. Je ne les produis pas : c'est du texte expédié à des utilisateurs,
invérifiable depuis cet environnement, et **une traduction arabe approximative
est un défaut pire que le repli français honnête qu'elle remplacerait**. C'est le
principe déjà écrit dans `untranslatableKeys` pour les CGU, appliqué au volume
plutôt qu'à la nature du texte.

Le détail, avec la table des 9 réutilisables, est dans #4328 — pour être décidé,
pas deviné.

---

## 4. Preuve

| contrôle | résultat |
|---|---|
| par fichier — la liste des **CLÉS** est identique | ✓ (40/40) |
| par fichier — nombre de **lignes** identique | ✓ |
| par fichier — nombre d'**appels** `String(localized:` identique | ✓ |
| les 240 écrans épinglés restent verts | règle A **0**, règle B **0** |
| divergences réconciliables restantes | **0** |

Le contrôle des CLÉS est celui qui compte : une borne fausse aurait réécrit un
**identifiant** au lieu de son libellé — ce que ni la compile ni les deux règles
n'attrapent.

**Gate réel = CI `iOS Tests`.** Pas de chaîne d'outils Apple ici.

---

## 5. Dimensions

| dimension | état |
|---|---|
| 11 · Maintenabilité | **mûre** — plus aucun `defaultValue` réconciliable ne diverge |
| 9 · Compatibilité | **partielle** — 29 chaînes en français dans six locales (#4328) |
| 5 · Accessibilité | **partielle** — 7 libellés VoiceOver concernés (#4328) |
| 13 · Complétude | partielle — 59 fichiers non épinglés, dont 3 par construction (#4329) |

---

## 6. Suites

1. **#4328** — les 29 clés absentes : extraction Xcode + 9 réutilisations + 17
   traductions à décider.
2. **#4329** — la règle B et les pluriels : choisir la sémantique.
3. **#4319** — les 74 écrans à `ProgressView` sans squelette.
4. **#4298** — le cube des stories et le swipe de bulle, en arabe.
