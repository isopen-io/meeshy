## Leçon 376 — Une garde de source SUR-SPÉCIFIÉE punit un renommage sans rien protéger de plus

**Contexte (2026-08-31, #4611).** `MeeshyComposerHostGuardTests` épinglait, dans
la source du meuble, le littéral :

```swift
composer.adoptDraft(id: draftId)
```

Sa règle, écrite juste au-dessus, est pourtant double et ne parle pas de
`draftId` : **l'adoption existe**, et **elle vient APRÈS la graine**.

Le lot a fait lire au meuble la graine de la porte en repli du paramètre
(`draftId ?? intent.origin.resumedDraftId`), ce qui a renommé le local en
`repris`. La garde est tombée sur un changement qui ne touchait **ni** l'appel,
**ni** son ordre.

> **Une garde de source doit épingler ce que sa règle DIT, jamais ce que le code
> se trouve écrire autour.** Le nom d'une variable locale n'appartient à aucune
> règle : l'y faire entrer transforme la garde en test de non-régression du
> style, avec le coût d'un faux rouge à chaque refactor honnête.

Corrigée en `composer.adoptDraft(id:` — l'APPEL et l'ORDRE, rien de plus.

### Le symétrique, et pourquoi les deux comptent

| défaut | ce qu'il produit |
|---|---|
| garde trop LARGE (négative qui perd son fichier) | **verte en ne regardant plus rien** — la protection meurt en silence |
| garde trop ÉTROITE (ce lot) | **rouge sur un changement légitime** — le signal se dévalue, et on apprend à la contourner |

Le second est moins dangereux et plus corrosif : un rouge qu'on sait faux est un
rouge qu'on cesse de lire.

**Le test à s'appliquer** en écrivant une garde de source : *relire le
doc-comment de la règle, et vérifier que chaque token épinglé y figure.* Ici
`draftId` n'y figurait pas.

Voir [[reference_negative_source_guards_die_silently]],
[[reference_a_permanently_red_ci_stops_being_a_signal]].
