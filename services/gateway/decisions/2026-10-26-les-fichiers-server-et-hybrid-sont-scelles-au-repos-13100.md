## Les fichiers d'une pièce jointe `server` / `hybrid` sont scellés au repos (#13100)

**Décision du 2026-10-26.** Le chiffrement au repos de #11381 (PR #12822) ne
couvrait que le TEXTE. Mesuré sur staging le 2026-10-25 : les fichiers des
conversations `server`/`hybrid` commençaient par l'en-tête PNG, la vignette
`_thumb.webp` était en clair à côté, et le nom d'origine figurait dans le
chemin. Une copie du volume ou du seau livrait tout ce que la conversation
promet de taire.

### Ce qui est scellé, et quand

Tout ce que la passerelle écrit pour une pièce d'une conversation `server` ou
`hybrid` activée : l'original, la vignette, les variantes WebP et AVIF, les
rendus (H.264, original HEIC), et les pistes TTS. Un seul site,
`services/attachments/atRest/sealAttachmentFiles.ts`, idempotent, appelé :

- au rattachement à un message (`MessageProcessor.handleAttachments`), AVANT
  `message:new` et avant le départ de l'audio vers le translator — pièces
  déposées, transférées et recopiées par une diffusion ;
- à la fin d'un rendu différé (`ready-notifier`, worker de médias) : une pièce
  `pending` attend la fin de son rendu ;
- à l'écriture d'une piste TTS (`writeTranslatedTrack`) : la piste s'écrit sous
  un nom caché, jamais servi, puis le chiffré prend son adresse ;
- par la migration nommée `2026-10-26-server-at-rest-attachment-files`, à blanc
  par défaut, pour les pièces déposées avant ce lot.

Sans clé (clé maîtresse absente, clé de conversation illisible), un envoi qui
porte des fichiers dans une telle conversation est refusé AVANT l'écriture du
message (`SERVER_AT_REST_UNAVAILABLE`, 503), comme un texte. Une pièce chiffrée
de bout en bout (`e2ee`, `isEncrypted`) n'est jamais touchée.

### La construction : AES-GCM-HKDF Streaming de Tink, octet pour octet

Pas de primitive maison. Le format est celui de Tink
(https://developers.google.com/tink/streaming-aead/aes_gcm_hkdf_streaming),
instance de STREAM (Hoang, Reyhanitabar, Rogaway, Vizár, CRYPTO 2015) :
en-tête de 40 octets (longueur, sel de 32 octets, préfixe de nonce de 7), clé
du fichier par HKDF-SHA256 (RFC 5869) sous la clé de données de la
conversation, segments AES-256-GCM (NIST SP 800-38D) de 64 Kio avec le rang et
le drapeau de dernier segment dans le nonce. Les témoins ouvrent des fichiers
scellés par Tink-Python, et Tink-Python ouvre les fichiers scellés par la
passerelle (segments de 256 octets et de 64 Kio, jusqu'à 200 Ko).

Pourquoi des segments et non un seul GCM : une vidéo se lit par plages
(`Range`, 206) et ne tient pas en mémoire. Chaque segment s'authentifie seul,
avant que ses octets ne sortent ; troncature, permutation et recollage sont
détectés.

**La clé vient de celle de la conversation**, qui chiffre aussi son texte
(désignée par `serverEncryptionKeyId`, enveloppée par `ENCRYPTION_MASTER_KEY`).
Les fichiers n'en prennent jamais la valeur : ils la dérivent d'abord sous leur
propre étiquette (`HKDF-SHA256(clé de données, sel vide, "meeshy:at-rest-file-key:v1")`,
`fileMainKeyOf`), et c'est cette clé dérivée qui entre dans le HKDF de Tink,
avec un sel aléatoire par fichier : deux usages, deux clés, et chaque fichier a
sa propre clé de segments.

**Les données associées** lient le chiffré à sa conversation, à la pièce qui
l'a fait sceller, à son rôle et à sa clé de stockage
(`["meeshy:attachment-file:v1", conversationId, attachmentId, rôle, clé]`) :
un fichier recopié ailleurs, renommé ou échangé avec un autre ne s'ouvre pas.

### La source de vérité : une ligne par clé de stockage

`AttachmentFileAtRest` (`storageKey` unique) porte la liaison, `keyId`, la
taille du clair, le format et la taille de segment — aucun secret. Sa présence
est la SEULE preuve qu'un fichier est scellé : un nom ou un en-tête de fichier
ne se croit jamais. Un client qui dépose un fichier commençant comme un chiffré
ne fait rien ouvrir. Les copies transférées partagent les octets, donc la
ligne. La ligne part quand le fichier est effacé (`AttachmentService`).

### Concurrence, interruption, rattrapage, retour arrière (audit du 2026-10-26)

- **Un verrou par fichier d'origine** (`atRest/sealLock.ts`, Redis `SET NX PX`,
  10 min) est pris par l'envoi, le balayage et la migration. Deux scellements
  d'une même pièce sous deux liaisons (la source et sa copie transférée dans une
  autre conversation `server`) ne se croisent jamais : le second cède, le
  balayage reprend. Redis injoignable : la passerelle se replie sur le verrou
  de son processus (journalisé en ERREUR, `SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE`)
  et continue de sceller — une seule instance de passerelle à ce jour ; la
  migration, elle, n'a pas ce repli (verrou injoignable = occupé, compté). Une piste TTS s'écrit sous le même
  verrou (attendu jusqu'à 10 s) : jamais rescellée par-dessus son chiffré.
- **Le clair remplacé ne s'efface que quand plus aucune ligne ne le désigne.**
  Chaque fichier déplacé garde `replacedKey` ; `finishPendingErasures` repointe
  toute ligne qui désigne encore l'ancien original (copie créée pendant le
  scellement, repointage interrompu), même apparue après l'effacement : son
  propre scellement la retrouve par `replacedKey` (index dédié), y compris
  dans une conversation qui n'est pas au repos. Rien ne se perd. Une pièce
  effacée PENDANT son scellement (vue unique brûlée) ne laisse ni fichier
  scellé ni ligne.
