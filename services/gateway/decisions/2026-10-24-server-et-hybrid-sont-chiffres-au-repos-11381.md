## Les modes `server` et `hybrid` sont chiffrés AU REPOS, lus par la passerelle et dits « Chiffré sur le serveur » (2026-10-24, #11381, #11374)

### Contexte

Audit adversarial de #11372 et #11378. Les deux modes stockaient `content: ''`
avec `isEncrypted: true` et le chiffré dans `encryptedContent`, mais AUCUN
chemin de lecture ne déchiffrait : ces messages étaient illisibles pour leurs
destinataires (« Message chiffré » sur iOS). L'en-tête web annonçait
`hybrid` « Chiffré de bout en bout », quand la loi d'actions partagée le juge
lisible par le serveur. Et deux replis écrivaient le CLAIR en base sans le
dire : un chiffrement qui échouait (`getEncryptionContext`) et une traduction
dont la clé manquait (`EncryptionHelper.encryptTranslation`).

### Décision porteur (2026-10-24)

`server` et `hybrid` = **chiffré au repos**. La passerelle chiffre le texte
avant de l'écrire et le déchiffre à la lecture ; la traduction et les
fonctions serveur restent disponibles ; l'interface dit « Chiffré sur le
serveur », jamais « de bout en bout » (réservé à `e2ee`).

### Mise en œuvre

- **Site unique** : `services/messaging/serverAtRest.ts` — primitives
  AES-256-GCM (`sealBytes`/`openBytes`, vecteur officiel du GCM spec au
  témoin), lecture de la clé maîtresse (`readMasterKey`), ouverture d'une ligne
  (`revealAtRest`, `revealAtRestRows`, `lazyKeyring`) et erreurs typées
  (`SERVER_AT_REST_UNAVAILABLE`, `SERVER_AT_REST_UNREADABLE`).
- **Clés** : le coffre existant (`ServerKeyVault`) — une clé de données par
  conversation (`Conversation.serverEncryptionKeyId`, la même que ses
  traductions), enveloppée par `ENCRYPTION_MASTER_KEY`. L'identifiant de clé
  (`encryptionMetadata.keyId`) voyage avec chaque chiffré : une rotation de la
  clé de données laisse les anciens messages lisibles.
- **Liaison** : le chiffré est authentifié avec sa conversation
  (`aad: 'conversation:v1'`). Une ligne recopiée ailleurs en base ne parle
  pas. Les lignes d'avant cette liaison (sans `aad`) se lisent encore.
- **Écriture** : `MessageProcessor.getEncryptionContext` → `sealAtRest` ;
  aucun lien suivi n'est minté pour un message au repos (l'adresse se
  rangerait en clair à côté du chiffré).
- **Lecture** : la réponse d'envoi et `message:new` (clair en mémoire), la
  liste de messages et ses citations, `GET /messages/:id`, la ligne de liste
  des conversations. Un message ouvert est servi **comme un message non
  chiffré** — `content` en clair, `isEncrypted: false`, `encryptionMode`
  conservé, ni chiffré ni métadonnées sur le fil : les anciens clients le
  lisent sans mise à jour (#9223).
- **Notifications** : la ligne `Notification` est persistée ; y mettre le
  texte le rangerait en clair. L'éventail garde donc le placeholder de
  message chiffré pour ces deux modes (comportement inchangé).
- **Fail-closed** : sans clé maîtresse (absente ou de mauvaise longueur), la
  passerelle démarre, le journalise une fois, et refuse l'écriture (503
  `SERVER_AT_REST_UNAVAILABLE`, aussi à l'activation du mode) ; les lignes
  qu'aucune clé n'ouvre sont servies scellées. Un mode inconnu est refusé.
  Plus de clé éphémère en développement. Une traduction ne se range jamais en
  clair. L'édition d'un message au repos est refusée
  (`SERVER_AT_REST_EDIT_REFUSED`) tant qu'aucun transport ne rechiffre.

### Après revue adversariale (2026-10-24)

- **Une clé ne parle que pour SA conversation** (oracle de déchiffrement
  fermé). `ServerKeyVault.getKeyFor(keyId, conversationId)` ne rend une clé
  que si sa ligne est rattachée à la conversation ou si la conversation la
  désigne (`serverEncryptionKeyId`). Sans ce contrôle, une copie de la base
  plus un compte gratuit suffisaient : recopier l'enveloppe d'une traduction
  d'une conversation X dans un envoi `server` de sa propre conversation, et
  la lecture l'ouvrait sous la clé de X. L'activation rattache désormais sa
  clé à la conversation (`getOrCreateConversationKey(conversationId)`).
- **Seule la passerelle écrit un chiffré au repos.** Un chiffré client
  déclaré `server`/`hybrid`, ou apporté dans une conversation
  `server`/`hybrid`, est refusé à l'admission (400
  `SERVER_AT_REST_CIPHERTEXT_REFUSED`). Aucun client ne l'émet (mesuré).
