## Cycle 79 — Un lecteur branché dont l'écriture ne porte sur rien

Troisième forme de la famille ouverte au 77-bis, et la seule des trois qu'aucun
`grep` ne trouve.

| cycle | forme | comment on la voit |
|---|---|---|
| 77-bis | un état d'interface avec un lecteur et **aucun écrivain** | `grep` « qui écrit ça ? » |
| 78 | un producteur alimenté et **aucun lecteur** | `grep` « qui s'y abonne ? » |
| **79** | un lecteur branché, qui s'exécute, **et dont l'écriture ne porte sur rien** | aucun `grep` |

Le web recevait `conversation:participant-unbanned`, le handler existait, il
s'exécutait, et son corps entier se résumait à réécrire un effectif de membres
sur une ligne de liste — celle que le bannissement venait d'en retirer. Le `map`
ne trouvait rien, le cache ressortait identique, aucune erreur n'était levée.

> **Un abonnement qui s'exécute n'est pas un abonnement qui agit.** Les deux
> bouts sont là, le fil est complet, et seule la coïncidence entre ce que le
> handler ÉCRIT et ce que le cache CONTIENT à cet instant décide s'il se passe
> quelque chose. Un handler dont tout le corps est un `map`/`update` sur une
> collection qu'un handler VOISIN sait vider est un no-op en puissance.

Et le corollaire opératoire, qui est la vraie sortie du cycle :

> **Prendre les transitions d'un même domaine et vérifier qu'elles forment une
> grille CLOSE — montantes et descendantes appariées.** « On m'ajoute / je pars /
> on me retire / on me bannit / on me débannit » : les quatre premières
> retiraient ou posaient la ligne, la cinquième ne faisait rien. La grille se
> lit en trente secondes et se relit à chaque ajout de transition ; c'est le
> geste qui manquait, pas une garde.

Trois raisons rendaient le défaut durable, et ce sont trois propriétés de
CONCEPTION, pas des accidents :

1. `staleTime: Infinity` — le cache ne relit jamais de lui-même ;
2. le delta borné est **upsert-only sur `Conversation.updatedAt`**, et une levée
   de bannissement écrit une ligne `Participant` : elle ne fait bouger aucun
   watermark, donc elle n'apparaît dans aucune réponse `updatedSince=` ;
3. la réconciliation complète tourne une fois par 24 h.

> **Quand la source de vérité est le temps réel, un événement raté n'est pas un
> retard : c'est un état faux qui tient jusqu'au prochain filet.** Avant de
> juger un no-op bénin, chercher QUI le rattrape et EN COMBIEN DE TEMPS. Ici :
> personne, et 24 heures.

Enfin, la note qui a coûté le plus de temps sur ce cycle, et qui n'est pas dans
la production :

> **Un QueryClient de test à `gcTime: 0` ramasse une entrée posée par
> `setQueryData` dès le tick suivant** — elle est donc `undefined` après le
> moindre `await`, et le témoin échoue pour la mauvaise raison (« cannot read
> properties of undefined »), ce qui ressemble à un défaut de production. Un
> témoin ASYNCHRONE qui lit le cache monte son propre client.

---
