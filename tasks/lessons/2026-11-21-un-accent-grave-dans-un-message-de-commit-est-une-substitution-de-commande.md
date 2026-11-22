## 2026-11-21 — Un accent grave dans un message de commit entre guillemets doubles est une substitution de commande (#20208, routine messagerie, cycle 204)

### Le fait

```bash
git commit -m "Un `delete` et non un `releasedAt`, mesuré : …"
```

`bash` a exécuté `delete` et `releasedAt`, répondu deux fois
`command not found` sur `stderr`, remplacé chacun par la chaîne VIDE, et
`git commit` a réussi. Le commit poussé porte :

> « Un  et non un , mesuré : AgentGlobalProfile est une ligne PAR UTILISATEUR… »

La phrase a perdu exactement les deux mots qui portaient son sens — le choix
technique qu'elle justifiait — et elle reste grammaticalement plausible, ce qui
est le pire cas : rien n'attire l'œil.

### Pourquoi ça ne se voit pas

1. **`git commit` réussit.** Le code de sortie est celui de git, pas celui des
   substitutions avortées.
2. **`command not found` part sur `stderr`**, noyé dans la sortie d'un `&&`
   enchaîné avec un `push`. Dans ce lot, les deux lignes d'erreur se sont
   affichées entre la sortie de `git status` et celle de `git push`.
3. **Les accents graves sont le style de ce dépôt.** Tous ses documents citent
   le code ainsi, et un message de commit se rédige dans la même habitude. Le
   risque est donc maximal là où la convention est la plus forte.

### La règle

**Un message de commit de plus d'une ligne s'écrit dans un FICHIER, jamais dans
un argument `-m` entre guillemets doubles.**

```bash
cat > msg.txt <<'EOF'      # le quoting du heredoc est ce qui protège
…texte avec des `accents graves`…
EOF
git commit -F msg.txt
```

Le `<<'EOF'` — délimiteur **entre apostrophes** — désactive toute expansion.
Sans les apostrophes, le heredoc expanse comme une chaîne double et le piège
revient à l'identique.

À défaut de fichier, des **apostrophes simples** autour du `-m` protègent
(`-m '…`backticks`…'`), au prix de ne plus pouvoir écrire d'apostrophe dans le
message — ce qui, en français, n'est pas une option.

### Corollaire : la correction a été refusée, et c'est le bon arbitrage

Corriger le message aurait exigé `git commit --amend` suivi d'un **push forcé**
sur une branche déjà poussée. Le classificateur l'a refusé. La correction vit
donc dans le JOURNAL du lot, à côté du reste de ses erreurs mesurées.

> **Un message de commit est un artefact IMMUABLE en pratique** : son coût de
> correction est un push forcé, c'est-à-dire plus que son bénéfice dès qu'il est
> poussé. Ce qui se corrige, ce sont les documents — `CLAUDE.md`, journaux,
> leçons — que quelqu'un relira. Deuxième fois dans le même cycle qu'un chiffre
> ou un mot faux d'un message de commit se corrige ailleurs qu'à sa source.

### Famille

Même racine que la leçon du dépôt sur le code de sortie lu à travers un pipe
(`services/gateway/CLAUDE.md`, « un gate rend DEUX verdicts ») : **le shell fait
silencieusement quelque chose de ce qu'on lui passe, et le succès de la commande
visible masque l'échec de ce qu'elle contenait.** Les deux se sont produits dans
ce même lot, à vingt minutes d'écart.
