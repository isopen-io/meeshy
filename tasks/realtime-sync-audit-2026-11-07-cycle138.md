# Cycle 138 — un membre retiré d'un fil y restait « ici », et y annonçait son activité

**Issue livrée** : #16654. **Branche** : `claude/exciting-planck-t1dj8f`.
**Issues ouvertes en chemin** : #16655 (passerelle), #16659 (iOS), #7392 (web, déjà ouverte le 2026-09-21 et retrouvée par le balayage).

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

## Gates

| gate | résultat |
|---|---|
| `ConversationViewingHandler` + `endConversationMembership` + `MeeshySocketIOManager` + `StatusHandler` | **566 verts** (11 témoins neufs, tous vus ROUGES) |
| suite gateway complète (`bun run test`) | **39 376 verts**, 17 rouges |
| les 17 rouges | **PRÉ-EXISTANTS** — vérifiés identiques sur `origin/dev` nu (EXIF/HEIF/AVIF : sharp sans ces codecs dans le conteneur) |
| `tsc --noEmit -p tsconfig.json` | **0 erreur**, code de sortie lu DIRECTEMENT (jamais au travers d'un pipe — leçon du cycle 109) |
| `detached-promise-catch-sweep`, `server-emit-door-sweep`, `presence-visibility-viewer-aware-guard`, `route-manifest-ratchet` | verts |

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
- **#7392 — le texte alternatif du fil web ne descend pas le Prisme** (ouverte
  le 2026-09-21, retrouvée par le balayage). `FeedMedia` ne déclare ni
  `altLanguage` ni `altTranslations`, donc la carte est jetée au décodage ;
  `altText` sort brut quand la légende, à deux lignes, descend le Prisme. La
  jumelle est **dans le même client** : la conversation le fait déjà
  (`electDescription` → `resolveMediaDescription`, #12333). Et le doc-comment de
  `apps/web/src/lib/api/prism.ts` nomme ce défaut comme sa raison d'exister —
  « un lecteur d'écran qui prononce un texte français avec une voix anglaise » —
  pour la seule chaîne qui ne le traversait pas.
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
