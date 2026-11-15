## Leçon 427 — Un compteur qui lit du texte colorisé compte ZÉRO, et le dit comme un succès

2026-09-02. `scripts/check-type-debt.sh` comptait les erreurs de types du web
par `grep -E 'error TS[0-9]+'` sur la sortie de `tsc`. Or `tsc` colorise dès que
`FORCE_COLOR` est posé — le cas dans toute session d'agent et sur bien des
terminaux — et les séquences ANSI s'insèrent **entre** les deux mots du motif :

```
^[[91merror^[[0m^[[90m TS2322:
```

Le motif ne matche plus rien. Même arbre, même commit : **0** avec couleur,
**1194** sans. Reproduit sur une fixture à deux erreurs : 0 / 2.

**Le coût n'est pas le chiffre faux, c'est ce que le chiffre faux DÉCLENCHE.**
Le cliquet, voyant 0 sous une baseline de 1180, imprime « écrire
`readonly WEB_BASELINE=0` » — et j'ai obéi. Gate bloquant, CI rouge, revert par
une session voisine.

> **Un outil qui se trompe en silence est gênant ; un outil qui se trompe et
> PRESCRIT est dangereux.** Avant d'appliquer ce qu'un script recommande, se
> demander d'où vient le nombre sur lequel il fonde sa recommandation.

### La garde existait, et ne pouvait pas la voir

L'auto-test du script attend 2 erreurs sur une fixture fautive : avec la
couleur il en aurait compté 0 et serait tombé. Mais il n'est lancé que par la
CI (`--self-test && …`), où `FORCE_COLOR` n'est pas posé.

> **Une garde qui n'attrape le défaut que dans l'environnement où le défaut ne
> se produit pas ne le trouvera jamais.** Elle est verte partout, pour deux
> raisons opposées : en CI parce que tout va bien, en local parce que personne
> ne la lance. Quand un outil a un `--self-test`, le lancer AVANT de croire sa
> mesure, surtout sur un poste qui n'est pas celui de la CI.

### Ce qui l'a démasqué

Une session voisine a répondu à mon hypothèse par **ses propres chiffres**
(1194, avec la répartition par fichier) au lieu de me croire. C'est la
contradiction chiffrée qui a tué l'explication fausse — que j'avais publiée en
la présentant comme hypothèse, avec son test décisif, ce qui l'a rendue
réfutable en dix minutes.

### Parade
- `--pretty false` sur toute invocation de `tsc` dont on parse la sortie ;
- plus généralement : **un parseur de sortie d'outil désactive la couleur à la
  source**, il ne la nettoie pas après coup (`sed`/`perl` d'anti-ANSI est un
  pansement qui oublie le prochain outil).
