## Leçon 475 — `-only-testing:` sur une suite ABSENTE du bundle ne fait pas échouer le run : il exécute les autres et rend VERT

**Le fait (2026-09-03, #4934).** Un gate ciblé rend :

```
GATE_RC=0
Executed 80 tests, with 0 failures (0 unexpected)
```

Quatre-vingts témoins, zéro échec. **Et zéro cas de la suite qu'on venait
d'écrire** — comptage : `grep -c "Test Case '-\[MeeshyTests.<Suite>"` → **0**.

Cause : le fichier neuf n'était pas dans `project.pbxproj` (pas de `xcodegen
generate` après création). `xcodebuild` a reçu un
`-only-testing:MeeshyTests/<Suite>` qui ne désigne rien, l'a **ignoré en
silence**, et a exécuté les autres suites nommées.

> **Le filtre qui ne trouve pas sa cible ne proteste pas.** Un `-only-testing`
> sur une classe absente se comporte exactement comme un `-only-testing` sur une
> classe qui passe. Le code de sortie, le compte de témoins et l'absence
> d'échec sont TOUS cohérents avec un succès — parce que c'en est un, pour les
> suites qui existent.

**La parade, et elle tient en une ligne à ajouter à chaque gate ciblé :**

```bash
grep -cE "Test Case '-\[<Module>.<Suite>" "$LOG"   # doit valoir 2 × nb de tests
```

Un `Test Case … started` + un `… passed` par test. Zéro = la suite n'a pas
tourné, quel que soit le vert affiché.

**Pourquoi cette leçon n'est pas un doublon de la dérive pbxproj.** Le
`CLAUDE.md` iOS documente déjà que la divergence `project.yml` ↔ pbxproj rend
des « suites de tests absentes du bundle, donc vertes par omission ». Ce qui
manquait est le MÉCANISME côté ligne de commande : on croit qu'un filtre
explicite protège de l'omission — *je le NOMME, donc il tournera* —, et c'est
faux. Le filtre nommé est précisément ce qui donne l'illusion de la garantie.

**Généralisation, valable au-delà d'Xcode** : tout mécanisme de SÉLECTION qui
ignore silencieusement une cible inconnue (`--only`, `--filter`, `-k`, `--grep`)
transforme une faute de frappe ou un fichier non enregistré en succès. La seule
défense est de compter ce qui a RÉELLEMENT tourné, jamais de se fier au fait
d'avoir demandé.

Voisines : la 472 (une feature qu'aucune donnée n'exerce ne se vérifie pas), même
famille — *ce qui ne s'exécute pas ne se signale pas*.
