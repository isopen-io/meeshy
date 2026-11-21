## Avant de rendre DÉTERMINISTE ce qui était aléatoire, chercher ce que l'aléa faisait PASSER

**Date** : 2026-11-21. **Lot** : #20223 (cycle 204 de la routine temps réel).
**Famille** : « une panne peut tenir la porte, et la réparer l'ouvre »
(cycle 84 / `services/gateway/CLAUDE.md`), dont c'est la variante d'ORDRE et non
de visibilité.

**Le constat**

La file d'envois de `apps/web` portait deux défauts, et ils étaient NOUÉS.

1. L'ordre FIFO se lisait sur `entry.startedAt` — « l'horloge de la tentative
   COURANTE » par sa propre documentation — que `markPending` réécrit à chaque
   rejeu. Un premier rejeu qui échoue renvoyait donc son entrée en FIN de file,
   et le message composé APRÈS partait AVANT, définitivement.
2. Un refus frappé LOCALEMENT (conversation scellée, pièces introuvables) porte
   `status: 0`, donc passait pour « n'a jamais atteint le serveur, rejoue-la ».
   `replay` s'arrêtait dessus et abandonnait toute la file.

**Le défaut 1 MASQUAIT le défaut 2.** Le rejeu du bloqueur réécrivait son
horloge, donc le renvoyait en dernier à la vidange suivante : les envois
derrière lui finissaient par passer. **C'était le désordre qui débloquait la
file.**

Corriger l'ordre SEUL — le correctif évident, celui que le symptôme visible
réclame — aurait figé le bloqueur en tête pour toujours et transformé un
blocage intermittent en blocage PERMANENT. Mesuré : sous la seule mutation du
second correctif, clé stable en place, le message derrière le bloqueur ne part
jamais.

**La règle**

Un comportement aléatoire, instable ou désordonné peut être le seul mécanisme
qui fait avancer un système autour d'un second défaut. Le stabiliser retire ce
mécanisme sans retirer le défaut.

La question à poser à tout correctif qui rend déterministe un ordre, une clé, un
tri, une file ou un choix n'est donc pas seulement *« l'ordre est-il juste
maintenant ? »* mais **« qu'est-ce que l'ancien désordre faisait passer, et qui
le fera passer après moi ? »**.

Elle se répond en suivant le chemin NOMINAL sous la nouvelle règle, pas en
relisant le correctif : c'est l'entrée de tête, celle qui ne bougera plus, qu'il
faut interroger. Et quand la réponse est « rien ne le fera passer », les deux
moitiés sont un SEUL lot — les livrer séparément publie une régression entre les
deux.

**Le corollaire de forme**

Une classe de rejeu se resserre par une **LISTE BLANCHE** de formes nommées,
jamais par une heuristique sur le texte ou par la seule valeur qui lui sert de
véhicule : `status: 0` veut dire « aucune réponse HTTP », ce qui est VRAI d'une
coupure comme d'un refus local, et seules les secondes portent un code. Un
témoin garde explicitement le bord conservé (« une coupure reste rejouable »),
sans quoi le resserrement casse la durabilité qu'il prétend servir.