- **Une clé de conversation ABSENTE de la base est remplacée** : clé neuve
  rattachée, désignée en compare-et-échange (`redesignate`). Les messages
  d'avant restent scellés. Une panne de base ne remplace rien (503).
- **Une clé qui EXISTE mais ne se désenveloppe pas n'est JAMAIS remplacée**
  (second audit, #12822). La cause la plus probable est une
  `ENCRYPTION_MASTER_KEY` erronée au déploiement (bonne longueur, mauvaise
  valeur) : remplacer réécrivait chaque conversation sous une clé que la bonne
  clé maîtresse n'ouvrirait plus, et scellait tout leur historique en silence.
  L'envoi est refusé (503 `SERVER_AT_REST_UNAVAILABLE`, raison
  `key-unwrap-failed`), journalisé en ERROR sans secret. Conséquence assumée :
  une conversation dont la clé a été enveloppée sous une clé maîtresse
  PERDUE (clé éphémère d'un environnement d'avant #11381) refuse tout envoi
  jusqu'à un geste d'exploitation explicite — un verrou visible vaut mieux
  qu'une rotation silencieuse.
- **Toutes les lectures ouvrent** : le rejeu d'un `clientMessageId` (dédup
  précoce de `MessagingService`), les citations de `message:new` et des deux
  dédups, et la retraduction à la demande (`POST /translate-blocking`,
  `POST /translate`, `translation:request`) — une ligne scellée y est
  refusée (409 `SERVER_AT_REST_UNREADABLE`), jamais traduite vide.
- **Le lien de partage anonyme scelle aussi** (`routes/links/messages.ts`,
  qui contourne `saveMessage`) : il rangeait le clair dans une conversation
  `server`/`hybrid`. Site d'écriture unique : `services/messaging/atRestWrite.ts`.
- **Un message sans texte n'est pas scellé** (photo, vocal) : il se range
  `isEncrypted: false`, mode gardé, et n'est plus masqué « Message chiffré ».
- **« Modifier » n'est plus offert** sur un message `server`/`hybrid` par la
  loi d'actions partagée et son miroir Swift, comme la passerelle le refuse.
- **iOS** : l'écran d'activation ne dit plus « Hybride (E2EE + serveur) » —
  `hybrid` et `server` y sont « chiffré sur le serveur », sept langues.
- Les traductions ne portent pas d'`aad` : la liaison de la clé à sa
  conversation suffit à fermer la recopie inter-conversations ; dans la même
  conversation, ses membres lisent déjà le texte.

### Après contre-audit (2026-10-25, #12822)

Le chiffrement de MongoDB ne tenait sa promesse que si le clair ne se posait
sur AUCUN autre disque. Trois l'y posaient encore ; ils sont fermés.

- **Cache Redis et journaux du translator.** La requête ZMQ de traduction d'un
  message `server`/`hybrid` porte `atRest: true` (champ absent = trame d'avant,
  rétrocompatible dans les deux sens). Le translator ne lit ni n'écrit alors
  aucun cache (texte entier ni segments). Ses journaux ne portent plus de texte,
  pour aucune requête : longueurs, langues, identifiants.
