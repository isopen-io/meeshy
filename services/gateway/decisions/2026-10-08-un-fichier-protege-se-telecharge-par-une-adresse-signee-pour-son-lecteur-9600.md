## 2026-10-08 : Un fichier protégé se télécharge par une adresse signée pour son lecteur (#9600)

Décision du porteur du 2026-10-08 sur #9600 : option A, **adresses signées par lecteur**, rétrocompatible. Complète `2026-10-07-un-contenu-qui-disparait-ne-sort-pas-de-meeshy-la-copie-ne-peut-pas-etre-moins-protegee-que-sa-source-9572.md` § « L'échéance d'un lecteur ferme le fichier là où il est connu (#9589) », dont elle étend la loi à la route sans identité.

### Ce qui restait ouvert

`GET /attachments/file/*` sert un fichier par son chemin, sans jeton : une `<img>`, un `AVPlayer`, l'extension de notification n'en envoient aucun. Elle ne juge que la vie GLOBALE du message porteur (`fileRouteVerdict.ts`). Un lecteur dont la flamme est éteinte, qui a ouvert sa vue unique, ou quiconque a obtenu l'adresse, retélécharge les octets tant qu'un autre lecteur les garde vivants — sept jours pour une vue unique qu'un membre n'ouvre jamais.

### Comment les clients obtiennent une adresse (relevé du 2026-10-08)

| client | adresse absolue | chemin à barre initiale | clé nue |
|---|---|---|---|
| web (`apps/web/src/lib/api/media-url.ts`, ~60 consommateurs) | **recomposée** si elle porte une clé datée : la chaîne de requête est PERDUE | **recomposé** si `/api[/v1]/attachments/file/<clé datée>` : `?…` est ENCODÉ dans le chemin (404) ; tout autre chemin est posé derrière la base, intact | recomposée |
| iOS (`MeeshyConfig.resolveMediaURL`) | telle quelle | posé derrière l'origine, intact | recomposée (`?` encodé) |
| NSE iOS (`resolveRemoteMediaURL`) | telle quelle | posé derrière l'origine | — |
| Android natif gelé (`MediaUrlResolver.kt`) | telle quelle | posé derrière l'origine | recomposée |

Aucun client ne fabrique d'adresse à partir d'un identifiant, ni de variante `_<n>w.webp` : tous consomment `fileUrl`, `thumbnailUrl`, `imageVariants[].url` et `translations[lang].url` tels que servis. **Mais une signature en chaîne de requête sur la route de flux aurait été perdue ou cassée par le web** sur tout original, miniature et variante.

### Décision

**La signature vit dans le CHEMIN d'une route distincte**, que les quatre résolveurs laissent passer telle quelle :

    GET /api/v1/attachments/signed/<pièce>.<participant lecteur>.<échéance>.<mac>/<clé de stockage encodée>

- **MAC** : HMAC-SHA-256 sous une clé du serveur, sur `meeshy:attachment-file:v1 | clé de stockage | pièce | participant | échéance`, tronqué à 128 bits (le jeton tient dans `maxParamLength` = 100 de Fastify), comparé sous sa forme base64url canonique en temps constant (`readerFileSignature.ts`).
- **Lecteur** : la ligne `Participant` (donc une conversation), jamais un `User.id` — un invité de lien en a une aussi.
- **Échéance** : de 6 h à 7 h, arrondie au pas d'une heure — la même adresse est servie pendant tout le pas, pour que les caches clients clés sur l'adresse complète (`DiskCacheStore.fileKey`, seau `medias` du service worker) ne voient pas une adresse neuve à chaque relecture. Elle n'est PAS la garde de lecture : elle borne ce que vaut une adresse qui a fui vers un tiers.
- **La route rejoue, à chaque requête** : la signature (et refuse une échéance plus lointaine que ce que le serveur émet), la vie globale du fichier (`resolveFileRouteVerdict`), puis celle de CE lecteur — membre actif de la conversation du message, message vivant, échéance personnelle non passée (`resolveSignedReaderVerdict`, la loi des routes par identifiant, `readerStillReadsBytes`). Tout refus est un 404 identique à celui d'un fichier absent. Mêmes octets, mêmes en-têtes (CORP, nosniff, garde SVG, plages) que la route par chemin, sous le cache que le fichier autorise (`no-store` / `no-cache`).
- Servie sous `/api/v1` seulement : aucune adresse de cette forme n'a jamais été persistée.

