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

### Ce que ça ne couvre pas

- Modèle de menace : une copie de la base sans l'environnement de la passerelle
  ne livre aucun texte. Un serveur compromis lit tout — ce n'est pas du bout en
  bout. Aucune revue cryptographique tierce n'a eu lieu.
- La recherche plein texte ne trouve pas ces messages (la base n'a pas le clair).
- Les messages déjà écrits avec une clé perdue (clé éphémère d'un
  environnement sans `ENCRYPTION_MASTER_KEY`) restent illisibles : rien ne les
  récupère. Ceux écrits sous la clé maîtresse en place redeviennent lisibles.
- La rotation de la clé MAÎTRESSE (re-envelopper les clés de données) n'est
  pas outillée.
- Le cache de traduction du translator et les journaux du translator ne sont
  pas dans ce lot.

### Déploiement

Staging : poser `ENCRYPTION_MASTER_KEY` (32 octets base64, `openssl rand
-base64 32`) dans l'environnement au déploiement, la sauvegarder hors du
serveur. Production : aucune migration ni purge sans feu vert du porteur.
