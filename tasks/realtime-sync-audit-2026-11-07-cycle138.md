# Cycle 138 — un retiré restait « ici », et le texte alternatif du fil ne descendait pas le Prisme

**Issues livrées** : #16654 (passerelle, lot A) et #7392 (web, lot B). **Branche** : `claude/exciting-planck-t1dj8f`, PR #16661.
**Issues ouvertes en chemin** : #16655 (passerelle), #16659 (iOS).

Le cycle 137 datait du 2026-08-29 et ses surfaces (`apps/web/app/…`) ont quitté
le dépôt avec le legacy (#7668) ; son unique suivi actionnable
(`thirdPartyServicesConsentAt` hors de tout schéma) est soldé — mesuré, un
témoin le garde (`consent-third-party-services-requirement-removed.test.ts`).
Ce cycle repart donc d'un balayage, pas d'un suivi.

## La méthode : interroger le contrat dans la direction que personne ne garde

Le dépôt a TROIS gardes sur le contrat Socket.IO :

| garde | ce qu'elle demande |
|---|---|
| `types/socketio-events.test.ts` | la FORME de chaque nom déclaré |
| `ci/socket-event-name-gate.test.ts` | tout nom épelé par iOS ou Android appartient-il au contrat ? |
| `ci/socket-event-emitter-gate.test.ts` | tout nom déclaré a-t-il un ÉMETTEUR ? |

Aucune ne demande **qui l'ÉCOUTE** — c'est-à-dire la question du cycle 122,
« un résolveur qui élit la bonne traduction n'a corrigé personne tant qu'on ne
sait pas QUI l'affiche », posée au contrat entier.

Balayage (commentaires dépouillés, littéraux ET constantes `SERVER_EVENTS.X`,
13 932 fichiers de `apps/ios`, `packages/MeeshySDK/Sources`, `apps/web/src`,
`apps/android`) : **dix orphelins sur 167**.

| orphelin | ce que c'est |
|---|---|
| `talkie:incoming` · `:chunk` · `:ended` | le relais serveur du talkie-walkie est écrit, aucun client ne le reçoit |
| `call:translation-requested` · `:translation-enabled` · `:transcription-result` | déclarés avant leurs lecteurs |
| `link:message:new` | son unique auditeur était le legacy web, parti avec lui (#7668) ; `message:new` voyage à côté, donc rien n'est perdu — mais le doc-comment de `linkMessageEmissions` AFFIRME encore cet auditeur |
| `media:alt-translation-updated` | **jumelle déclarée** de `media:caption-translation-updated`, câblée sur web ET iOS — #7392 |
| `user:preferences-community-reordered` | émis par le correctif du cycle 128, dont le symptôme était « un glisser-déposer sur un appareil n'atteignait aucun autre » : aucun client ne l'écoute, donc le symptôme survit |
| `agent:admin-event` | relais d'administration |

Deux de ces lignes sont des correctifs dont la valeur n'atteint aucun lecteur,
et c'est exactement la classe que la garde manquante attraperait à la
naissance. **La garde est une issue à part, pas une ligne de ce journal.**

> Le balayage a d'abord été écrit SANS dépouiller les commentaires et rendait
> neuf orphelins : `user:preferences-community-reordered` manquait, nommé dans
> un commentaire Android qui explique pourquoi Android ne l'écoute pas. Une
> mention en prose vaut preuve d'écoute pour un `grep` — c'est le piège que le
> gate d'émetteur documente déjà, et il se paie dans les deux sens.

## Le lot livré

Le balayage n'a pas trouvé #16654 ; trois audits lancés en parallèle sur le
cycle de session, le broadcast des mutations et la chaîne de remise iOS l'ont
fait. Il est plus grave que les orphelins, et il est passé devant.

`endConversationMembership` éteint ce qu'un partant tenait de vivant dans le
fil PUIS l'en sort. Son inventaire en tenait **deux** — la position partagée,
la participation d'appel — et pas le troisième, le registre « ici » (#8892,
#9061), arrivé après cette convergence. **Il ne pouvait pas y figurer** : toute
la surface du registre était clavetée par SOCKET, donc aucune route ne savait
rétracter un spectateur (mesuré : deux fichiers de `services/gateway/src/`
citaient le registre).

| moitié | ce qui partait | ce qui la referme |
|---|---|---|
| le RELAIS vivant | `viewing:activity` ne revérifiait que son instantané en mémoire, quand le signal revient toutes les 2 s : un retiré annonçait « je suis ici, maintenant » | `resolveParticipant` après le limiteur, puis rétractation + expiration de room |
| l'ÉTAT SERVEUR | `viewersOf` nommait le retiré à tout pair ouvrant le fil ensuite — **sans la coopération d'aucun client** | `retractViewingForDepartedMember`, appelé AVANT l'éviction |

La frappe avait reçu cette garde (#5947, et son commentaire énonce le défaut
mot pour mot) ; le regard non — il est arrivé après. **Une garde d'admission se
pose sur CHAQUE chemin, pas sur le plus ancien.**

### Ce qui a tenu les 40 témoins verts

Deux lacunes de HARNAIS, pas une inattention :

1. la fixture d'appartenance était une fermeture **FIGÉE** — rien ne pouvait
   retirer quelqu'un APRÈS un `viewing:start` réussi, donc précisément la seule
   chose que `activity()` n'a jamais eu à revérifier ;
2. le double de socket n'avait **pas de `leave`**. La room est une autorisation
   mise en cache (#5947) ; un double qui ne sait pas la quitter ne peut attester
   aucune expiration. Il passait aussi `rooms = []`, ce qui PROUVE au passage
   qu'`activity()` ne consultait ni la base ni les rooms : les témoins étaient
   verts sans qu'aucune room n'existe.

> **Une fixture immuable n'est pas neutre : elle choisit les questions qu'on
> peut poser.** Les trois cas négatifs de l'activité couvraient « la
> conversation n'a pas été annoncée », « elle a été quittée par `viewing:stop` »
> et « le statut en ligne est masqué » — trois façons dont le LECTEUR se retire,
> aucune dont le FIL le retire.

## Le lot B — le texte alternatif du fil descend le Prisme (#7392)

C'est l'orphelin `media:alt-translation-updated` du tableau ci-dessus, instruit
jusqu'au bout. Son type se déclare « **jumelle exacte** de
`MediaCaptionTranslationUpdatedEventData`, sur un champ DISTINCT » ; la légende
est câblée sur le web ET sur iOS, le texte alternatif sur personne.

Mais le canal muet n'était que la MOITIÉ du défaut, et la seconde est plus
grave : `FeedMedia` ne DÉCLARAIT ni `altLanguage` ni `altTranslations`. La
passerelle les sert (`postIncludes.ts`) ; le décodage les jetait. **Ce n'était
pas un résolveur à corriger en aval — la donnée était absente de la forme lue.**

| contenu de `PostMedia` | couple | le fil, avant |
|---|---|---|
| `caption` | `captionLanguage` / `captionTranslations` | descend le Prisme |
| `alt` | `altLanguage` / `altTranslations` | **servi BRUT** |

Le doc-comment de `resolveMediaCaption` ÉNUMÉRAIT les trois contenus depuis
#6280 — « `Post.content`, la légende, `alt` » — et deux seulement avaient un
résolveur. **Une énumération qui nomme trois choses et n'en outille que deux ne
rougit nulle part.**

Et c'est la seule chaîne qu'un lecteur d'écran PRONONCE. L'en-tête de
`apps/web/src/lib/api/prism.ts` nomme exactement ce défaut comme sa raison
d'exister — « un lecteur d'écran qui prononce un texte français avec une voix
anglaise est ce défaut-là, rendu audible ». La seule chaîne du dépôt à ne pas
traverser `served()` était celle-là.

**La jumelle était DANS LE MÊME CLIENT** : la conversation descend déjà ce
couple par la loi partagée `resolveMediaDescription` (#12333,
`lib/view/media.ts` → `electDescription`). Seul le FIL ne le faisait pas — la
forme la plus discrète de « cette entité a-t-elle une jumelle ? », puisqu'il n'y
avait ni autre table, ni autre site, ni autre moment : le même client, deux
surfaces.

### Le choix discutable, dit à voix haute

`resolveMediaAlt` est une PROJECTION de `served()`, posée à côté de
`resolveMediaCaption` — **pas** un appel à `resolveMediaDescription`. Cette loi
fait concourir la description de l'auteur ET la transcription dans une seule
descente, ce qui est juste pour une bulle, où une seule description est rendue.
Le fil rend la légende et la transcription en texte VISIBLE, ailleurs : y verser
la transcription ferait prononcer au lecteur d'écran ce que l'écran montre déjà.

### Jusqu'au PIXEL

`lang` est posé sur l'image, parce que c'est lui qui gouverne la VOIX. Seulement
sur un texte servi ET une langue connue : sur une image décorative il ne
qualifierait rien, et le repli « Image 1 sur 3 » des réels est composé dans la
langue de l'INTERFACE, donc déjà prononcé par la bonne voix. **Suivre une donnée
jusqu'à son consommateur s'arrête un cran trop tôt — la suivre jusqu'au pixel**,
et ici jusqu'au SON.

## Gates

| gate | résultat |
|---|---|
| `ConversationViewingHandler` + `endConversationMembership` + `MeeshySocketIOManager` + `StatusHandler` | **566 verts** (11 témoins neufs, tous vus ROUGES) |
| suite gateway complète (`bun run test`) | **39 376 verts**, 17 rouges |
| les 17 rouges | **PRÉ-EXISTANTS** — vérifiés identiques sur `origin/dev` nu (EXIF/HEIF/AVIF : sharp sans ces codecs dans le conteneur) |
| `tsc --noEmit -p tsconfig.json` (passerelle) | **0 erreur**, code de sortie lu DIRECTEMENT (jamais au travers d'un pipe — leçon du cycle 109) |
| `detached-promise-catch-sweep`, `server-emit-door-sweep`, `presence-visibility-viewer-aware-guard`, `route-manifest-ratchet` | verts |
| `bun test` sur `apps/web` | **29 802 verts** (25 témoins neufs, tous vus ROUGES), 1 rouge |
| le rouge du web | **PRÉ-EXISTANT** — `act-leak-guard`, un méta-témoin qui relance bun en sous-processus ; identique sur `origin/dev` nu |
| `bun run type-check` (web), `scripts/check-law-literals.sh` | **0 erreur**, vert |
| gates navigateur (`check-feed-media`, `check-reels`) | **non concluants dans ce conteneur** — ils veulent un `chromium_headless_shell` absent et des ressources rendues en 404 ; échouent identiquement sur `origin/dev` nu, la CI les porte |

## Suivi MESURÉ, une issue chacun

- **#16655 — la file hors ligne rejoue les adresses NUES d'une pièce signée par
  lecteur.** Forme du cycle 125 : une charge, deux sorties, la garde sur l'une.
  Son témoin de référence (`emitAttachmentUpdated.readerSigned.test.ts`)
  EXERCE le défaut à chaque exécution — `connectedUsers: new Map()` met ses deux
  participants hors ligne — et n'assert que sur `emitted`.
- **#16659 — deux passes de drain concurrentes désordonnent l'arriéré iOS**, et
  le réordre est réécrit DANS le fil local (`next.createdAt = api.createdAt`).
  Non développé ici : aucun Xcode dans le conteneur, et un lot iOS se prouve par
  `./apps/ios/meeshy.sh test`.
- **#7392 est LIVRÉE dans ce cycle** (lot B), pas reportée : le balayage l'a
  retrouvée ouverte depuis le 2026-09-21, et son critère de fin était déjà
  écrit. Voir § « Le lot B » ci-dessous.
- **La garde manquante** — « tout événement serveur déclaré a un consommateur
  client, ou est déclaré non consommé AVEC sa raison, vérifié dans les DEUX
  sens » — reste à poser, sur le modèle de `RESERVED_SERVER_EVENTS` (la
  réservation vit dans le CONTRAT, à côté des noms qu'elle qualifie, jamais dans
  une table d'exceptions cachée au fond d'un test).
- **Deux défauts voisins, relevés et NON corrigés dans ce lot**, chacun à
  instruire : `activity()` réutilise le `blockRelated` mis en cache à
  l'ouverture quand `retract()` le relit frais — un blocage posé entre les deux
  laisse passer l'activité PUIS retient le `viewing:stop`, épinglant « est ici »
  chez le bloqueur pour le reste de sa session ; et `broadcastReadStatus` évente
  sur `isActive: true` plutôt que `PARTICIPATION_VIVANTE`, que
  `_joinUserConversations` et `resolveParticipant` excluent tous deux.
