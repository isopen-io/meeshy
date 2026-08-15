# Realtime sync audit — 2026-08-15, cycle 23

Passe de continuous-improvement enchaînée directement sur le cycle 22
(`realtime-sync-audit-2026-08-15.md`, PR #3012/#3014/#3016, toutes mergées).
Environnement Linux : gateway + `packages/shared` testables, **pas de toolchain
Swift** — aucune modification SDK/iOS n'a donc été livrée ce cycle (elle serait
invérifiable ici, cf. règle « Verification Before Done »).

**Conclusion : un défaut réel trouvé, corrigé, testé. Cinq axes balayés à blanc
— documentés ci-dessous pour qu'un prochain cycle ne les ré-instruise pas. Deux
constats latents relevés et volontairement NON livrés, avec leur raison.**

## Méthode

Le cycle 22 s'est terminé sur une généralisation (Leçon 255) : « un event à
PLUSIEURS émetteurs doit être vérifié forme par forme », en notant que c'était
la **troisième récidive** de cette famille. Ce cycle a commencé par en faire un
balayage mécanique, puis a élargi quand l'axe est sorti vert.

### Axes balayés — RIEN à corriger (ne pas refaire)

1. **Événements serveur à émetteurs multiples.** 6 events ont >1 site
   d'émission dans `services/gateway/src` (`CONVERSATION_UNREAD_UPDATED` ×5,
   `MENTION_CREATED` ×3, `CONVERSATION_UPDATED` ×3, `MESSAGE_NEW`,
   `MESSAGE_EDITED`, `CONVERSATION_NEW`, `CONVERSATION_JOINED` ×2). Tous passent
   par l'émetteur TYPÉ (`SERVER_EVENTS` + map de payloads), donc TypeScript
   interdit la divergence de forme. **La leçon 255 n'est exploitable que sur les
   sites qui CONTOURNENT le typage** (nom d'event en littéral de chaîne) — c'est
   le vrai prédicat de détection, et il ne trouve aujourd'hui que des
   `EventEmitter` internes ZMQ, pas du Socket.IO.
2. **Audience des 6 sites `CONVERSATION_UNREAD_UPDATED`.** Les 2 sites
   mono-socket (`ConversationHandler` join, `_emitUnreadCountsSnapshot`
   reconnect) sont des INSTANTANÉS vers la socket qui vient d'arriver, pas des
   diffusions de mutation — mono-socket est correct. Le risque de badge périmé
   (une conversation lue ailleurs pendant l'absence) est couvert :
   `getUnreadCountsForUser` pré-remplit **toutes** les conversations à `0` avant
   comptage, donc un compteur retombé à zéro EST émis.
3. **Sémantique de dédup / d'ordre de `RedisDeliveryQueue`.** Le
   supersede-in-place (`LSET` au slot FIFO d'origine) désaccorde bien l'ordre
   des slots de l'ordre chronologique — mais `byEnqueuedAt` re-trie à `drain()`,
   `peek()` ET à l'éviction mémoire. Le scénario « épingle → désépingle →
   ré-épingle » (et son jumeau réaction ajout/retrait/ré-ajout) converge
   correctement. Vérifié aussi : `collapseCrossSliceDuplicates` restaure
   l'invariant une-entrée-par-identité au merge mémoire+Redis.
4. **Complétude du relais ZMQ, 3 sauts.** `ZmqMessageHandler` émet 21 events
   internes ; `ZmqTranslationClient` les ré-émet — les deux listes sont
   **identiques** (diff vide). Et chacun des 21 a ≥1 écouteur vivant hors du
   relais. Aucun résultat ML ne tombe dans le vide.
5. **Jumeaux du Prisme (liste de conversations).** `resolveLastMessagePreview`
   (TS) et `MeeshyConversation.resolvedLastMessagePreview` (Swift) implémentent
   la MÊME boucle par rang, conforme à la règle #3 de `CLAUDE.md`. Le web ne
   réimplémente rien (`formatLastMessage` délègue). Les 3 émetteurs REST/socket
   de la paire `lastMessageTranslations` / `lastMessageOriginalLanguage`
   l'envoient toujours ENSEMBLE (la carte exclut la langue d'origine : sans le
   champ de langue, le lecteur serait rétrogradé d'un rang) et calculent
   `viewerLanguages` par le même `resolveUserLanguagesOrdered` avec
   `deviceLocale`.

## Défaut corrigé — le rejeu hors ligne d'une traduction ignorait le Prisme du lecteur

`MeeshySocketIOManager._handleTextTranslationReady` →
`enqueueForOfflineParticipants`

C'est le cycle 22 lui-même qui a introduit ce chemin (`eventType: 'translation'`,
PR #3012). Il ferme le bon trou — la traduction n'atteignait jamais un lecteur
hors ligne — mais il l'a fait **sans filtre de langue**, alors que son jumeau
VIVANT en a un depuis toujours.

Les deux audiences du même événement, côte à côte dans la même fonction :

| audience | bornage |
|---|---|
| ligne de liste (`emitConversationPreviewUpdate`) | `onlyIfPreviewCarriesLanguage: targetLanguage` |
| file hors ligne (`_enqueueForOfflineParticipants`) | **aucun** — tous les absents |

NLLB rend une traduction **par langue de lecture** de la conversation. Pour une
conversation à L langues et P participants absents, chaque message déposait donc
`L × P` entrées de traduction là où `P` suffisent : un lecteur ne peut afficher
qu'une langue de SON prisme (règle du Prisme), les `L−1` autres sont illisibles
pour lui et ne seront jamais rendues.

Ce que ça coûtait, au-delà de l'octet :

- la file hors ligne porte **aussi les vrais messages** (`message:new`). La
  diluer d'un facteur L rapproche d'autant la purge par TTL et allonge la rafale
  rejouée au reconnect (`drain()` rend tout en un bloc) ;
- le repli mémoire est **plafonné à 50 entrées par utilisateur** et évince le
  plus ancien. Pendant une panne Redis, une conversation à 5 langues remplit ce
  plafond ~5× plus vite — et l'éviction sacrifie de **vrais messages** au profit
  de traductions que leur destinataire ne peut pas lire.

**Livré** : paramètre `restrictToReadersOfLanguage` sur
`OfflineParticipantQueueParams`. Le prédicat est l'**appartenance au prisme
ordonné**, jamais « la langue de tête » — un lecteur de prisme `['de','en']`
garde son entrée `en`, qui est son repli de rang 2 le jour où la traduction
allemande échoue. Filtrer sur la tête échangerait de la bande passante contre
une régression du Prisme.

Détails qui font la correction :

- **Aucune réimplémentation de l'échelle** (règle `CLAUDE.md`) : composition de
  `resolveUserLanguagesOrdered` (prisme in-app ordonné, deviceLocale au rang 4)
  et `resolveParticipantLanguage` (repli `Participant.language` — le seul signal
  qu'un invité de lien partagé possède, faute de ligne `User`).
- **Échec OUVERT** : prisme non résoluble ⇒ on met en file, comme avant. Une
  entrée de trop est invisible ; une traduction perdue ne l'est pas.
- **Normalisation des DEUX côtés** de la comparaison (`'PT-BR'` → `'pt'`) :
  comparer une langue cible brute à un prisme normalisé raterait précisément le
  lecteur qu'on cherche à servir.
- **Chemin chaud intact** : le `select` élargi (langue + préférences) n'est payé
  que par le chemin restreint. `broadcastNewMessage`, jamais restreint, garde sa
  liste pré-chargée et sa projection à deux colonnes.

**Sûreté du filtrage vérifiée côté client** : les clients **fusionnent** la carte
de traductions (web `translation.service.ts` met en cache par
`messageId_targetLanguage`), ils ne la remplacent pas — livrer une seule langue
ne détruit donc pas les autres. Et l'affordance « explorer d'autres langues » du
Prisme n'est pas servie par cette carte poussée mais par une requête explicite
(`translation:request`, dont le cycle 22 a réparé la branche cache), donc rien
ne la casse.

**Tests** : `src/__tests__/unit/socketio/offlineParticipantQueue.test.ts` (9 cas,
nouveau fichier — l'unité n'avait AUCUN test direct avant ce cycle). Couvre le
filtrage, le maintien du rang 2, l'invité anonyme, l'échec ouvert, la
normalisation, la non-régression du chemin non restreint et de sa projection.

**Validation** : 719/719 suites, 17 588/17 588 tests, `tsc --noEmit` propre.

## Constats latents — relevés, NON livrés

1. **Le jumeau Swift ne défend pas les normalisations que le jumeau TS défend.**
   `resolveLastMessagePreview` (TS) minusculise les CLÉS de traductions à la
   lecture et ignore les valeurs vides ; `resolvedLastMessagePreview` (Swift)
   indexe `translations[lang]` directement et accepterait une valeur vide. Le
   contrat tient aujourd'hui **par la grâce du serveur**
   (`buildLastMessagePreviewTranslations` écrit `out[target]` en minuscules et
   saute les textes vides), pas par le client. C'est un invariant non défendu,
   pas un défaut vivant. **Non livré parce qu'il n'y a pas de toolchain Swift
   ici** : livrer une modification SDK invérifiable violerait la règle de
   vérification. À traiter par un cycle disposant d'un build iOS.
2. **`_emitUnreadCountsSnapshot` exclut les anonymes** (`if (!isAnonymous)`),
   alors que ses deux voisins immédiats dans la même fonction les servent
   explicitement (`_drainPendingMessages` draine par participant id ; le join de
   `ConversationHandler` émet le badge pour l'invité). L'exclusion est
   COHÉRENTE avec l'implémentation actuelle — la requête interne filtre sur
   `userId` seul et rendrait 0 ligne pour un `Participant.id`. **Non livré** :
   impact réellement marginal. Un invité de lien partagé est mono-appareil (le
   cas « lu sur un autre appareil » ne le concerne pas) et le drain reconstruit
   déjà ses badges ; il ne resterait que le cas purge-TTL. Le noter suffit.

## Points de conception confirmés (ne pas « corriger »)

- **La file Redis n'a pas de plafond par utilisateur**, contrairement au repli
  mémoire (50). Ce n'est pas un oubli : la borne est temporelle (TTL 48 h,
  balayée par `jobs/delivery-queue-cleanup.ts`), et plafonner en taille
  reviendrait à jeter de VRAIS messages. Durabilité choisie contre bornage —
  laisser tel quel. (Le défaut corrigé ci-dessus réduit d'ailleurs la pression
  qui rendait la question pressante.)
- `eslint src/` échoue dans ce dépôt sur une erreur de FORMAT de configuration
  (eslintrc vs flat config eslint 9) : elle survient avant la lecture du moindre
  fichier, donc indépendante de tout diff. Pré-existante.
