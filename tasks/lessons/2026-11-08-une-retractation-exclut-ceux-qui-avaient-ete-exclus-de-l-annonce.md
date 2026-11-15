## Une RÉTRACTATION exclut ceux qui avaient été exclus de l'ANNONCE — et personne de plus (cycle 144)

Un signal de salon a deux moments : il ANNONCE un état (`viewing:start`,
`location:live-started`, `location:live-updated`) puis il le RÉTRACTE
(`viewing:stop`, `location:live-stopped`). Qu'il faille filtrer le blocage à
l'annonce est la partie évidente, et c'est ce que demandaient #16745 et #16752.

Le réflexe, pour la rétractation, est de rejouer la même garde : relire le
blocage, exclure l'ensemble FRAIS. Les deux issues le proposaient ainsi. C'est
faux dans les deux sens à la fois.

**L'ensemble frais exclut TROP.** Un pair bloqué *après* l'annonce a reçu
l'annonce : son interface porte le point « ici », ou l'épingle de la position en
direct. Le retirer du retrait laisse ce point allumé — et pour la position,
c'est une coordonnée GPS RÉELLE, figée, d'apparence vivante, jusqu'à huit
heures. **On protégerait le blocage en publiant plus longtemps ce qu'il doit
cacher.**

**Et relire ouvre la seule porte par laquelle un fail-open peut entrer.** Sur le
regard, `blockRelatedOf` rendait un `Set` VIDE sur une levée — et un ensemble
vide ne se lit pas « je ne sais pas », il se lit « personne à exclure ». C'est
ce qui publiait la liste nominative des spectateurs aux pairs bloqués pendant
une bascule de réplique.

> **Une rétractation exclut exactement ceux qui avaient été exclus de
> l'annonce.** Cette formulation est plus FORTE que « relire fraîchement », et
> strictement moins chère.

Trois raisons, toutes mesurées dans le lot :

1. **L'ensemble voulu est déjà RETENU** — `SocketViewing.blockRelated` écrit par
   un `start` fail-closed, `LiveLocationSession.blockRelated` écrit au départ.
   Les deux sont des ensembles PROUVÉS, pas des caches d'une colonne.
2. **Aucune lecture ⇒ aucun fail-open possible.** Le défaut se ferme par
   CONSTRUCTION, et non par un test de `null` qu'un site futur pourrait oublier.
3. **Deux requêtes de moins par rétractation**, et `_broadcastStopped` redevient
   tenable là où il est appelé : `handleSocketDisconnecting` est synchrone à
   dessein — dernière fenêtre où le socket est encore dans ses rooms — et une
   seule `await` suffirait à laisser la diffusion partir après la sortie.

**Le nom du champ porte la règle.** Il ne s'appelle donc pas « le cache du
blocage » : son doc-comment dit ce qu'il EST — *l'ensemble des pairs qui n'ont
rien reçu*, sans épingle, sans point. Un nom qui annonce un cache invite à le
rafraîchir ; un nom qui annonce un invariant invite à le TENIR.

**Et tenir cet invariant a un corollaire qu'un cache n'aurait pas eu.** Quand un
rafraîchissement DÉCOUVRE un pair entré dans l'ensemble en cours de route, il
faut lui envoyer une rétractation CIBLÉE. Cesser de lui parler ne suffit pas :
c'est ce geste, et lui seul, qui retire ce qu'il a déjà reçu — et c'est lui qui
rend l'exclusion du retrait exacte. Corollaire du corollaire, trouvé en relisant
le lot : la minuterie d'expiration doit RELIRE le registre et non diffuser
depuis la session qu'elle a capturée huit heures plus tôt.

La question à poser devant tout filtre de confidentialité posé sur un signal
temps réel :

> **Ce signal ANNONCE-t-il ou RÉTRACTE-t-il ?** Si l'audience des deux n'est pas
> le MÊME ensemble, l'un des deux laisse quelque chose à l'écran.

Et sa jumelle, qui est la forme générale du cycle 127 : un verdict de garde a
trois états, et le `unknown` s'arbitre par **ce qui est en jeu** — fermé quand
c'est un secret qui part, ouvert quand c'est une livraison. Une rétractation
n'est ni l'un ni l'autre : c'est le RETRAIT d'un secret, et sa posture est donc
l'inverse de celle de l'annonce qu'elle annule.
