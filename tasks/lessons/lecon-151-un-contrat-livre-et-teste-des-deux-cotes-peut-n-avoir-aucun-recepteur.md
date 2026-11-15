## Leçon 151 — Un contrat livré et testé des DEUX côtés peut n'avoir aucun récepteur sur une plateforme

**Contexte** : cycle 114. Le delta `GET /conversations?updatedSince=` est upsert-only : sa clause
serveur exige une conversation active et un participant actif sans `deletedForMe`, donc une
conversation qui SORT de la vue (fermée, quittée, bannie, supprimée-pour-moi depuis un autre
appareil) ne revient dans aucune page. Le gateway l'avait compris et livre ces disparitions hors
page — `meta.deletedConversationIds`, un module dédié (`utils/delta-tombstones.ts`), une posture
d'échec pensée, des tests. Le web les consomme, avec ses propres tests. Tout le contrat était écrit,
des deux côtés. **iOS ne les voyait pas du tout** : l'enveloppe de la page delta
(`OffsetPaginatedAPIResponse`) ne portait pas `meta`, et le bloc était jeté au décodage. Une
conversation quittée depuis un autre appareil restait affichée — et trouvable en recherche —
jusqu'à la réconciliation complète, 24 h.

**La leçon** : l'absence d'un champ dans un type `Decodable` est le mode de défaillance le plus
silencieux qui soit. `JSONDecoder` ignore les clés inconnues **par conception** : la réponse arrive,
le décodage RÉUSSIT, et l'information s'évapore. Aucun log, aucune exception, aucun test rouge —
côté client il ne s'est rien passé, et côté serveur tout s'est bien passé. Une paire
émetteur/récepteur ne se vérifie donc JAMAIS en lisant l'émetteur, si complet soit-il : la seule
preuve qu'un canal existe est **un call site qui lit le champ**.

**Corollaire — quand un module serveur cite un client par son nom, vérifier que le client le cite en
retour.** `delta-tombstones.ts` nommait iOS explicitement (« Elle reste en cache local jusqu'à la
réconciliation complète : 24 h côté iOS (`fullReconcileInterval`) comme côté web »). Lue vite, la
phrase se prend pour la description d'un consommateur ; elle décrit en réalité le REPLI que le
module existe pour rendre inutile. Un commentaire serveur qui mentionne un client atteste que
l'auteur y a pensé, pas que le client a été câblé. Le grep qui tranche part du champ, pas du module.

**Corollaire — le TYPE D'ENVELOPPE est le point de coupure invisible.** Le SDK « supportait » déjà
`meta` : `APIResponseMeta` existait, avec ses tombstones de stories, ses tests de rétro-compat, et
son test « une clé inconnue ne casse pas le décodage ». Sauf que ce `meta` vivait sur
`PaginatedAPIResponse` (curseur), et que le delta des conversations passe par
`OffsetPaginatedAPIResponse` (offset) — un type frère qui ne l'avait jamais reçu. Grepper le NOM du
mécanisme (`meta`, `deletedStoryIds`) rendait « c'est supporté » ; l'écart était dans QUELLE
enveloppe. **Quand deux types portent la même responsabilité à un détail près, un champ ajouté à
l'un est une divergence par défaut, pas une omission visible.**

**Corollaire — retirer d'une liste ne suffit pas quand la donnée vit dans deux magasins.** La
boucle `removedIds` existait et n'invalidait que le cache des messages : l'index FTS local gardait
la conversation, qui restait TROUVABLE après avoir quitté la liste. Et le ré-index du même lot
l'aurait ressuscitée — une ligne servie par la page puis déclarée partie par les tombstones est
active dans `deltaConversations`. **Tout retrait doit s'énumérer par MAGASIN, et tout ré-index qui
suit un retrait dans le même tour doit filtrer ce qui vient d'être retiré.**

**Corollaire — un curseur PERSISTÉ et un curseur RECALCULÉ n'ont pas le même droit d'avancer.** Le
web garde son signal d'escalade (`shouldReconcile`) distinct de son curseur, et il le peut : il le
recalcule depuis son cache à chaque exécution. iOS le persiste. Une troncature de tombstones —
qui n'a AUCUN curseur de reprise, donc aucun « page suivante » de disparitions à demander — doit
donc y retenir le watermark en plus d'escalader : seul un `since` resté en place redemandera les
sorties coupées si l'escalade échoue. Transposer la règle du jumeau sans regarder la NATURE de son
curseur aurait rendu ces disparitions irréclamables.

**Confirmation immédiate, cycle 114-bis — la même leçon, deux fois dans le même run.** Cherchant la
suite de ce correctif, le balayage est reparti du même réflexe (« quel champ le serveur envoie-t-il
que le client ne lit pas ? ») et a trouvé le second cas en quelques minutes : les quatre événements
d'appartenance portent un `memberCount` ABSOLU, documenté quatre fois côté serveur comme « à POSER,
pas à incrémenter », honoré par le web (`applyMemberCount`) — et déclaré sur AUCUN des quatre
structs Swift, qui faisaient exactement le `± 1` que le contrat interdit. Deux instances en une
séance disent que ce n'est pas un accident mais une CLASSE, et elles donnent son test :

> **Un champ ajouté à un payload existant n'a de récepteur nulle part tant qu'on ne l'a pas grepé
> par son NOM dans chaque client.** Ni la doc du serveur, ni les tests du serveur, ni les tests de
> l'autre client ne le prouvent — et le langage du client (`Decodable` optionnel, `JSONDecoder` qui
> ignore les clés inconnues) est précisément conçu pour que cette absence ne fasse aucun bruit.

Corollaire de méthode : **le commentaire serveur qui explique POURQUOI un champ existe est un
détecteur de bug client**. « à POSER, pas à incrémenter », « un client qui décrémente ne se rattrape
jamais » — cette phrase n'est pas descriptive, elle prescrit un comportement client, donc elle
nomme le bug qu'elle veut empêcher. Grepper les prescriptions écrites dans les types partagés
(`packages/shared/types/`) et vérifier chacune chez CHAQUE client est un audit à part entière, bon
marché, et qui ne demande d'exécuter aucun code.

---
