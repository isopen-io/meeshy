# Un auditeur qui MUTE l'arbre vivant se fait committer par la session qui l'a lancé

*2026-11-19, cycle 186, #19827 — incident réel, attrapé par l'audit lui-même.*

## Ce qui s'est passé

J'ai lancé l'`auditeur-adversarial` sur le lot #19827 **dans le worktree
principal**, pendant que je continuais à travailler dedans. Sa méthode est la
bonne — il MUTE la production pour mesurer combien de témoins tombent, puis
restaure. Mais entre sa mutation et sa restauration, j'ai fait `git add -A` pour
un lot voisin.

Résultat, dans l'historique de la branche :

| commit | ce qu'il porte vraiment |
|---|---|
| `0f4a5df9ca` (#19938) | son propre lot **+ `const permanent = true;`** — la mutation C de l'auditeur, qui **NEUTRALISE #19827** |
| `581ef0679c` (journal) | la restauration de cette ligne, **sans un mot** dans son message |

L'état final était correct — le blob de `RedisDeliveryQueue.ts` à la tête est
identique à l'octet près à celui du lot d'origine — et c'est précisément ce qui
rend l'incident dangereux : **rien dans l'arbre ne le signale.** Un `git bisect`,
un `cherry-pick` de `0f4a5df9ca` seul, ou une relecture commit par commit
embarquent une régression de sécurité en silence.

## Les deux règles

> **1. Un agent qui mute l'arbre pour mesurer travaille dans SON worktree, pas
> dans le mien.** La mesure par mutation est une bonne méthode ; elle est
> incompatible avec une session qui commite en parallèle. `isolation:
> "worktree"` existe pour ça.
>
> **2. `git add -A` est une affirmation sur TOUT l'arbre.** Il déclare « ce que
> je vois est à moi ». Dès qu'autre chose écrit dans le même répertoire — un
> agent, un watcher, un build — c'est faux. Mettre en scène par CHEMIN, ou au
> minimum relire `git diff --cached --stat` avant de committer : un fichier
> inattendu dans la liste est l'alerte, et elle était là.

## Ce qui a bien marché, et qu'il faut garder

- **Le cliquet a fait son travail** : sous la mutation embarquée, 6 témoins
  tombent. La CI aurait rougi sur ce commit. Ce n'est pas le filet qui a manqué,
  c'est le regard — le commit a été poussé sans relire son `--stat`.
- **C'est l'auditeur qui a signalé l'incident, en tête de son rapport**, avant
  ses constats techniques. Un auditeur qui déclare ce qu'il a lui-même cassé
  vaut mieux qu'un auditeur qui rend un arbre propre sans rien dire.

## Le réflexe à prendre

Avant tout commit fait pendant qu'un agent tourne : `git diff --cached --stat`,
et **un fichier hors du périmètre du lot arrête le commit.** Le périmètre, on
l'écrit au moment de cadrer le lot — pas au moment de committer, où l'on voit ce
qu'on s'attend à voir.
