## Leçon 597 — Sur un `dev` que plusieurs sessions alimentent, ne surveillez pas VOTRE sha : surveillez la POINTE qui le contient

Deux fois le même soir, mes fusions se sont retrouvées **sans verdict CI propre** :
une fois par ma faute (deux pushes à vingt minutes d'écart, le second superséda le
run en attente du premier), une fois par le push d'un pair arrivé quatre minutes
après le mien.

```
22:47  07a0a232e9  CI → cancelled   (mon push de 22:55 l'a superséda)
22:55  8a4f0e4c6e  CI → cancelled   (le push d'un pair à 22:59 l'a superséda)
22:59  5226fa9c00  CI → in_progress ← le SEUL verdict qui existera
```

La leçon connue disait « grouper les pushes ». Elle est juste et insuffisante :
**elle ne protège que de soi-même.** Sur une branche partagée, votre verdict est
mangé par des pushes que vous ne contrôlez pas, et attendre un run sur votre sha
est attendre quelque chose qui n'arrivera jamais.

> Le verdict qui compte est le premier run **terminé et non annulé** dont le sha
> **CONTIENT** vos commits. Le test est `git merge-base --is-ancestor <mon-sha>
> <sha-du-run>` — jamais un `startswith` sur votre sha, qui ne voit que votre
> commit.

Un run vert sur un descendant vérifie vos commits tout autant : ils sont dans son
arbre. Chercher un verdict « à vous » est une exigence de forme qui n'a pas de
contrepartie technique.

Mémoire : `reference_a_push_to_dev_kills_a_queued_verdict_not_a_running_one.md`,
complétée de ce corollaire.
