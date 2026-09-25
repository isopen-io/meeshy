## 2026-08-21 : Le retour en vue PERSONNEL se relit ; il ne s'écrit pas localement

**Context**: l'ADR du 2026-08-16 (« Le masquage PERSONNEL se purge ») déposait explicitement son
propre reste, en Cons : « `message:restored-for-me` reste sans abonné iOS ». Le gateway l'émettait
pourtant déjà (`personalMessageVisibilitySync.restoreMessageForUser`) et le web l'honorait des deux
côtés. Conséquence : restaurer un message depuis le web ne le rendait pas à l'iPhone du même
utilisateur — et le retour finissait par avoir lieu à une date arbitraire, quand le lecteur repassait
par cette région de l'historique et que le `listBefore` la re-couvrait. Jamais, pour un fil qu'on ne
remonte pas.

**Decision**: brancher le canal jumeau — `MessageRestoredForMeEvent` + publisher au protocole +
`socket.on("message:restored-for-me")` — sur une **relecture serveur**, `listAround(around:)` centré
sur l'adresse rendue, suivie d'un `upsertFromAPIMessages`.

**Pourquoi une relecture et pas une écriture locale** : c'est la propriété du masquage qui l'impose.
Il PURGE (ADR précédente) ; l'appareil ne détient donc plus ni contenu ni ligne. Et la charge utile
ne porte volontairement aucun corps — le contrat partagé l'écrit : *an APPEARANCE cannot be expressed
as a tombstone*. Il ne reste qu'une adresse, et la seule instruction honnête qu'elle porte est « va
rechercher ».

**Pourquoi `listAround` et pas `syncMissedMessages`** : le délégué exposait déjà un verbe qui
ressemblait à la solution. Il est **strictement en avant** (`listAfter(after: newestLocal)`), alors
qu'un message rendu est presque toujours PLUS VIEUX que le dernier détenu — il a été masqué quelque
part dans l'historique. Le brancher là aurait produit un no-op parfaitement vert : aucune erreur,
aucun test rouge, aucun message rendu.

**Alternatives rejetées**:
- *`jumpToQuotedMessage`*, qui fait pourtant exactement le bon aller-retour : il **recentre la
  fenêtre** sur sa cible. Légitime pour un tap volontaire sur une citation, régression pour un
  événement distant — il arracherait le lecteur à l'endroit où il lit, sur un geste fait ailleurs.
- *Un `loadWindow` après l'upsert.* Même raison. L'upsert seul suffit, et c'est une propriété du
  store et non une chance : chaque écriture de `MessagePersistenceActor` poste
  `.messageStoreShouldRefresh`, et `MessageStore` relit sa fenêtre courante.
- *Un aller-retour par id.* `listAround` ramène une FENÊTRE : les adresses déjà couvertes par une
  fenêtre précédente ne redemandent rien. Le lot se replie sur le nombre de fenêtres distinctes.

**Cons**: le retour coûte un aller-retour réseau là où le masquage était une écriture locale — c'est
irréductible, l'appareil n'a plus le contenu. Hors ligne, le message ne revient pas à l'instant de
l'événement ; il reviendra à la prochaine relecture de sa région. Et comme son jumeau, le handler
vit dans `ConversationSocketHandler` : un retour reçu sur l'écran de liste ne relit rien
immédiatement. Android reste sans AUCUN des deux sens — tout le canal de visibilité personnelle y
est absent, et n'y ajouter que le retour n'aurait pas de sens (cf.
`tasks/realtime-sync-audit-2026-08-21-cycle76.md`, § 6).
