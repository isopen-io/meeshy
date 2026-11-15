## Leçon 190 — deux sessions de la même routine peuvent instruire le même défaut en parallèle (2026-08-15, routine temps réel, cycle 39)

**Le constat.** La piste laissée en clôture du cycle 37 a été reprise par DEUX
sessions, à une heure d'intervalle, sans que ni l'une ni l'autre ne le sache.
Même défaut, mêmes 5 témoins rouges, mêmes gardes anti-sur-correction, et jusqu'au
même nom de fichier d'audit (`…-cycle38.md`). L'une a mergé (PR #3052) ; l'autre
a ouvert sa PR une heure trop tard, sur un défaut déjà réparé.

**La cause.** Une piste écrite dans `tasks/` est lisible par tous et
réservable par personne. La session B a lu `main` au DÉMARRAGE — la branche était
alors identique à `origin/main` — puis a travaillé pendant une heure sans le
relire. Entre les deux, le correctif de la session A est entré.

**La règle qui en sort.** `git fetch` au démarrage ne dit rien sur un cycle qui
dure plus longtemps qu'un cycle voisin. **Refaire la lecture AVANT d'ouvrir la
PR, et sur les FICHIERS visés, pas seulement sur le graphe des commits** — un
`git log origin/main -- <les 2 fichiers que je modifie>` aurait rendu le doublon
visible en une commande, là où `git rev-list --count` ne montrait que « 2 commits
d'avance » d'apparence anodine (c'étaient des commits Android).

**Ce qu'il ne faut PAS en conclure.** Que le travail était perdu. Le correctif
oui — mais l'instruire une seconde fois de façon indépendante a produit quelque
chose que la première passe n'avait pas : le **bout resté ouvert**. En rendant
`payload.userId` nul pour un invité, le correctif A a rendu inapplicable, pour
cette population, le contrat qui disait comment revendiquer `lastReadAt` /
`unreadCount`. Une relecture qui cherche « ce défaut est-il réparé ? » répond oui
et s'arrête ; une seconde instruction complète, elle, arrive sur ce bord et le
voit. *Un doublon n'est stérile que si on le jette en entier.*

**Le corollaire sur le sunk cost, et il compte autant.** Ce cycle avait produit
une unité nommée, testée, défendable — `resolveBroadcastActor` — pour une règle
que `main` écrit désormais à la main sur 4 sites, ce que le README du dépôt
interdit pour la règle SŒUR. Elle a quand même été RETIRÉE : la session A avait
typé le paramètre `actorUserId: string | null`, et **ce type ferme le trou que
l'unité aurait fermé**. Extraire un ternaire d'une ligne de code mergé une heure
plus tôt, commenté à chaque site, c'est du brassage pour un gain déjà acquis
autrement. *Une duplication n'est pas un défaut en soi : elle l'est quand elle
laisse passer l'erreur qu'elle répète.* Livrer le travail parce qu'il existe est
la mauvaise raison de le livrer.
