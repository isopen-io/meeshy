## Le discriminant, en deux nombres

Après résolution, pour chaque fichier qui était EN CONFLIT et qui porte des
invariants, compter les invariants de CHAQUE côté dans le résultat :

```bash
for r in <dev> <branche> <résolution>; do
  printf '%-14s ' "$r"
  git show "${r}:<fichier>" | grep -c '<invariant de dev>' | tr '\n' ' '
  git show "${r}:<fichier>" | grep -c '<invariant de la branche>'
done
```

Deux colonnes, trois lignes, et « un seul côté » se voit. Corollaire plus rapide
encore : **pour un fichier de gardes, un `sha` identique à l'un des parents EST le
signal** — un fichier en conflit qui ressort à l'octet identique à un parent n'a
pas été résolu, il a été choisi.

Et le même relevé sépare les DEUX questions qu'un merge pose, qu'on confond
toujours : ce qui a été ARBITRÉ et ce qui a été BALAYÉ. La seconde ne se lit pas
dans le `--stat` d'un merge — il est GROS et normal par nature — mais dans une
soustraction :

```
diffèrent des deux parents   : 16 fichiers
étaient en conflit           :  8 fichiers
donc ÉTRANGERS au merge      : 11 fichiers   ← le travail vivant d'autres sessions
```

Une résolution de conflit diffère des deux parents **par construction** : « diffère
des deux parents » ne discrimine donc RIEN à lui seul. Mesuré sur ce même merge :
sept des onze appartenaient au lot en cours d'écriture d'une autre session, quatre
au chantier de l'auteur lui-même, non annoncés par son titre. Signature d'un
`git commit -a` pendant la résolution. **Un `--stat` se lit avant CHAQUE commit, et
un merge n'est pas une exception : c'est le cas où l'on est le plus sûr de savoir
ce qu'il contient, donc celui où l'on regarde le moins.**
