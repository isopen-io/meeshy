## Leçon 191 — une règle peut avoir tous ses consommateurs et aucun déclencheur, et c'est la forme la plus difficile à voir (2026-08-15, routine temps réel, cycle 40)

**Le fait.** Le masquage personnel (« supprimer pour moi », « effacer
l'historique ») était appliqué sur les quatre surfaces qui LISENT, y compris la
plus récente et la plus subtile — le fan-out temps réel de l'aperçu de ligne de
liste, avec son module dédié, ses tests, et un en-tête qui décrit exactement le
défaut qu'il corrige. Il manquait la seule chose qu'aucune relecture du module ne
peut révéler : **le geste qui crée le masquage ne l'appelait pas**. Ses trois
appelants étaient l'édition, la suppression pour tous, la traduction qui
atterrit. La ligne de liste se corrigeait donc à toute mutation SAUF à celle qui
la rend fausse.

**Pourquoi c'est invisible.** Une règle sans implémentation se voit (il n'y a
rien à lire). Une règle avec une implémentation FAUSSE se voit (un test la
prend). Une règle juste, testée, soignée, et branchée à trois appelants sur
quatre ne se voit pas : tout audit qui demande « le masquage personnel est-il
appliqué à l'aperçu ? » tombe sur le module, lit son en-tête, et conclut oui.
*La question qui démasque n'est jamais « cette règle est-elle juste ? » mais
« quels gestes la déclenchent — et lesquels devraient ? ».* Même famille que la
leçon du canal d'annonces (`checkPermissions` juste, testé, et sans un seul
appelant de production), à ceci près qu'ici il y avait des appelants : juste pas
celui-là. La variante partielle est plus dure que la variante totale, parce
qu'un `grep` des appelants rend une liste non vide.

**Le signal à chercher.** Énumérer les ÉCRIVAINS d'un état, pas les lecteurs.
Ici : quatre routes écrivent une des deux tables de masquage, zéro
rafraîchissait la ligne. Le tableau écrivains × obligations est ce qui rend le
trou visible ; la lecture du module ne le rendra jamais.

**Le double de test qui garantissait le silence.** Les deux suites couvrant ces
routes déclaraient un prisma incomplet (`participant.findMany` absent). Or
l'émetteur d'aperçu est un canal best-effort qui AVALE ses propres pannes : un
double incomplet le rend muet, et un témoin écrit dessus reste vert sur une
version qui n'appelle rien. *Face à un collaborateur qui avale ses erreurs, un
double incomplet ne distingue pas « n'a pas été appelé » de « a échoué en
silence » — et c'est très exactement la distinction que le témoin existe pour
faire.* Compléter le double fait partie du correctif, pas de l'hygiène.

**La garde d'audience qui doit s'écrire en même temps.** Rafraîchir la ligne au
moment du masquage tente le fan-out complet — c'est ce que fait déjà la fonction
appelée. Mais un masquage personnel ne change la ligne QUE de son auteur : le
dernier message global n'a pas bougé d'un octet, donc chaque autre participant
recevrait un payload identique à l'octet près, un événement chacun, par geste.
La borne d'audience n'est pas une optimisation ajoutée après coup ; elle est ce
qui distingue « corriger une ligne » de « re-diffuser une conversation ».

**Le corollaire, et la moitié qu'on ne livre pas.** Un correctif serveur peut
être juste et rester INERTE chez un client. Ici iOS jette tout aperçu dont le
`lastMessageAt` recule (garde monotone conçue contre le désordre) — ce qui frappe
déjà, avant ce cycle, la suppression POUR TOUS du dernier message. Deux réflexes
à refuser : renoncer au correctif serveur (sans l'événement, même un client qui
l'accepterait n'aurait rien à appliquer), et retirer `lastMessageAt` du payload
pour passer sous la garde (on remplacerait un aperçu périmé par un TRI périmé).
*Quand la moitié client n'est pas livrable depuis l'environnement courant, la
livrer quand même par un contournement de payload est le pire des trois choix :
il rend le symptôme invisible et laisse la cause côté client, où plus personne ne
la cherchera.*
