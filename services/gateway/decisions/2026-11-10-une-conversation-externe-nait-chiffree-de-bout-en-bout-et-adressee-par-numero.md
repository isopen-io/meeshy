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
  l'adresse `ExternalConversationPeer`. L'invariant est APPLIQUÉ, pas seulement posé à la création (audit
  adversarial du 2026-11-10) : la loi unique `conversationAdmitsNewMembers` (`@meeshy/shared/types/external-conversation`)
  est consultée par les quatre portes d'entrée — `POST …/participants`, `POST …/invite`, la création d'un lien
  (`mintConversationShareLink`) et la jonction par lien (`admitLinkEntry`, cœur des trois routes de lien, invité
  compris) — qui refusent en `409 EXTERNAL_CONVERSATION_SINGLE_MEMBER` sans rien écrire. Un second membre écrirait
  sous l'identité téléphonique de l'ouvreur, et son ancien client recevrait le fil. Un balayage
  (`external-conversation-doors-sweep.test.ts`) exige l'appel de toute porte qui appelle `resolveConversationEntry`
  ou `mayMintShareLink`.
- **La porte de création e2ee s'applique** : pendant la phase de test, seul un compte qui peut CHOISIR le bout en
  bout (`mayChooseEndToEnd`, ANALYST et plus, la même porte que `POST /conversations`) ouvre une conversation
  externe ; sinon `403 EXTERNAL_CONVERSATION_END_TO_END_RESERVED`. Le rôle est relu en base, jamais pris du jeton.
  Quand le bout en bout s'ouvrira à tous, la conversation externe suivra sans changement de code.
- **Numéro vérifié** : sans `User.phoneVerifiedAt`, `403 EXTERNAL_CONVERSATION_PHONE_UNVERIFIED`.
- **L'adresse de l'ami dans sa propre collection** `ExternalConversationPeer` (réseau, numéro E.164, ouvreur,
  `purgeAfter`) : aucune lecture de `Conversation` ne l'emporte par un `include`. Ni titre (nul), ni identifiant
  (`ext_<id>`), ni nom ne portent le numéro ; aucun carnet de l'ami n'est stocké. Garde de source : seul
  `services/external-conversation/` touche au délégué, et ce module ne journalise rien.
- **Conservation** : `purgeAfter` = dernière ouverture + `EXTERNAL_PEER_HANDLE_RETENTION_DAYS` (90 j, PROVISOIRE,
  borne dure 365 j) ; rouvrir la repousse. Un index TTL sur `purgeAfter` efface la ligne à l'échéance. La durée et sa
  base légale sont l'affaire du lot conformité (#16999), qui remplace la constante.
- **Idempotence** : unicité (`openedByUserId`, `network`, `handle`) ; rouvrir rend la même conversation VIVANTE
  (200), une course P2002 rend celle de la gagnante. Une conversation close, supprimée, introuvable ou que
  l'ouvreur a quittée est une ABSENCE : son adresse est effacée et une neuve s'ouvre (201), au lieu de rendre un fil
  mort et d'en repousser l'échéance sans fin.
- **Le numéro ne survit pas au fil** : chaque site de clôture (sortie du dernier membre, suppression, effacement
  pour soi, fermeture par un administrateur, obsolescence) appelle `eraseExternalPeerOnClose` à côté de
  `deactivateShareLinksOnClose` (balayage). Sans effet ni lecture pour tout autre type. L'effacement suit la
  transaction de clôture (le type n'est connu qu'une fois la ligne relue) ; s'il échoue, la réouverture et le TTL
  rattrapent.
- **Bornes par compte** : au plus `EXTERNAL_CONVERSATION_ACTIVE_CAP` (50) adresses gardées à la fois — une
  ouverture NEUVE au-delà est refusée en `409 EXTERNAL_CONVERSATION_LIMIT_REACHED` ; et
  `EXTERNAL_CONVERSATION_OPENINGS_PER_HOUR` (20) demandes par heure et par compte sur la route (`429`, compteur fermé
  s'il tombe), en plus du limiteur global par adresse IP. Fermer une conversation libère une place.
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
- Le détail (`GET /conversations/:id`), les événements socket, `routes/users/preferences.ts` et les collections
  `messages` / `participants` de `/sync` ne filtrent pas le type pour un ancien client. L'invariant « un seul
  membre » étant désormais appliqué, seul l'OUVREUR peut les recevoir, et seulement sur un autre de ses appareils
  resté sur un ancien client (son `Participant` arrive par `/sync participants`, sans la conversation). Aucun
  message n'y circule encore : ces lectures suivront le jeton avec le lot du relais, quand un message pourra y
  exister.
- L'index TTL efface l'adresse à l'échéance mais laisse la `Conversation` vivante, sans destinataire : une
  réouverture après l'échéance en crée une seconde. Le lot clients (ou le relais) doit fermer le fil dont l'adresse
  a disparu, ou le dire inadressable.
- Une collision d'unicité (E11000) peut porter la valeur de la clé — donc le numéro — dans un journal de mongod ou
  de Prisma (`log: ['warn','error']`) : non mesuré ici, à vérifier sur le staging avant l'ouverture réelle.
- Le numéro de l'ami n'est encore servi à personne, l'ouvreur compris : ses autres appareils l'apprendront par le
  lot clients, qui décidera comment le leur servir (à l'ouvreur seul).