- **File de livraison hors ligne** (`RedisDeliveryQueue`, 48 h). `message:new`
  et `message:translation` de ces conversations y partent SCELLÉS
  (`sealedPayload`, AES-256-GCM sous la clé désignée de la conversation, AAD
  `delivery-queue:v1` liant conversation ET message — distincte de
  `conversation:v1`). Le drain les rouvre : le client, ancien ou nouveau,
  reçoit l'événement d'avant. Forme choisie plutôt qu'une référence relue par
  REST, qu'aucun client existant ne relit au reconnect. Fail-closed : une
  entrée qui ne se scelle pas n'est pas enfilée, une entrée qui ne se rouvre
  pas n'est pas rejouée (le message se relit en ouvrant la conversation).
- **Traduction rangée en clair sur une panne** : une relecture du régime qui
  échoue n'écrit plus rien (`EncryptionHelper.shouldEncryptTranslation` lève),
  et le mode se lit sans égard à la casse.
- Lectures : l'aperçu de liste RECALCULÉ (suppression, vue unique, masquage,
  traduction) ouvre le repos ; l'épingle sert `isEncrypted`.

### Ce que ça protège, et ce que ça ne protège pas

Protège : une copie de MongoDB, de Redis (AOF compris) ou des journaux de la
passerelle et du translator, SANS l'environnement de la passerelle
(`ENCRYPTION_MASTER_KEY`), ne livre le texte d'aucun message `server`/`hybrid`
écrit après ce lot, ni de sa traduction — sous réserve des points ci-dessous.

Ne protège pas :

- **Un serveur compromis** : la passerelle détient la clé maîtresse et lit tout
  ce qu'elle relaie ; le translator reçoit le clair en mémoire. Ce n'est pas du
  bout en bout (`e2ee` seul l'est).
- **Les lignes déjà en base** : éditées avant le lot, avis système, ancien
  repli « Encryption failed → plaintext ». Mesure puis re-scellement : #12875
  (production après feu vert du porteur et sauvegarde vérifiée).
- **L'audio** : transcriptions (Whisper), traductions de transcription, pistes
  TTS et leurs journaux, et l'événement `message:attachment-updated` en file —
  aucun n'est chiffré au repos.
- **Les notifications** (ligne `Notification`, push) : elles gardent le
  placeholder chiffré, mais les avis système et les métadonnées (expéditeur,
  heure, conversation) restent en clair, comme `messageId`, `conversationId`
  et `eventType` dans les entrées de file.
- **Le cache mémoire de traduction de la passerelle** (non persistant) et la
  mémoire de tout processus.
- **La rotation de la clé maîtresse**, et le chemin des pièces jointes qui
  re-désigne une clé de conversation (constat E5, #12854).
- **Un retour arrière** vers une passerelle d'avant ce lot pendant les 48 h de
  la file : elle rejouerait les entrées scellées avec une charge vide, que les
  clients ignorent (le message se relit à l'ouverture de la conversation).
- Aucune revue cryptographique tierce n'a eu lieu ; elle reste requise avant de
  présenter ce mode comme une garantie.

### Ce que ça ne couvre pas (lot initial)

- Modèle de menace : une copie de la base sans l'environnement de la passerelle
  ne livre aucun texte. Un serveur compromis lit tout — ce n'est pas du bout en
  bout. Aucune revue cryptographique tierce n'a eu lieu.
- La recherche plein texte ne trouve pas ces messages (la base n'a pas le clair).
- Les messages déjà écrits avec une clé perdue (clé éphémère d'un
  environnement sans `ENCRYPTION_MASTER_KEY`) restent illisibles : rien ne les
  récupère. Ceux écrits sous la clé maîtresse en place redeviennent lisibles.
- La rotation de la clé MAÎTRESSE (re-envelopper les clés de données) n'est
  pas outillée.
- Le cache de traduction du translator et ses journaux : fermés au contre-audit
  ci-dessus.

### Déploiement

Staging : poser `ENCRYPTION_MASTER_KEY` (32 octets base64, `openssl rand
-base64 32`) dans l'environnement au déploiement, la sauvegarder hors du
serveur. Production : aucune migration ni purge sans feu vert du porteur.
