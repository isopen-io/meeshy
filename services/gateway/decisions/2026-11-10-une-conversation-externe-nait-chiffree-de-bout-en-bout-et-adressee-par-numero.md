## 2026-11-10 : Une conversation externe naît chiffrée de bout en bout, adressée par le numéro de l'ami, pour un utilisateur au numéro vérifié, derrière un drapeau éteint en production (#17117)

### Contexte
Chantier #17007 (« On écrit depuis Meeshy à un ami sur WhatsApp », DMA art. 7), design
`docs/superpowers/specs/2026-11-08-dma-whatsapp-interop-design.md` § 2 et § 4. Après la porte « pair externe »
(#17115), la passerelle doit savoir ce qu'est une conversation avec un ami WhatsApp. Décisions porteur : toujours
`e2ee` (#9224, #12949), numéro VÉRIFIÉ pour écrire, numéro de l'ami gardé en clair seulement pour une conversation
ouverte par l'utilisateur lui-même, avec une durée de conservation (exception bornée à #9225).

### Décision
- **Un type** `Conversation.type = 'external'` (`EXTERNAL_CONVERSATION_TYPE`, `@meeshy/shared/types/external-conversation`).
  Une seule porte de création : `POST /conversations/external` → `openExternalConversation`
  (`services/external-conversation/`). `POST /conversations` ne l'accepte pas (énumération inchangée).
- **Régime posé par la création** (`nascentRegime`, mode `e2ee`, protocole `signal_v3`, époque 1,
  `autoTranslateEnabled: false`) : la conversation n'existe à aucun instant sans bout en bout. Les règles VIVANTES
  s'appliquent sans exception de type — `assertPlaintextAdmitted` / `assertNoPlaintextPieces` refusent un clair,
  une pièce lue par le serveur et un lieu en clair (`E2EE_PLAINTEXT_REFUSED`) ; `switchEncryptionRegime` et
  `conversation-encryption.ts` refusent toute rétrogradation (`409 E2EE_IRREVERSIBLE`), membre ADMIN ou BIGBOSS
  compris. Aucune route d'administration n'écrit `type` ni `encryptionMode`.
- **Un seul membre Meeshy**, l'ouvreur (`creator`). Le pair externe n'est pas un `Participant` : il est désigné par
  l'adresse `ExternalConversationPeer`.
- **Numéro vérifié** : sans `User.phoneVerifiedAt`, `403 EXTERNAL_CONVERSATION_PHONE_UNVERIFIED`.
- **L'adresse de l'ami dans sa propre collection** `ExternalConversationPeer` (réseau, numéro E.164, ouvreur,
  `purgeAfter`) : aucune lecture de `Conversation` ne l'emporte par un `include`. Ni titre (nul), ni identifiant
  (`ext_<id>`), ni nom ne portent le numéro ; aucun carnet de l'ami n'est stocké. Garde de source : seul
  `services/external-conversation/` touche au délégué, et ce module ne journalise rien.
- **Conservation** : `purgeAfter` = dernière ouverture + `EXTERNAL_PEER_HANDLE_RETENTION_DAYS` (90 j, PROVISOIRE,
  borne dure 365 j) ; rouvrir la repousse. Un index TTL sur `purgeAfter` efface la ligne à l'échéance. La durée et sa
  base légale sont l'affaire du lot conformité (#16999), qui remplace la constante.
- **Idempotence** : unicité (`openedByUserId`, `network`, `handle`) ; rouvrir rend la même conversation (200),
  une course P2002 rend celle de la gagnante.
- **Drapeau** `EXTERNAL_CONVERSATIONS` : armé par la seule valeur exacte `on`, et seulement là où
  `isPreSignatureEnvironment` (partagé avec le choix du pair externe) l'admet — développement, test, staging
  déclaré. Armé en production, il reste éteint. `docker-compose.prod.yml` le pose `off`, le staging le laisse
  `off` par défaut (`${EXTERNAL_CONVERSATIONS:-off}`). Éteint : `403 EXTERNAL_CONVERSATIONS_DISABLED`.
- **Rétrocompatibilité** (#9223) : les TROIS lectures qui listent les conversations d'un lecteur —
  `GET /conversations`, `GET /sync?collections=conversations` (la liste du client iOS publié,
  `ConversationSyncEngine`) et `GET /conversations/search` — ne servent une conversation `external` qu'au client
  qui annonce `X-Meeshy-Capabilities: external-conversations` (`externalVisibilityClauses`,
  `routes/conversations/utils/list-viewer-scope.ts`) ; sans le jeton, chacune rend ce qu'elle rendait avant.
  `Vary` porte l'en-tête. Un client iOS publié replie un type inconnu sur `.direct` : sans ce filtre, il montrerait
  un tête-à-tête sans interlocuteur.
- **Effacement** : la purge d'un compte supprimé (`purgeAccountIsolatedData`) efface les adresses qu'il avait
  ouvertes (`eraseExternalPeerHandlesOpenedBy`) sans attendre l'échéance : le numéro n'était gardé que pour lui.
- **Ce qui part à côté** : la réponse d'ouverture ne recopie pas le numéro ; une demande refusée non plus ; une
  erreur inattendue n'est journalisée que par son nom et son code (une erreur Prisma recopie ses arguments).
- **Index** : migration nommée `2026-11-10-external-conversation-peer-indexes` (deux unicités + TTL sous le nom
  Prisma `ExternalConversationPeer_purgeAfter_idx`), jamais `prisma db push` en staging ou production.

### Alternatives rejetées
- *Le pair comme `Participant` anonyme* : il entrerait dans tous les éventails (notifications, présence, accusés,
  listes de membres) qui lisent `Participant`, et son numéro voyagerait avec chacun d'eux.
- *Le numéro dans `Conversation.title` ou `identifier`* : servi à toute lecture de conversation, admin et exports
  compris.
- *Une purge par tâche planifiée* : un index TTL ne dépend d'aucun processus vivant ; une tâche peut s'arrêter.
- *Servir le type à tous les clients* : un ancien client qui décode le type en énumération stricte perdrait la liste
  entière ou montrerait un tête-à-tête vide qu'il ne sait pas dire.

### Conséquences
- Aucune route ne relaie encore de message vers le pair : la conversation existe, chiffrée, adressée ; l'envoi par
  la porte « pair externe » et la réception sont des lots suivants (clients, relais).
- Le détail (`GET /conversations/:id`) et les événements socket ne filtrent pas le type pour un ancien client :
  la conversation n'a qu'un membre, n'est jointe qu'en connaissant son id (que les trois lectures ci-dessus
  retiennent), et aucun message n'y circule encore. Les collections `messages` / `participants` de `/sync`
  suivront le même jeton avec le lot du relais, quand un message pourra y exister.
- Le numéro de l'ami n'est encore servi à personne, l'ouvreur compris : ses autres appareils l'apprendront par le
  lot clients, qui décidera comment le leur servir (à l'ouvreur seul).
