## Un résumé décrit UN message, pas une ÉPOQUE — et un état terminal gravé à tort ne guérit jamais (2026-10-02, #7433)

Le porteur voyait des coches violettes « Lu » sur iOS pour des messages jamais
ouverts, et la fiche « Vu par » le démentait. Les deux réducteurs iOS de
`read-status:updated` appliquaient le résumé à TOUT message envoyé avant
`event.updatedAt`. Or `updatedAt` est l'instant d'ÉMISSION de l'événement, et le
résumé ne décrit qu'UN message : celui qu'il nomme, ou le dernier du fil, dont
l'auteur peut être le pair. La lecture d'un seul message passait le fil entier en
violet, et les compteurs « moi j'ai lu ton message » peignaient mes propres bulles.

Trois règles en sortent :

1. **Une donnée qui décrit UN objet ne s'étale pas sur une plage.** Une
   « frontière temporelle » transforme « X a été lu » en « tout ce qui précède
   maintenant a été lu ». Avant d'appliquer un événement à plusieurs lignes,
   demander : *l'émetteur affirme-t-il quelque chose de chacune d'elles ?*
2. **Un champ décodé et non lu est une dette qui MORD.** `summary.messageId` était
   décodé depuis G-5, et son doc-comment disait même que personne ne le lisait. La
   dette était consignée, pas soldée, pendant que la fonctionnalité mentait à
   l'écran.
3. **Un état TERMINAL fabriqué localement doit pouvoir être défait par la source
   d'autorité.** `state = .read` et `readByAllAt` étaient gravés par le temps réel,
   et le REST les fusionnait en `max(…)` / `api ?? existant`. Les compteurs serveur
   justes arrivaient à chaque rafraîchissement sans rien corriger. Un correctif de
   cause ne suffit pas : il faut aussi que la source d'autorité guérisse ce que
   l'ancien code a déjà écrit.
