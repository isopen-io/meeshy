## Un applieur d'ANNULATION manquant imite la restriction qu'il devait lever

**Date** : 2026-11-21. **Lot** : #20227 (cycle 205 de la routine temps réel).
**Famille** : « cette entité a-t-elle une JUMELLE ? » (cycle 85) et « la jumelle
a-t-elle un DÉCLENCHEUR que je n'ai pas ? » (#20224) — ici la jumelle est un
SENS, pas un site ni un déclencheur.

**Le constat**

La passerelle traite le bannissement et sa levée en symétrie : les deux
événements partent vers la salle personnelle du sujet, avec un effectif absolu,
et la levée re-rejoint la cible à la room. iOS et Android appliquent les deux.
Le web appliquait le premier et **rien** pour le second — zéro occurrence de
« unbanned » dans `apps/web/src`.

Un membre débanni gardait donc `isMember: false` : plus de réponse, plus de
réaction, plus de « Supprimer pour moi », mentions ignorées — pendant que les
messages continuaient d'arriver en direct.

**La règle**

Un applieur d'annulation absent ne produit pas un symptôme qui ressemble à un
bug. Il produit **exactement l'apparence de la restriction qu'il devait lever** :
l'utilisateur débanni a l'air encore banni. Personne ne le déclare — on en
conclut que la levée n'a pas été faite, ou qu'« elle met du temps ».

C'est ce qui rend cette classe plus durable que la divergence de jumelle
ordinaire. La divergence ne se voit :

- **ni côté émetteur** — la passerelle émet correctement, et deux clients sur
  trois appliquent, donc aucun témoin serveur ne rougit ;
- **ni côté produit** — le symptôme imite une règle qui fonctionne ;
- **ni dans une revue de diff** — il n'y a pas de code fautif à lire, il manque
  un `socket.on`.

D'où la question, à poser pour toute paire faire/défaire (bannir/débannir,
épingler/désépingler, archiver/désarchiver, bloquer/débloquer,
masquer/restaurer) : **les deux sens ont-ils un consommateur, sur CHAQUE
client ?** — elle ne se répond pas en lisant le code.

**Et elle est DÉJÀ OUTILLÉE : ne pas la reposer à la main.**
`packages/shared/__tests__/ci/socket-event-platform-parity-gate.test.ts`
(#18342, cycle 161) inventorie, pour chaque événement du contrat, quelle
plateforme ne le CITE pas — c'est exactement cette mesure, en cliquet à deux
sens depuis des cycles. La première version de cette leçon affirmait que « le
seul endroit où la divergence est visible est un `grep` par client » : **c'est
faux, et c'est la faute la plus coûteuse de ce lot** — j'ai redécouvert à la
main une classe que le dépôt mesure en continu, au lieu de lire son inventaire
d'abord.

Conséquence directe, et elle s'est produite : **le cliquet est tombé sur mon
propre lot, et quelqu'un d'autre a dû le relever.** Faire lire un événement à une
plateforme l'oblige à SORTIR de l'inventaire, et retirer cette ligne fait partie
du correctif — la règle est écrite dans le cliquet lui-même (« un événement qui
gagne son troisième lecteur doit SORTIR de l'inventaire »). Je ne l'ai pas fait ;
le commit `0111884c9` l'a fait après moi.

> **Avant de chercher une divergence entre clients, chercher le cliquet qui la
> mesure.** Et quand on en répare une, demander *quel inventaire devient faux
> parce que je viens de la réparer ?* — un cliquet à deux sens rougit aussi sur
> le progrès.

**Et l'inventaire porte une position produit qu'il faut lire avant de qualifier
un défaut** : pour la famille `absents: ['web']`, il dit « `apps/web` suit
l'interface iOS (directive porteur 2026-09-07) … **aucun n'est un défaut en
soi** ; la liste ne doit que rétrécir ». Une absence web inventoriée est donc
une feature NON PORTÉE, pas un bug — le débannissement ne faisait exception que
parce que son ALLER était porté, ce qui rend l'absence du RETOUR
contradictoire, et visible comme une restriction qui s'applique encore.

**Les deux corollaires de forme**

- **Le champ qui QUALIFIE l'annulation la gouverne, jamais l'événement.** « Le
  bannissement est levé dans tous les cas ; l'appartenance, non » : c'est
  `membershipRestored` qui décide, miroir exact de `membershipEnded: false` sur
  l'aller. Appliquer sur le NOM de l'événement ferait rentrer un ancien membre
  dans une conversation qu'il a quittée.
- **Une annulation que la borne de rafraîchissement ne porte pas exige une
  relecture ENTIÈRE.** Ici le delta de liste est borné par
  `Conversation.updatedAt`, qu'un `participant.update` ne touche pas : sans
  relecture explicite, seul le réconcilie de 15 minutes repeignait la ligne.
  Avant de se reposer sur « ça guérira au prochain rafraîchissement »,
  **vérifier que la borne de ce rafraîchissement bouge.**