- **Un scellement interrompu se reprend, et ne perd jamais une pièce.** Sous
  une clé NEUVE, le chiffré prend sa place AVANT que la ligne ne l'annonce
  (interrompu entre les deux : un chiffré orphelin, jamais une ligne vers un
  absent) ; en PLACE, la ligne précède (interrompu : une ligne sur un clair de
  la taille inscrite, rescellé au passage suivant). Aucune ligne n'est repointée
  ni aucun clair effacé tant que CHAQUE scellé qui le remplace n'est pas sur le
  disque, à la taille exacte de son chiffré. Les temporaires vivent sous
  `.at-rest-tmp/` (même volume, segment caché refusé par toutes les routes),
  balayés après une heure.
- **Une pièce effacée pendant ou après son scellement emporte ses clairs** :
  le scellement efface ce qu'il vient de remplacer quand plus aucune ligne ne
  désigne ni l'ancien ni le nouvel original, et `deleteAttachment` efface les
  clairs encore en attente (lignes de scellement relues avant les effacements).
- **Une piste TTS ne se scelle que derrière son original scellé**, sous le
  verrou de cet original : les adresses d'une pièce ne se signent qu'avec son
  original, et une piste scellée sous une adresse nue ne se lirait plus. Une
  piste réécrite en clair retire la ligne de sa version scellée.
- **Une adresse signée livrée avant le scellement reste lisible** : la route
  signée vérifie la signature sur la clé DEMANDÉE et, si son fichier a été
  remplacé, sert le scellé qui l'a remplacé (`currentStorageKey`), après le
  verdict de vie de la clé servie. Aucun client n'a à être prévenu du
  repointage.
- **Seules les clés datées (`AAAA/MM/<auteur>/<nom>`) et les pistes
  (`translated/<nom>`) se scellent** — la même règle que la lecture
  (`isSealableStorageKey`) : une clé hors de cette forme reste en clair,
  comptée `unsealable-key` par la migration.
