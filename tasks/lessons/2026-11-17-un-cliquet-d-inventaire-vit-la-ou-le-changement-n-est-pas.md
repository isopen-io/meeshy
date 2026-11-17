## 2026-11-17 — Un cliquet d'INVENTAIRE vit là où le changement n'est pas

*Routine messagerie temps réel, cycle 174, #18731. Coût mesuré : `dev` rouge
après fusion, sur un lot par ailleurs prouvé.*

Le lot de #18731 touchait `services/MessageReadStatusService.ts` et
`socketio/MeeshySocketIOManager.ts`. Les gates joués avant la PR ont donc été
choisis par PROXIMITÉ : `src/__tests__/unit/services` (686 suites),
`src/__tests__/unit/utils/read-exactness`, `src/socketio` et
`src/__tests__/unit/socketio` — 12 634 + 3 660 témoins verts, `tsc` EXIT=0.

Deux cliquets ont rougi en CI, et **tous les deux vivent dans
`src/__tests__/unit/routes/`** — un répertoire que le lot ne touche pas, ne cite
pas, et dont rien ne suggérait la pertinence :

| cliquet | ce qu'il a dit |
|---|---|
| `orphaned-sender-repair-surface-guard` | `MessageReadStatusService.ts : déclaré 10, trouvé 11` |
| `personal-history-hiding-surface-guard` | `MessageReadStatusService.ts : 4 lectures, 0 applications` |

La raison est structurelle, et c'est elle qu'il faut retenir : **ces cliquets ne
testent pas un module, ils tiennent un INVENTAIRE du dépôt, indexé par chemin de
fichier.** Ils balaient `src/services/` et `src/routes/` depuis
`src/__tests__/unit/routes/`. Ajouter une requête Prisma — n'importe où — les
fait rougir. Aucune heuristique de voisinage ne peut les trouver : leur
emplacement est sans rapport avec ce qu'ils gardent.

> **La question à poser avant de choisir ses gates n'est pas « où vit mon
> changement ? » mais « qui LIT mon fichier ? »** — et pour un cliquet
> d'inventaire la réponse est : un test qui ne le mentionne qu'en tant que CLÉ
> d'un dictionnaire, donc invisible à toute recherche de symbole.

Le remède est écrit dans le `CLAUDE.md` racine depuis toujours, et je ne l'ai pas
suivi : § « Local Test Parity (bun) » donne la commande qui mesure ce que la CI
mesure — `cd services/gateway && bun run test:coverage`, la suite ENTIÈRE. J'ai
substitué une sélection par répertoire pour gagner du temps, et le temps gagné a
été payé par un `dev` rouge et un second lot de réparation.

**Une sélection de gates est une AFFIRMATION** (« ceci couvre mon changement »),
de la même famille qu'un compte, un tri ou un commentaire de contrainte. Elle se
mesure contre ce que la CI lance, jamais contre l'intuition de voisinage. Pour un
dépôt qui porte des cliquets transverses — et celui-ci en porte beaucoup : portes
d'émission, schémas de réponse, promesses détachées, surfaces de lecture,
registres de routes — **une sélection par répertoire ne peut pas être
suffisante, par construction.**

### Corollaire — le cliquet avait une QUESTION, pas seulement un nombre

Réparer n'était pas bumper le compteur. `personal-history-hiding` classe chaque
surface (`applies` / `exempt` + raison) parce que sa valeur est de forcer la
question : *cette nouvelle lecture doit-elle masquer ce que le lecteur a
effacé ?*

Pour le balayage de contiguïté, la réponse est **non**, et elle était à instruire
plutôt qu'à deviner : le masquage personnel dit ce qu'un lecteur a le droit de
VOIR, le préfixe de livraison dit ce qui a ATTEINT son appareil. Appliquer le
filtre aurait été faux dans le sens le plus coûteux — un message JAMAIS REMIS,
puis masqué par un effacement d'historique, sortirait de la fenêtre et laisserait
le curseur **sauter par-dessus lui**, rouvrant exactement le trou que le lot
venait de fermer.

Un cliquet d'inventaire qui ne demandait qu'un nombre aurait accepté le bump.
Celui-ci demandait une CLASSIFICATION, et c'est ce qui a rendu la réponse
vérifiable.
