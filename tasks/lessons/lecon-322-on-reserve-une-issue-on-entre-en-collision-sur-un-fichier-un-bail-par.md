## Leçon 322 — On réserve une ISSUE, on entre en collision sur un FICHIER : un bail par issue ne verrouille rien

**Contexte.** Le 2026-08-29T17:40Z, une session distante réserve #4284 (« aucun
fichier de routes ne dépasse son budget ») et lance trois agents pour découper
`conversations/messages.ts`, `conversations/core.ts` et
`conversations/messages-advanced.ts`. Cinquante-cinq minutes plus tôt, une AUTRE
session avait livré `16420a92` (#4188) — qui ampute `messages-advanced.ts` de 346
lignes et `messages.ts` de 94. Deux issues, deux milestones, aucun lien visible,
et les deux mêmes fichiers. Les deux sessions avaient chacune un bail valide.

**Ce que ça coûte.** Un découpage de 2940 lignes lancé sur un fichier qu'une autre
session réécrit ne produit pas un conflit de trois lignes : il produit un conflit
sur le fichier ENTIER, et personne ne peut arbitrer un rebase où les deux côtés
ont raison. Ici le lot a été arrêté avant la première écriture — coût : le temps
de lecture de trois agents. Une minute de plus et c'était la journée des deux
sessions.

**Les trois défauts, et ils sont indépendants.**

1. **Le verrou n'était pas actionnable par tous.** `Status = In Progress` vit dans
   Projects v2, servi uniquement en GraphQL ; une session distante n'a droit qu'à
   un jeu épinglé d'opérations de revue de PR. Elle ne peut donc pas poser le
   statut sur lequel toute la procédure s'appuie — elle se rabat sur un
   commentaire, qui ANNONCE sans BLOQUER.
   → *Une procédure dont le verrou n'est pas actionnable par tous ses participants
   n'a pas de verrou : elle a une convention.* Poser le bail là où tout le monde
   écrit (REST), et DIRE qu'on n'a pas pu poser le statut plutôt que de faire
   comme si.

2. **L'unité de réservation n'était pas l'unité de collision.** Un numéro d'issue
   ne dit rien des fichiers qu'elle va toucher. Toute réservation doit énoncer les
   CHEMINS qu'on va écrire — un répertoire avec `/**` — sinon elle n'oppose rien à
   personne.

3. **Rien ne consultait git.** Le tableau et les commentaires disent ce que les
   autres ont ANNONCÉ ; git dit ce qu'ils ont FAIT, et il est déjà synchronisé
   entre toutes les sessions. Une ligne suffisait :
   `git log --since="2 hours ago" --oneline origin/dev -- <chemin>`.

**La règle.** Avant la première ligne écrite : bail avec CHEMINS, puis `git fetch`
puis `log --since` sur ces chemins et `log --grep "#n"` pour vérifier que l'issue
n'est pas déjà livrée. Un fichier touché par une autre session dans les deux
dernières heures n'est PAS libre, quel que soit l'état de son issue. Et la
fenêtre résiduelle — entre lire les baux et poser le sien — se referme en
rejouant le `log --since` juste AVANT de lancer les agents.

**Le corollaire de prudence, qui vaut mieux que les trois règles.** *Quand deux
lots se disputent un fichier, celui qui n'a rien écrit cède.* L'asymétrie est
énorme et elle est connue d'avance : un lot arrêté avant sa première écriture ne
coûte que de la lecture.

*(Voisine de la leçon 320 — pousser sur une branche partagée ce qu'on ne peut pas
compiler — même famille : ce qui est cher dans un dépôt partagé n'est pas l'erreur,
c'est le fait qu'elle se paie chez les autres.)*

---
