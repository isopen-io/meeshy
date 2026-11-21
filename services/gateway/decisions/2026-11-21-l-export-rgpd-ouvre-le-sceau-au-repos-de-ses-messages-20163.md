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

**Le `where` dit l'ABSENCE (`unsetOrNull`), et la première version de ce lot avait tort.** `Message` a résolu le piège MongoDB par la discipline d'ÉCRITURE (`LIVE_MESSAGE_MARK`) là où `Post` l'a résolu par la LECTURE (#19909) — j'ai donc d'abord écrit que `deletedAt: null` était juste ici, et signé « vérifié avant d'être supposé ». **La vérification ne portait que sur le CODE.** L'audit adversarial du lot a ouvert les données : `liveMessage.ts` dit lui-même que deux des créateurs (les messages d'appel de `CallService`) avaient PERDU le marqueur, la constante n'y est arrivée que le **2026-11-18**, et **aucune migration ne rattrape la colonne** (`022_backfill_fields_read_under_negation.js` traite `Message.isViewOnce`, pas `deletedAt`). Les lignes d'appel écrites avant cette date ont donc la clé ABSENTE, et une égalité nue les aurait omises de l'export EN SILENCE, avec un `messagesCount` juste — le défaut exact de #19909, sur le modèle qui lui servait de contre-exemple.

`unsetOrNull('deletedAt')` apparie les deux formes. C'est strictement un gain : les trois transports de suppression ÉCRIVENT une date, donc aucune ligne rappelée n'a la clé absente. **La population réelle de lignes sans clé n'est pas mesurée** — il n'y a pas de base dans les conteneurs de session — et c'est précisément la raison de choisir la forme qui apparie les deux plutôt que d'affirmer laquelle existe.

> Une vérification de CODE et une vérification de DONNÉES ne sont pas la même phrase. « Tous les créateurs répandent le marqueur » était vrai le jour du lot et ne dit rien des lignes écrites avant qu'ils ne le fassent — il n'existe de surcroît **aucun cliquet** sur cette discipline (`liveMessage.test.ts` n'assert que la forme de la constante, et `deletedAt` est explicitement hors du cliquet `soft-state-equality-filter-guard`, #19748).

### Ce que l'audit adversarial a cassé, et qui est corrigé ici

**Le coffre de clés lisait la même clé N fois.** `ServerKeyVault.loadKey` vérifie `keyCache` de façon SYNCHRONE puis `await` la base : sous le `Promise.all` de `revealAtRestRows`, les N appels franchissent tous la vérification avant que le premier ne résolve. Le cache n'en absorbait AUCUN, quel que soit le nombre de clés distinctes. Mesuré par l'audit sur 10 000 lignes scellées sous UNE clé : **10 000 `findUnique` et 10 000 `update` de `lastAccessedAt` sur le MÊME document**, à travers le PrismaClient partagé de toute la passerelle (aucun `connection_limit` n'est configuré, donc une seule requête HTTP pouvait affamer le pool). Avant ce lot la section ne touchait JAMAIS le coffre : on passait de 0 à 40 000.

`keyLoadsInFlight` mémoïse la promesse et l'oublie dès qu'elle est résolue. Le verdict rendu est identique pour tous les appelants, l'entrée ne survit pas à la lecture (donc aucun verdict périmé, aucun échec mémorisé), et **le contrôle d'appartenance reste PAR appel** — `getKeyFor` compare `owner === conversationId` après coup : partager une lecture ne partage aucune autorisation. Les quatorze autres lecteurs au repos en bénéficient.

**Le témoin du délestage ne couvrait pas la famille qui l'exige.** Il assertait sur une ligne SCELLÉE, où `servedClearAtRest` met déjà les deux colonnes à `null` : rendre le délestage conditionnel au régime laissait les huit témoins VERTS tout en publiant l'enveloppe libsignal d'une ligne `e2ee` (`registrationId` / `deviceId` / `type`, l'identité d'APPAREIL du client). Les deux seules familles que `revealAtRest` rend INTACTES — `e2ee`, et une ligne scellée sans `conversationId` — sont désormais exercées, et la mutation de l'audit est ROUGE (vérifié, puis l'arbre restauré).

### Ce qui reste ouvert, et ne doit pas être lu comme résolu

**Les deux colonnes neuves n'atteignent aucun lecteur.** `isEncrypted` et `encryptionMode` sont SERVIES, et c'est la moitié de l'argument art. 12(1) de ce lot — mais ni `ExportedMessage` (Android, `DataExportModels.kt`) ni `DataExportService` (iOS) ne les déclarent, et Android **ré-encode** `DataExportData` dans le fichier qu'il remet à l'utilisateur : les deux colonnes y sont donc SUPPRIMÉES. Pour un utilisateur Android, un message scellé-illisible reste `content: ""` sans aucun drapeau — exactement le « vous n'avez rien écrit » que ce lot dit corriger. C'est la leçon du cycle 122 (« qui AFFICHE ce qu'il élit ? ») appliquée à ce lot ; l'issue porte les deux modèles clients, et **tant qu'elle est ouverte, la prétention art. 12(1) ne vaut que pour le JSON de l'API et le web.**

### Témoins

`src/__tests__/unit/export-rgpd-messages-sceles-au-repos.test.ts`, huit témoins, dont deux qui ne peuvent pas être obtenus autrement :

- le double `findManyIn` **projette par le `select`** : une colonne absente de la requête est absente de la ligne rendue, donc le témoin de VALEUR tombe pour de vrai. Un double qui rend sa fixture quel que soit le `select` ne verrait rien — c'est le défaut que l'audit de #20113 a mesuré, et ce que fait encore `export-sections.test.ts:376` ;
- un témoin de PROJECTION sur l'argument passé à `findMany`, parce qu'aucun témoin de valeur ne peut voir un `select` incomplet quand le double est permissif.

Les fixtures portent `deletedAt: null` pour la raison ci-dessus, pas par commodité.
