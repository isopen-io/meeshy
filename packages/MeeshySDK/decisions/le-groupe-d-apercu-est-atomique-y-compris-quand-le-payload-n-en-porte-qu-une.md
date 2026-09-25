## Le groupe d'aperçu est atomique, y compris quand le payload n'en porte qu'une part

**Contexte**: les onze champs `lastMessage*` de `MeeshyConversation` décrivent UN seul message.
`LastMessageFacet` rend leur écriture atomique pour les chemins qui TRANSPORTENT le message
(`message:new`, accusé d'envoi, remplacement local après suppression). Restait la famille de
chemins qui n'en portent qu'une part : `conversation:updated` recalculé par le serveur
(`emitConversationPreviewUpdate`) nomme un AUTRE message — suppression pour tous du dernier
message, masquage personnel avec un plus ancien encore visible — et n'en donne que l'identité,
l'horodatage, le texte et le Prisme. Six champs (auteur, pièces jointes et leur compte, `blurred`,
`viewOnce`, expiration) ne voyagent sur AUCUN `conversation:updated` : le serveur ne les lit pas.

**Décision**: `MeeshyConversation.adoptLastMessage(id:)` — l'identité change ⇒ tout ce qui DÉCRIT
le message est remis à neutre, et l'appelant repose aussitôt ce que le payload porte vraiment.
L'identité inchangée est un no-op : c'est l'ÉDITION et la TRADUCTION, où l'auteur, les pièces
jointes et les drapeaux restent vrais. `lastMessageAt` n'entre pas dans le geste — il porte le
RANG de la ligne, tenu par les règles de monotonie de l'appelant et par `previewRecalculated`.

L'arbitrage est celui de `LastMessageFacet.bumped`, appliqué à une deuxième famille de chemins :
**une ligne momentanément dépouillée est corrigée à la synchro suivante ; une ligne FAUSSE ne
l'est jamais**, parce que rien ne signale l'incohérence — l'aperçu du message supprimé n'est faux
qu'à l'écran, et le client n'a aucun moyen local de s'en apercevoir.

**Alternatives rejetées**:
- *Faire porter les six champs par le serveur.* Il faudrait joindre `attachments` dans
  `PREVIEW_MESSAGE_SELECT`, donc payer la jointure sur le chemin qu'emprunte le fan-out des
  TRADUCTIONS — le plus fréquenté des trois appelants — pour un cas qui ne survient qu'aux deux
  chemins où l'identité change. Et cela ne fermerait que les émetteurs d'aujourd'hui : la règle
  client, elle, vaut pour le quatrième émetteur que personne n'a encore écrit.
- *Ne remettre à neutre que les six champs absents du payload.* Le texte et la carte du Prisme
  sont dans le même cas dès qu'un payload les tait ; les exclure du geste rouvrirait le défaut
  sous sa forme subtile (un texte ancien non attribué, et pire, une traduction ancienne que le
  résolveur PRÉFÈRE à l'aperçu). Le geste couvre donc les onze, et l'appelant repose.
- *Unifier les deux implémentations de la fusion (`ConversationStore.merging` et
  `ConversationListViewModel`).* Toujours pas mûre, pour la raison établie au cycle 51 : les deux
  sites lisent deux TYPES d'événement différents reliés par un mapping manuel. Le geste central
  sur le MODÈLE est ce qui rend leur divergence inoffensive sur ce point précis — les deux
  appellent la même fonction.

**Cons**: après une suppression pour tous, la ligne perd momentanément la vignette et le nom de
l'expéditeur du remplaçant, que le serveur ne dit pas — jusqu'au prochain `GET /conversations`.
C'est l'arbitrage assumé ci-dessus. Et `adoptLastMessage` est un troisième geste sur le même
groupe (avec `applyLastMessage` et `clearLastMessage`) : trois portes pour un invariant, là où
une seule serait plus sûre — mais les trois décrivent trois faits distincts (« voici le message »,
« voici son identité seule », « il n'y en a plus »), et les confondre ferait mentir la deuxième.
