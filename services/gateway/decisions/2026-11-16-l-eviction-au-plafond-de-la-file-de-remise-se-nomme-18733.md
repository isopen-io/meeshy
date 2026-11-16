## L'éviction au plafond de la file de remise se NOMME, sur les quatre chemins qui en détruisent

*2026-11-16 — #18733. Cycle 172 de la routine d'amélioration continue du temps réel.*

## Le constat

`DELIVERY_QUEUE_MAX_PER_USER` (500, tranche Redis) et `MEMORY_QUEUE_MAX_PER_USER`
(50, repli mémoire) bornent la file hors ligne par destinataire. Au-delà, les
arrivées les plus anciennes sont **détruites**, et leur rejeu n'aura jamais lieu.

Trois issues nomment ce plafond comme la cause d'un défaut VISIBLE par
l'utilisateur, chacune en insistant sur le fait qu'il **n'exige aucune panne** :
#18614 (« rien à diagnostiquer — pas d'exception, pas de log, juste une coche qui
dit remis »), #18701 (son scénario de tête est une éviction par `LTRIM`) et
#18707. Aucune n'a pu dire à quelle fréquence il est franchi en production :
personne ne pouvait le savoir.

L'asymétrie était le point. Tout le reste du chemin d'enfilage se journalise —
dédoublonnage (`debug`), supplantation (`debug`), repli mémoire (`warn`), map
mémoire pleine (`warn`), entrée informe (`error`) — et le seul événement qui
DÉTRUIT du rejeu, sur le chemin de PRODUCTION, était muet. La map pleine, qui
n'affecte que le repli, avertissait ; le plafond par destinataire, non.

## Ce qui est décidé

**1. La mesure voyage comme un SECOND élément de retour, jamais comme une
quatrième valeur de code.** `ENQUEUE_DEDUP_LUA` rend désormais
`{code, lengthAfterPush}` et `RESTORE_LUA` rend `{restored, lengthAfterPush}`.
`1` doit continuer de vouloir dire « poussée » quelle que soit l'éviction : une
quatrième valeur (« poussée AVEC éviction ») aurait obligé chaque lecteur présent
et futur à connaître deux façons de dire la même chose.

**2. La mesure ne coûte aucune commande.** `RPUSH` et `LPUSH` rendent déjà la
longueur de la liste après leur poussée ; il suffisait de la capturer. C'est ce
qui rend la décision gratuite sur le chemin le plus chaud du produit — l'enfilage
par destinataire hors ligne — et c'est pourquoi aucune autre forme (un `LLEN`
après coup, un compteur séparé) n'a été retenue.

**3. L'arithmétique vit en TypeScript, pas en Lua** (`services/deliveryQueueBound.ts`,
`destroyedAtBound` + `readBoundedPushReply`). Le dépôt n'a aucun double capable
d'exécuter du Lua — la tranche Redis ne s'atteste que par les arguments reçus et
le texte du script. Le script TRANSPORTE une longueur ; décider ce qu'elle
implique est une décision, et une décision se teste.

**4. `lengthAfterPush === 0` dit « je n'ai pas mesuré », jamais « la file est
vide ».** C'est ce qui empêche d'ANNONCER une éviction qu'on n'a pas observée :
les deux branches sans `LTRIM` (dédoublonnage, supplantation) rendent 0, et
**tout** retour qui ne porte pas la longueur — l'entier nu d'avant ce lot, que
rendent tous les doubles du dépôt — rend 0 aussi. Un chiffre de perte qui servira
un jour à instruire la valeur du plafond ne doit jamais être inventé.

**5. Un site unique nomme l'éviction, et les QUATRE chemins qui en détruisent y
passent.** `RedisDeliveryQueue.noteBoundEviction(scope, slice, …)` : enfilage
Redis, enfilage mémoire, **remise Redis** et **remise mémoire**. Les deux
derniers ne sont pas dans l'issue — ce sont la JUMELLE, trouvée en posant la
question au moment du correctif : le `LTRIM` de l'enfilage n'est pas le seul du
fichier. La remise (#12822, M3) borne de la même façon les entrées scellées qu'un
drain n'a pas pu rouvrir, détruit le même rejeu, dans le même silence, et son
`LPUSH` rend déjà la longueur.

`destroyed <= 0 ⇒ silence` est tenu **une fois**, dans ce site : le chemin
nominal est le plus chaud du produit, et une trace par enfilage serait pire que
le silence qu'on vient de retirer.

## Ce que la décision NE tranche PAS

- **La valeur 500, ni la politique d'éviction.** Les deux sont raisonnées et
  documentées (`DELIVERY_QUEUE_MAX_PER_USER` énumère les trois coûts qu'elles
  bornent). Cette décision rend seulement possible, un jour, d'instruire la
  première question — dont la réponse exige une mesure de production, qui n'existe
  pas encore.
- **Le trou d'écriture du curseur de livraison** (#18731, ouvert) : une arrivée
  évincée est INVISIBLE au drain, donc indéduisible de ce que le drain a refusé.
  Ce lot la rend visible dans le JOURNAL, pas dans le curseur.
- **Aucun compteur, aucune métrique.** La trace est un `logger.warn` structuré
  (`scope`, `slice`, `userId`, `destroyed`, `cap`). Agréger est un autre lot, et
  il n'a de sens qu'avec un collecteur.

## Le chemin que ce lot a rendu mesurable, et que personne n'avait nommé

Le pire des quatre n'était dans aucune issue : **Redis DRAINE puis sa remise
ÉCHOUE.** Le repli mémoire reçoit alors jusqu'à 500 entrées scellées — la borne
de la tranche Redis — dans une tranche qui en garde 50 : une panne passagère sur
la remise détruisait jusqu'à 450 entrées en silence, à l'instant précis où le
drain venait de les retirer de Redis. Et `slice(-50)` garde les DERNIÈRES, donc
ce qui part est pris en tête : **la remise détruit exactement ce qu'elle remet.**

## Preuve

`src/__tests__/unit/services/deliveryQueueBoundEviction.test.ts` — 14 témoins.
Les quatre chemins nommés, les deux silences (sous le plafond, et sur une forme
qui ne porte pas la longueur), le texte des deux scripts, l'arithmétique.
Six mutations prouvées rouges, une par site et une par règle.
