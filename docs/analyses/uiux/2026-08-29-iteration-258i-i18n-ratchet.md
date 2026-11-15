# Iteration-258i — un cliquet qui laisse passer 1443 clés est un commentaire

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surface** : le cliquet i18n (`LocalizationConsistencyTests`)
**Base** : `main` HEAD `9ac93624` · **Issue** : #4292
**Précédent direct** : 257i (Reduce Motion sur les boucles de statut)

---

## 1. Deux défauts, et le second explique le premier

### Le plafond ne bornait plus rien

`test_untranslatedKeyBacklogDoesNotGrow` épinglait le backlog à **1545**, mesuré au
226i. Réplication fidèle de la règle aujourd'hui — même `isIdentifier`, même
`isModuleBundle`, même `state == "translated"`, mêmes six racines de sources,
mêmes catalogues par cible, `requiredLocales` = locales expédiées **moins** la
langue source :

| | |
|---|---|
| plafond épinglé | **1545** |
| backlog réel | **102** |
| marge admise | **1443 clés** |

Le catalogue s'est presque entièrement rempli entre-temps — **3397 des 3408
entrées** sont traduites dans les six locales requises — et le pin n'a jamais
suivi.

> **Un cliquet qui admet 1443 nouvelles clés non traduites ne cliquette plus.**
> Son propre commentaire disait « the number must only ever go DOWN » ; il n'est
> pas redescendu avec la réalité, et personne ne pouvait le voir puisque le test
> restait vert.

### Le scanner ne voyait pas les appels multi-lignes

Le marqueur était le littéral `"String(localized:"`. Un appel réparti —
`String(\n    localized: "…"` — ne le contient pas.

| | 226i | 258i |
|---|---|---|
| appels invisibles | 92 (46 fichiers) | **185 (61 fichiers)** |

Rien n'empêchant d'en écrire de nouveaux, **le trou s'élargit tout seul**.

---

## 2. Ce que 226i avait vu, et pourquoi sa conclusion s'est périmée

226i avait mesuré ce trou et **renoncé sciemment**, en donnant une raison juste :

> « élargir le marqueur fait apparaître des clés neuves donc **MONTER** le
> backlog, alors que le plafond ne doit que descendre »

C'était exact — **contre un plafond qu'on croyait serré**. Il ne l'était pas. La
vraie réponse n'était ni « élargir » ni « renoncer », mais **élargir ET
re-piquer**.

> **Une contrainte peut interdire le bon geste parce que la valeur qui la porte
> a cessé d'être vraie.** Avant de renoncer à une amélioration parce qu'un
> cliquet l'interdit, mesurer le cliquet lui-même : 226i a raisonné sur 1545 sans
> jamais demander ce que valait la mesure du jour.

---

## 3. Le correctif

Le marqueur devient un **motif** plutôt qu'un littéral :

```swift
try? NSRegularExpression(pattern: #"String\(\s*localized:"#)
```

`\s*` couvre les deux écritures d'un coup. L'arithmétique `openParen` en aval est
**inchangée** : `(` suit immédiatement `String` dans les 5181 appels du dépôt
(vérifié, 0 écart). Le fichier contient déjà ce même idiome
`guard let … try? NSRegularExpression` trente lignes plus bas — la forme retenue
n'est pas une nouveauté qu'on ne pourrait pas compiler.

Plafond re-piqué : **1545 → 114**.

---

## 4. Ce que la mesure a coûté avant d'être juste

La première réplication a rendu un backlog de **1024**, puis **93**, avant de se
stabiliser à **102**. Deux erreurs, toutes deux dans MA copie de la règle :

| erreur | effet |
|---|---|
| oubli du filtre `!call.isModuleBundle` | comptait les clés du SDK contre le catalogue de l'app |
| `isIdentifier` trop strict (exigeait un point, refusait `-`) | rejetait des clés que le Swift accepte |

Une troisième a été attrapée par une borne : j'ai cru mesurer les **orphelines**
(133 en marqueur étroit, 23 en élargi) et en tirer un argument. Faux — le test
des orphelines lit `combinedSource` et y cherche des jetons entre guillemets, pas
`localizedCalls` : **il est totalement insensible à ce correctif**. Le chiffre
mesurait quelque chose que le dépôt ne mesure pas.

> **Répliquer une règle, c'est répliquer ses FILTRES, pas seulement sa boucle.**
> Et ce qui a fini par attester la fidélité n'est pas la relecture du code, c'est
> qu'en marqueur ÉTROIT la réplication reproduise exactement l'état vert actuel
> des trois règles sœurs (0/0/0) : une borne dont la réponse était connue.

---

## 5. Preuve

Le marqueur alimente **tous** les tests du fichier, pas seulement le cliquet.
Chaque règle rejouée hors Xcode, en marqueur étroit ET élargi :

| règle | étroit | élargi |
|---|---|---|
| clés sans `defaultValue` et sans entrée `en` | 0 | **0** |
| écrans épinglés non traduits | 0 | **0** |
| `defaultValue` ≠ valeur du catalogue | 0 | **0** |
| clés orphelines | non concerné (lit `combinedSource`) | non concerné |
| **backlog** | 102 | **114** |

| borne | valeur |
|---|---|
| fichiers sources balayés | 1291 |
| `unifié == étroit + multi` | 5181 == 4996 + 185 ✓ |
| `(` suit `String` partout | 0 écart |
| banc neuf : ancien marqueur | voit **1** clé sur 2 → RED prouvé |
| banc neuf : nouveau marqueur | voit **les 2** → GREEN |
| accolades vs `HEAD` | identiques |

**Gate réel = CI `iOS Tests`.** Aucune chaîne d'outils Apple ici : la compile
n'est pas prouvée localement, et c'est dit plutôt que supposé.

---

## 6. Ce qui change à l'écran

**Rien.** Aucun fichier de production n'est touché — le correctif est entièrement
dans l'outil de mesure et son plafond. Ce qui change est ce que le dépôt SAIT de
lui-même : douze clés non traduites, jusqu'ici incomptables, entrent dans le
compte et peuvent enfin être planifiées (#4293).

---

## 7. Dimensions

| dimension | état |
|---|---|
| 11 · Maintenabilité | mûre — le cliquet borne à nouveau ; une borne interdit au marqueur de re-rétrécir en silence |
| 13 · Complétude | mûre pour l'OUTIL (les deux écritures sont vues), **partielle** pour le produit : les 12 clés révélées restent non traduites (#4293) |
| 9 · Compatibilité | inchangée — aucune traduction ajoutée ni retirée |

---

## 8. Suites

1. **#4293** — traduire les 12 clés révélées (six sont des libellés **VoiceOver**,
   invisibles sur toute capture, ce qui explique leur survie). Toutes portent un
   `defaultValue` interpolé : leurs entrées demandent des spécificateurs de format
   exacts, à vérifier **par un rendu réel**. L'une, `comments.load-more-replies`,
   cache un **pluriel anglais codé en dur** dans un catalogue de source française —
   la forme exacte du défaut corrigé au 226i, et un texte anglais servi aujourd'hui
   à tout le monde, français compris.
2. **#4288** / **#4289** — hérités de 257i (l'écran de réglages d'accessibilité
   absent ; le `@propertyWrapper` à valider avec un compilateur).
3. Carry-over : rangée méta du fil en Dynamic Type XXL (demande un simulateur) ;
   `AudioPostComposerView:46` et son commentaire factuellement faux.
