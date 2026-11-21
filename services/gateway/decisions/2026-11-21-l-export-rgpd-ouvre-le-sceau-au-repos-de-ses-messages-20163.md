## L'export RGPD ouvre le sceau au repos de ses messages, et DIT ce qu'il ne peut pas ouvrir (2026-11-21, #20163)

**Décision.** La section `messages` de `GET /api/v1/me/export` passe par `exportMessages` (`routes/me/export-sections.ts`), qui ajoute `AT_REST_MESSAGE_SELECT` à son `select` et sert ses lignes par `revealAtRestRowsForWire`. L'archive rend donc le TEXTE CLAIR d'un message scellé au repos, ne transporte ni `encryptedContent` ni `encryptionMetadata`, et garde `isEncrypted` / `encryptionMode` pour DIRE le régime.

### Le défaut

Le `select` prenait `content` et rien de l'enveloppe — mesuré : zéro occurrence de `encrypt` dans `export.ts` et `export-sections.ts`. Or `MessageProcessor` écrit `content: ''` dès qu'un message part dans une conversation `server` ou `hybrid`, le texte vivant dans `encryptedContent`. L'archive rendait une ligne par message avec un texte VIDE **et un `messagesCount` juste** : elle ne se présentait pas comme tronquée mais comme « vous n'avez rien écrit ». C'est « la liste vide est plus dangereuse que la réponse vide » appliqué à une obligation légale — art. 15(3) (la copie ne contient pas les données traitées alors que le responsable détient la clé, dans `ServerEncryptionKey` sous `ENCRYPTION_MASTER_KEY`), art. 12(1) (rien ne le dit), art. 5(1)(d) (un compte exact à côté de textes vides).

### Aucune loi n'est créée

`AT_REST_MESSAGE_SELECT` et `revealAtRestRowsForWire` (`services/messaging/serverAtRest.ts`) sont la loi que **quatorze** lecteurs appliquent déjà : `conversations/messages-list`, `conversations/threads`, `conversations/core-list`, `conversations/messages-pin`, `sync/messages`, `links/messages-retrieval`, `users/dashboardRecentPreview`, `messages-reads`, `socketio/emitConversationPreviewUpdate`, `atRestTranslationSource`, `atRestEdit`, `MessageProcessor.revealStored`. **L'export était le seul lecteur du dépôt à ne pas ouvrir le sceau, et le seul dont la sortie est opposable au titre d'un droit.**

### Pourquoi `…ForWire`, et pas `revealAtRestRows`

Le schéma de réponse déclare cette section `items: { type: 'object', additionalProperties: true }` — **OUVERT** : tout ce que la ligne porte SORT. Élargir le `select` sans déporter le chiffré aurait publié `encryptedContent` et `encryptionMetadata` dans l'archive — la question « qu'est-ce qui part À CÔTÉ de ce que je viens de corriger ? » retournée contre son propre correctif. `…ForWire` retire les deux clés ; `isEncrypted` et `encryptionMode` restent, et c'est voulu : le silence sur le régime était la moitié du défaut.

### Les deux cas qui ne s'ouvrent pas

- **Un sceau que le coffre n'ouvre pas** ressort `isEncrypted: true`, `content: ''` (`servedSealed`) : l'archive DIT qu'elle n'a pas pu l'ouvrir, au lieu de laisser croire à un message vide. Fail-closed sur le secret, honnête sur la limite.
- **Une conversation chiffrée de BOUT EN BOUT** ressort telle quelle, le trousseau n'étant jamais sollicité : il n'y a rien à ouvrir côté serveur, la clé est sur les appareils, et la rétrograder serait interdit (#12949). Ce que l'archive doit alors DIRE à l'utilisateur — que les octets sont un chiffré, que Meeshy ne détient pas la clé et ne pourra pas la fournir, où elle se trouve — relève du **texte d'accompagnement, qui n'existe pas** : `export.ts` et les six `export-*.ts` servent du JSON ou du CSV nus. #20138 porte le même besoin pour les médias ; c'est un lot à lui.

### Ce que ce lot NE fait pas, et pourquoi il faut l'écrire

**Les sections `posts`, `stories` et `comments` sont hors périmètre, et ce n'est pas un oubli.** Mesuré deux fois : les modèles `Post`, `PostComment` et `Story` ne portent **aucune** colonne de chiffrement, et `sealTextAtRest` n'a que **deux** appelants de production, tous deux sur `Message` (`MessageProcessor` à la création, `atRestEdit` à l'édition). Leur `content` est servi en clair parce qu'il EST stocké en clair. Ne pas y ajouter `AT_REST_MESSAGE_SELECT` « par symétrie » : ces modèles n'ont pas ces colonnes.

**`deletedAt: null` est JUSTE ici, contrairement à `Post` et `PostComment` (#19909).** `LIVE_MESSAGE_MARK` (`services/messaging/liveMessage.ts`) est la discipline d'ÉCRITURE que tous les créateurs de `Message` répandent — `MessageProcessor`, `CallService`, `conversationNotice`, `MessageTranslationService` — donc la clé est PRÉSENTE et l'égalité apparie. Vérifié avant d'être supposé : la forme nominale d'une ligne `Message` n'est pas celle d'un `Post`.

### Témoins

`src/__tests__/unit/export-rgpd-messages-sceles-au-repos.test.ts`, huit témoins, dont deux qui ne peuvent pas être obtenus autrement :

- le double `findManyIn` **projette par le `select`** : une colonne absente de la requête est absente de la ligne rendue, donc le témoin de VALEUR tombe pour de vrai. Un double qui rend sa fixture quel que soit le `select` ne verrait rien — c'est le défaut que l'audit de #20113 a mesuré, et ce que fait encore `export-sections.test.ts:376` ;
- un témoin de PROJECTION sur l'argument passé à `findMany`, parce qu'aucun témoin de valeur ne peut voir un `select` incomplet quand le double est permissif.

Les fixtures portent `deletedAt: null` pour la raison ci-dessus, pas par commodité.