- **Un balayage toutes les dix minutes** (`jobs/at-rest-file-sweep.ts`) scelle
  les pièces des conversations au repos des dernières 48 h restées en clair
  (échec à l'envoi, fin de rendu différé perdue), termine les effacements en
  attente sous le même verrou, et retire les pistes temporaires orphelines. Il
  ne remonte JAMAIS avant l'activation de ce code sur l'instance (marqueur
  Redis `at-rest:files:activated-at`, posé une fois) : le déploiement seul ne
  scelle rien d'ancien — c'est l'affaire de la migration, sur feu vert et
  après sauvegarde. Sans marqueur, sans clé de signature, ou scellement
  suspendu, il ne scelle rien. Les effacements en attente se traitent par lots
  de 10, au plus 500 par passage.
- **Retour arrière, en trois temps** : (1) redémarrer la passerelle avec
  `AT_REST_FILE_SEALING=off` — plus rien ne se scelle (envoi, rendu, piste,
  balayage, migration), l'envoi n'exige plus de clé, les fichiers scellés se
  lisent encore ; (2) la migration `2026-10-26-server-at-rest-attachment-files-unseal`
  rouvre chaque fichier en place — elle REFUSE `--apply` tant que
  l'interrupteur n'est pas coupé, et reprend un fichier rouvert dont la ligne
  n'avait pu partir ; (3) seulement alors, l'ancienne passerelle. La migration
  se joue par `docker exec` dans le conteneur passerelle, dont elle lit
  l'environnement : celui de la passerelle vivante. Entre (2) et (3), la
  passerelle nouvelle sert encore les fichiers rouverts (une clé de forme
  opaque sans ligne de scellement se lit en clair dès que le magasin répond). Elle remet du
  clair : en production, feu vert du porteur.
- **Index préalables** : `2026-10-26-attachment-file-at-rest-indexes`, à jouer
  avant le déploiement du code.
- **Sans clé de signature des adresses**, l'envoi de fichiers dans une
  conversation au repos est refusé (503) : scellées, ses pièces ne seraient
  lisibles par personne.

### Le nom ne figure plus dans le chemin

L'original et ses dérivés prennent une base opaque, l'empreinte SHA-256 de
l'ancienne clé (`<32 hexadécimaux>`), dans le dossier de l'original, en gardant
les suffixes de dérivé (`_thumb`, `_640w`, `_h264`, `_original`) qui relient une
variante à sa pièce (`fileRouteVerdict`). L'ancienne clé portant un UUID v4,
l'empreinte ne rend pas le nom ; elle est déterministe, donc deux scellements
concurrents écrivent les mêmes clés sous la même liaison et convergent.
`fileName` et `fileUrl` suivent ; `originalName` reste en base pour l'instant
(suite : #13100 tranche des textes).

### La lecture : déchiffrée pour un lecteur jugé, jamais par l'adresse nue

- `GET /attachments/file/*` (adresse nue, sans lecteur) rend 404 pour tout
  fichier scellé, sur `/api/v1` comme sur l'alias legacy `/api`.
- L'adresse signée du lecteur (`/attachments/signed/:token/*`, #9600) et les
  routes par identifiant (`/attachments/:id`, `/:id/thumbnail`, authentifiées)
  déchiffrent à la volée, plages comprises, après avoir jugé l'appartenance et
  le cycle de vie. Le premier segment s'ouvre avant que la réponse ne soit
  décrite : une clé refusée ou un en-tête altéré rendent une erreur, jamais un
  200 suivi d'un flux coupé.
- Une pièce scellée est « lue par lecteur » (`attachmentIsReaderBound`) : toutes
  les surfaces qui signent déjà les contenus protégés (liste, synchronisation,
  fil, épinglés, détail, temps réel par lecteur) lui servent des adresses
  signées. Elle se reconnaît à la forme opaque de ses clés, que seul le
  scellement produit — sans colonne de plus dans les `select`.
- Les clients ne déchiffrent rien : la passerelle leur sert le clair par TLS.
  `isEncrypted` sur le fil reste `false` (le web y lit « chiffré, actions
  retirées »).
- Le translator reçoit le clair par les trames binaires ZMQ (`loadAudioAsBinary`
  déchiffre en mémoire), jamais un chemin vers un fichier clair.

### Rétrocompatibilité (#9223)

Un fichier d'avant le scellement reste servi comme avant, adresse nue comprise,
jusqu'à son passage par la migration. Les clients en circulation ne changent
pas : ils posent derrière leur origine l'adresse que la charge leur donne, et
savent déjà lire une adresse signée (vue unique, #9600).

### Ce qui reste hors du modèle de menace

- Un serveur compromis : il détient la clé maîtresse et lit ce qu'il relaie.
  Ce n'est pas du bout en bout.
- Le clair d'un envoi PAS ENCORE rattaché à un message : le dépôt (TUS ou
  multipart) ne connaît pas sa conversation. Il est scellé au rattachement ;
  un dépôt abandonné reste en clair jusqu'à son balayage. Entre l'envoi et un
  scellement échoué, le clair reste jusqu'au balayage suivant (10 min).
- Une passerelle sans Redis scelle sans verrou partagé (une seule instance).
- Une clé de stockage hors de la forme datée reste en clair (aucune n'existe
  à ce jour pour une pièce de message ; la migration les compte).
- Les octets effacés par `unlink` restent lisibles sur le support physique
  jusqu'à leur réécriture (pas d'effacement sécurisé).
- La taille, le type, les dimensions et la durée restent en clair en base.
- Les TEXTES de la pièce (`originalName`, `alt`, `caption`, `thumbHash`,
  `transcription`, `translations`, `metadata`) et le cache Redis du translator
  (#13102) relèvent des tranches suivantes.
- La notification riche : l'adresse nue d'une pièce scellée n'est pas
  téléchargée par la NSE (404) ; la bannière garde son texte.
- Une revue cryptographique tierce reste requise pour déclarer la construction
  sûre : l'assemblage (format Tink, liaison, dérivation) est vérifié par des
  vecteurs croisés, pas par une preuve.
