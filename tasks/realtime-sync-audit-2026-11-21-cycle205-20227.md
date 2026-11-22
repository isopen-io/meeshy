## Cycle 205 — un sens sur deux : le web appliquait le bannissement et jamais sa levée (#20227)

**Date** : 2026-11-21. **Base** : `dev` à `711e1cafc`. **Issue** : #20227.

### D'où vient ce lot

Constat de l'audit de la synchronisation des mutations du cycle 204, laissé
OUVERT dans son journal plutôt qu'improvisé dans son lot.

### Le défaut

La passerelle traite le bannissement et sa levée en SYMÉTRIE : les deux
événements partent vers la salle `user:<id>` du sujet, avec un effectif ABSOLU,
et la levée RE-REJOINT la cible à la room de conversation
(`participant-ban-core.ts`). iOS et Android appliquent les deux sens.

**Le web n'appliquait que le premier.** Mesuré :
`grep -rn "unbanned\|UNBANNED" apps/web/src` ⇒ **0 occurrence**.

| événement | passerelle | web avant | iOS | Android |
|---|---|---|---|---|
| `…participant-banned` | émis vers la cible | **appliqué** (`isMember: false`, détail ET liste) | oui | oui |
| `…participant-unbanned` | émis avec `membershipRestored` + effectif absolu | **RIEN** | oui | oui |

Alice débannie gardait donc `isMember: false` : plus de réponse, plus de
réaction, plus de « Supprimer pour moi », mentions ignorées, menu de rangée
restreint, exclue des candidats Talkie — **pendant que les messages
continuaient d'arriver en direct**, la passerelle l'ayant re-rejointe à la room.

Et rien ne guérissait seul. La liste se rafraîchit par un delta borné par
`Conversation.updatedAt` ; un débannissement n'écrit qu'un `participant.update`,
donc cette borne ne bouge pas, et seul le réconcilie complet de **15 minutes**
repeignait la ligne. Le détail, lui, ne porte pas de `staleTime` explicite : il
ne guérit qu'au prochain montage ou retour de focus — **un lecteur qui reste
dans le fil ouvert ne déclenche jamais rien.**

### Pourquoi personne ne l'a signalé, et c'est la leçon

> **Un applieur d'ANNULATION manquant ne ressemble pas à un défaut : il
> ressemble à la restriction qu'il devait lever.** Un utilisateur qui ne peut
> plus répondre après avoir été débanni a l'air… encore banni. Personne ne
> déclare ça comme un bug — on en conclut que la levée n'a pas été faite, ou
> qu'elle « met du temps ».

C'est ce qui distingue cette classe de la famille « jumelle » ordinaire : la
divergence ne se voit ni côté émetteur (la passerelle émet juste, et deux
clients sur trois appliquent), ni côté produit (le symptôme imite une règle qui
fonctionne). Le seul endroit où elle est visible est un `grep` du nom de
l'événement dans le client — et il faut avoir eu l'idée de le lancer.

### Le correctif

- `realtime-membership-ended.ts` devient **`realtime-membership.ts`** — il tient
  désormais l'appartenance du lecteur DANS LES DEUX SENS, et un module se nomme
  par ce qu'il fait. `viewerMembershipRestoredOf` réutilise la MÊME lecture
  d'identité et y ajoute la seule condition que le site d'émission impose.
- **`membershipRestored` gouverne le retour, jamais l'événement** : « le
  bannissement est levé dans tous les cas ; l'appartenance, non », dit le site
  d'émission. Lever le ban d'un ancien membre ne le fait pas rentrer. C'est le
  miroir exact de `membershipEnded: false` sur le bannissement.
- La liste se relit EN ENTIER (`requestFullConversationRead` +
  `relaunchConversationList`), comme `conversation:restored` — pour la raison
  mesurée ci-dessus : `Conversation.updatedAt` ne peut PAS porter ce changement.
- L'effectif : `'unbanned'` rejoint `MembershipChange`, et son repli de delta
  n'ajoute un membre que si la levée RESTAURE.
- Le trombinoscope ouvert invalide sa liste comme sur une arrivée : la cible
  redevient une ligne ACTIVE, donc la liste servie la porte de nouveau.

### La preuve

| mutation | témoin qui tombe |
|---|---|
| le `socket.on` du débannissement retiré | **3 rouges** (appartenance, effectif servi, repli de delta) |
| `membershipRestored` n'est plus exigé | **1 rouge** — « levée SANS restauration » |
| la branche `'unbanned'` du compteur retirée | **1 rouge** |

| gate | résultat |
|---|---|
| `src/lib/api/` + `src/lib/send/` + `src/lib/view/` | **9461 verts / 0 rouge** |
| `tsc --noEmit` (web) | **0** |

Le témoin passe par le VRAI consommateur (`deleteOfferOf` via
`menuViewerOf`/`menuConversationOf`), pas par le drapeau : ce qui compte est que
le GESTE revienne, pas qu'un booléen change — « suivre la donnée jusqu'au
PIXEL » (cycle 123).

**Quatre des cinq témoins d'appartenance passaient déjà** avant le correctif, et
il faut le dire : ce sont les cas NÉGATIFS (levée sans restauration,
débannissement d'un autre, charge illisible, connexion détruite). Sans applieur,
« rien ne se passe » est précisément ce qu'ils assertent — ce sont des **pièges
armés**, pas des preuves de rouge. Le seul qui prouvait le défaut est le cas
nominal.

### Ce que ce lot ne fait pas

Il ne touche pas **#20228** — `participant:rights-updated` n'a lui non plus
aucun consommateur web, et le commentaire de la passerelle qui en nomme un est
faux dans les DEUX sens (il affirme un consommateur web qui n'existe pas, et nie
un consommateur Android qui existe depuis le dégel du Kotlin). La règle de
lecture n'y est pas la même — une charge RÉDUITE dont il faut discriminer la
PRÉSENCE de clé, jamais recopier la valeur — et la mélanger ici ferait écrire le
mauvais applieur.