**Ce qui est signé** : la pièce dont la nature, lue sur les colonnes du message porteur ET sur cette pièce par `contentExitLawOfSource`, n'est pas ordinaire — vue unique, flamme à durée, flamme après lecture, copie transférée d'une flamme. Une colonne non chargée ferme : la pièce est signée. Les quatre adresses d'une pièce : original, miniature, variantes WebP, pistes traduites `translated/…`.

**Ce qui ne l'est pas** :
- le contenu ordinaire — même objet rendu, caches et CDN inchangés ;
- **le flou seul** : la loi de sortie dit qu'il n'est pas une nature ; il ne disparaît pour personne, son lecteur le lit toujours, et « quiconque a obtenu l'adresse » vaut pour lui exactement comme pour le contenu ordinaire, que le porteur garde nu ;
- une adresse par identifiant (copie dont la source est tue, `forwarded-attachment-urls.ts`) : elle est déjà authentifiée et jugée par lecteur ;
- tout hôte tiers, le magasin statique, une référence `static:`.

**Où elle est posée dans ce lot** : les deux charges REST qui servent un lecteur connu — la liste `GET /conversations/:id/messages` et le rattrapage `GET /sync` (qui charge désormais le bloc de protection dès que les pièces sont demandées, sans quoi `?fields=messages.attachments` aurait signé toute pièce, ordinaire comprise). Les autres sites (temps réel `message:new` émis par room, `message:edited`, `attachment:updated`, détail, fil, favoris, recherche, aperçu de transfert) sont #9646.

### La transition, et sa mesure

L'adresse NUE d'un fichier dont **tous** les porteurs vivants sont protégés (`readerBound` sur le verdict par chemin — un seul porteur ordinaire vivant suffit à le délier, ses lecteurs ayant légitimement l'adresse nue des mêmes octets ; une ligne en cours d'envoi aussi) **répond encore**. Les charges déjà livrées la portent (iOS garde les messages 6 mois, le web 7 jours), et les sites de #9646 la servent encore. Chaque usage laisse UNE ligne de journal sans identité :

    attachment-file:unsigned-reader-bound  { route, platform, version, enforced }

