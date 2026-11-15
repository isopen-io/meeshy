## Leçon 390 — En zsh, `for x in $LISTE` ne découpe pas sur les sauts de ligne — et un `-only-testing` mal formé rend « passed, 0 test »

**Lot #4667–#4670 (2026-09-01).** Pour balayer 106 suites, j'ai construit la
liste des classes puis :

```zsh
for c in $CLASSES; do ARGS+=("-only-testing:MeeshyTests/$c"); done
```

**zsh ne fait pas de word splitting sur une expansion non quotée**, contrairement
à bash. `ARGS` a donc reçu UN seul élément contenant les 106 noms collés par des
retours à la ligne. Et `xcodebuild` a rendu :

```
Test Suite 'Selected tests' passed
	 Executed 0 tests, with 0 failures
```

**`RC=0`, « passed », zéro test.** Un faux vert parfait : le mot « passed » est
là, aucune erreur n'est levée, et seul le compte trahit.

> **Le compte de tests exécutés est la seule preuve qu'un gate a mesuré quelque
> chose.** « passed » sans nombre ne dit rien ; c'est la forme
> `test-without-building` rejouant un bundle périmé, vue sous un autre angle —
> le verdict est vrai, il ne porte simplement sur rien.

Deux réflexes : lire `Executed N tests` avant de croire un vert, et construire
un tableau d'arguments par `while IFS= read -r l; do ARGS+=("$l"); done < fichier`
plutôt que par une expansion non quotée.