— jamais la clé de stockage (elle porte le `User.id` de l'auteur), jamais l'adresse, jamais l'IP. **Retrait** : #9647, à zéro usage mesuré au moins 14 jours après #9646, par `ATTACHMENT_URL_SIGNATURE_ENFORCE=true` (staging puis production) ; la route refuse alors l'adresse nue d'un fichier protégé, 304 compris. Jamais de bascule sèche (#9223).

**Pourquoi « tant que mesuré » plutôt que « tant que le porteur vit »** : la seconde ne ferme rien — c'est exactement la loi d'aujourd'hui. La première ferme dès que les clients n'en dépendent plus, et se prouve.

### La clé

| variable | rôle |
|---|---|
| `ATTACHMENT_URL_SIGNING_KEY` | signe et vérifie — 32 octets en base64 strict (`openssl rand -base64 32`), DISTINCTE par environnement |
| `ATTACHMENT_URL_SIGNING_KEY_PREVIOUS` | vérifie seulement, pendant une rotation |
| `ATTACHMENT_URL_SIGNATURE_ENFORCE` | `true` au mot près : refuse l'adresse nue d'un fichier protégé (#9647) |

Rotation : nouvelle clé en courante, ancienne en précédente, retrait de celle-ci 7 h plus tard (durée de vie maximale d'une adresse). Absente : rien n'est signé, l'adresse d'avant est servie. Posée mais illisible : même effet, et une erreur journalisée une fois par processus, sans la valeur. Aucune clé n'est dans le dépôt : `infrastructure/envs/.env.example`, `services/gateway/.env.example`, `.env.staging.template` et les deux compositions (`${…:-}`) la documentent vide. Elle n'est pas « bloquante » au sens de `check-compose-required-vars.mjs` : sans elle le service ne ment pas, il sert comme avant.

### Alternatives rejetées

- **Signature en chaîne de requête sur la route de flux** : perdue (adresse absolue) ou encodée dans le chemin (adresse relative) par le résolveur web — mesuré ci-dessus. Il aurait fallu changer le web d'abord, et les coques Android déjà installées embarquent l'ancien résolveur.
- **Servir les pièces protégées par identifiant** (`/attachments/:id`, déjà jugé par lecteur) : la route exige un jeton, qu'une `<img>` ou un lecteur média n'envoient pas.
- **Un cookie de session sur la passerelle** : `Access-Control-Allow-Origin: *` sur les médias l'exclut, et l'origine web diffère de celle de la passerelle.
- **Signer toute pièce, ordinaire comprise** : adresse neuve chaque heure pour tout média du fil, caches et CDN perdus ; le porteur garde l'ordinaire tel quel.
- **Échéance courte (minutes)** : chaque relecture de liste rendrait une adresse neuve et les caches de 6 mois serviraient des adresses mortes plus souvent ; la garde réelle est la relecture par requête, pas l'échéance.
- **Dupliquer les octets à chaque transfert** (#9588) : non repris ici ; il découple source et copie mais ne ferme pas la relecture par le lecteur lui-même.

### Conséquences

- Rétrocompatible : aucune forme de requête ni de réponse ne change ; seule la VALEUR de `fileUrl`/`thumbnailUrl`/`url` d'une pièce protégée change, vers un chemin que les quatre résolveurs consomment tel quel. Une route ajoutée (`route-manifest.json`, catalogues `packages/shared/api` et `MeeshySDK/Networking/Endpoints` régénérés).
- Un média protégé rendu depuis un cache client après l'échéance de son adresse reçoit 404 jusqu'à la relecture suivante — ce que chaque client en fait est #9648.
- Le masquage PERSONNEL (historique effacé, supprimé pour moi) n'est pas rejoué par la route signée, comme par les routes par identifiant : la liste ne sert plus l'adresse, et celle déjà servie expire en 7 h au plus.
- Tant que #9647 n'est pas posé, le critère de fin de #9589 ne vaut que pour les adresses signées et par identifiant.

### Les gardes, et leurs témoins (pour l'audit adversarial)

| garde | site | témoin |
|---|---|---|
| MAC sur clé + pièce + lecteur + échéance, forme canonique, temps constant | `readerFileSignature.ts` `checkReaderFileToken` | `readerFileSignature.test.ts` (réécriture de chaque champ, autre écriture des mêmes bits, clé précédente, clé inconnue, sans clé, jeton malformé) |
| échéance émise plus lointaine que le serveur n'émet | idem, `beyond-lifetime` | idem |
| lecteur membre actif de la conversation du message | `attachmentReadVerdict.ts` `resolveSignedReaderVerdict` | `signedReaderVerdict.test.ts` |
| vie du porteur, échéance du lecteur, vue unique de la pièce | `memberReadVerdict` → `carrierMessageStillServesBytes`, `readerStillReadsBytes` | `signedReaderVerdict.test.ts`, `attachments-signed-file-route.test.ts` |
| chemin hors du volume, segment caché | `download.ts` `locateStoredFile` (partagé avec la route par chemin) | `attachments-download.test.ts` (traversée), `attachments-signed-file-route.test.ts` |
| refus uniforme (404) | `registerSignedFileRoute` | `attachments-signed-file-route.test.ts` |
| contenu ordinaire et flou jamais signés ; colonne absente ⇒ signé | `signedAttachmentUrls.ts` | `signedAttachmentUrls.test.ts`, `list-signed-attachment-urls.test.ts`, `sync-signed-attachment-urls.test.ts` |
| `readerBound` : tous les porteurs vivants protégés, aucun envoi en cours, colonne non lue ⇒ lié | `fileRouteVerdict.ts` | `fileRouteVerdict.test.ts` (faux magasin qui PROJETTE le `select`) |
| journal sans identité ; bascule au mot `true` ; 304 refusé sous bascule | `readerFileGate.ts`, `readerFileSignatureEnforced` | `attachments-signed-file-route.test.ts`, `readerFileSignature.test.ts` |

Ce lot outille ; il ne remplace pas un audit cryptographique tiers.

### Amendement du 2026-10-08 — après l'audit adversarial (L1-B, L1-C) et #9646

**Le jeton n'entre dans aucun journal (L1-B).** `redactReaderFileUrl` (`utils/redact-reader-file-url.ts`, sans dépendance) remplace tout ce qui suit `/attachments/signed/` — jeton, clé, requête — par `[redacted]` dans le chronométrage des requêtes lentes (extrait de `server.ts` vers `plugins/request-timing.plugin.ts` : un flux audio ou vidéo dure presque toujours plus de 2 s), le gestionnaire d'erreurs, la validation et le journal de requêtes. Traefik ne sait pas masquer un segment de chemin : l'adresse signée a son **routeur propre** (`gateway[-staging]-signed-files`, `PathPrefix(/api/v1/attachments/signed/)`, plus spécifique donc prioritaire) avec `observability.accessLogs=false`, en production et en staging (même Traefik). Le `docker-compose.yml` de l'hôte de production diverge du dépôt : ces libellés y sont à reporter à la main.

**La bascule sans clé est ignorée, bruyamment (L1-C).** `ATTACHMENT_URL_SIGNATURE_ENFORCE=true` sans `ATTACHMENT_URL_SIGNING_KEY` lisible refuserait tout média protégé sans rien signer ; refuser de démarrer couperait toute la passerelle pour une variable. Elle est donc ignorée, avec une erreur journalisée une fois par processus. La mesure d'usage de l'adresse nue porte `keyShape` : `signable` (arborescence datée, pistes `translated/`) ou `legacy` (jamais signée — son lecteur n'a aucune adresse signée vers laquelle migrer, elle se compte à part).

**Un seul prédicat d'admission (constat de sécurité moyen).** `fileReaderAdmission.ts` : actif, `bannedAt` absent ou nul, lien de partage d'entrée non échu (une lecture de liens en panne ferme tous les invités par lien). La garde de lecture (adresse signée ET routes par identifiant) et la remise des adresses signées l'appliquent l'une et l'autre ; la remise relit TOUJOURS ses destinataires, jamais la liste de l'appelant.

**#9646 — où l'adresse signée est servie désormais.**

| charge | lecteur | mécanisme |
|---|---|---|
| `message:new` (socket et REST/ZMQ) | chaque participant admis | `messageNewEmission.ts` (extrait des deux producteurs, hors budget) : pour une pièce qui se lit par lecteur, aucune diffusion de room, une émission par room personnelle |
| `message:edited` (socket, `broadcastMessageMutation` des trois routes REST) | idem, variante scellée conservée | `readerSignedPlanForMessageId` (relit cinq colonnes ; ligne introuvable ⇒ signe) |
| `message:attachment-updated` | idem | idem ; un plan illisible n'émet rien en direct plutôt que l'adresse nue |
| liste, `/sync` | le lecteur de la page | #9600 |
| détail d'une pièce, galerie | le lecteur | `signAttachmentsForReader` (relit porteurs ET pièces) ; le détail signé passe en `no-cache`, ETag sur l'adresse |
| fil de discussion, épinglés | le lecteur | `signMessagesAttachmentsForReader` |
| aperçu `forwardedFrom` | — | la pièce d'une source qui se lit par lecteur QUITTE l'aperçu (le lecteur de la copie n'est pas forcément membre de la source) |
| recherche de pièces, favoris, pousse | — | rien à signer : ils excluent déjà tout contenu protégé (`messageProtectionWhereExclusion`, `starredMessageVerdict`, `mediaMayTravel`) |

**Coût mesuré** (`readerSignedDelivery.test.ts`) : 1 000 destinataires, 1 000 émissions, ~4 Ko sérialisés chacune, ~17 ms de signature et sérialisation, pour les seuls messages protégés. La charge est construite une fois, seul `attachments` est recopié par lecteur : la variante « signer une fois par conversation, ne personnaliser que l'adresse » est celle-ci. Un socket présent dans la room sans être participant admis ne reçoit plus un message protégé en direct (il relira la page).

**Reste avant #9647** : la file hors ligne rejoue les charges enfilées telles quelles (adresses nues) ; les messages de lien (`linkMessageEmissions`) et le résumé d'appel édité (`broadcastMessageEdited`, jamais protégé) ne passent pas par la remise par lecteur. Suivi : #9646.
