# Realtime sync audit — 2026-08-15 (continuous-improvement pass)

Passe ciblée sur le **rejeu hors ligne** (`RedisDeliveryQueue` +
`_drainPendingMessages`), la seule surface temps-réel que les audits
`2026-07-05` / `2026-07-11` n'avaient pas parcourue famille d'événements par
famille d'événements. Environnement Linux : gateway + `packages/shared`
testables, iOS/SDK non compilables ici (cf. findings #2–#4 du `2026-07-05`).

**Conclusion : un défaut réel trouvé, corrigé et mergé (PR #3012). Un candidat
adjacent écarté avec preuve** — détail ci-dessous pour éviter qu'un prochain
cycle ne le ré-instruise, ou pire, ne l'implémente.

## Méthode

Inventaire des familles d'`eventType` que la file de remise sait rejouer
(`packages/shared/types/delivery-queue.ts`), croisé avec l'inventaire des
événements serveur que la gateway diffuse **après** l'instant de l'envoi. Toute
diffusion post-envoi qui n'a pas d'entrée de file correspondante est un candidat :
la room `conversation:<id>` ne contient que des sockets **connectées**, donc un
émetteur qui ne s'adresse qu'à elle perd l'événement pour toujours — rien ne le
rejoue au reconnect et aucun client ne refetch spontanément.

Couvert avant ce cycle : `new`, `edited`, `deleted`, `reaction-added`,
`reaction-removed`, `attachment-reaction-added`, `attachment-reaction-removed`,
`pinned`, `unpinned`, `link-message`, `attachment-updated`.

## Défaut corrigé — `message:translation` n'avait aucun rejeu hors ligne

`MeeshySocketIOManager._handleTextTranslationReady`

La traduction NLLB atterrit **une à deux secondes après l'envoi**, par ZMQ, et
n'était diffusée qu'à `io.to(ROOMS.conversation(id))`. Or le `message:new` mis en
file de remise à l'ENVOI porte `translations: []` — la traduction n'existait pas
encore à cet instant. Séquence complète :

```
t0    Alice envoie « Hello ».  Bob est hors ligne.
      → message:new mis en file pour Bob, translations: []
t0+1s NLLB rend « Bonjour ».
      → io.to(conversation:<id>).emit(message:translation)   ← Bob n'y est pas
      → RIEN n'est mis en file pour Bob
t1    Bob se reconnecte.
      → le drain rejoue message:new … sans traduction
      → Bob lit « Hello », définitivement
```

Même classe que le défaut que `emitAttachmentUpdated` ferme pour la
transcription d'une note vocale (`eventType: 'attachment-updated'`), jamais
traitée côté TEXTE : le Prisme Linguistique devenait fonction de la
**connectivité** du lecteur, pas de ses préférences de langue.

**Livré** : `eventType: 'translation'`, rejoué comme `MESSAGE_TRANSLATION` par
`_drainedEventName`, `dedupKey` scopé à `messageId:targetLanguage` (l'identité de
dédup par défaut `(messageId, eventType)` est MUTABLE pour tout type ≠ `'new'` —
sans clé par langue, chaque nouvelle langue supersède la précédente en place et
le lecteur hors ligne ne converge que sur la dernière arrivée). PR #3012,
squash-mergée (`cbdf124b`). CI : 15 checks, tous verts.

## Candidat écarté — la 2e audience de `message:translation`

**Hypothèse initiale** (formulée dans la section « Future Considerations » de la
PR #3012, avant instruction) : `message:translation` devrait aussi chaîner les
rooms PERSONNELLES des participants, comme `emitAttachmentUpdated` le fait pour
sa 2e audience — « iOS ne joint `conversation:<id>` qu'à l'ouverture du fil, donc
un lecteur resté sur la liste n'est dans AUCUNE room de conversation ».

**Pourquoi c'est faux ici, contrairement au cas de la pièce jointe** :

1. **Un lecteur connecté hors de la room n'a jamais reçu le message non plus.**
   `message:new` est room-scopé pour les DESTINATAIRES —
   `MessageHandler.broadcastNewMessage` n'émet vers une room personnelle que
   pour l'EXPÉDITEUR (`ROOMS.user(senderUserId)`, payload avec `clientMessageId`).
   Un destinataire connecté mais hors du fil ne reçoit que `conversation:updated`
   (la ligne de liste). Son cache MESSAGE se remplit à l'ouverture du fil, par
   REST — et la réponse REST porte déjà **toutes** les traductions. Il n'y a donc
   rien à rattraper.
2. **La seule fenêtre résiduelle dure ~1–2 s.** Le seul lecteur dont le cache
   contient le message SANS sa traduction est celui qui avait le fil ouvert à
   l'arrivée du message puis l'a quitté (quittant la room) avant que NLLB ne
   réponde. C'est exactement la latence ZMQ d'une traduction texte.
3. **C'est là que le cas AUDIO diverge, et c'est ce qui justifie son fan-out.**
   Whisper puis NLLB+Chatterbox rendent l'audio traduit langue par langue,
   sur des secondes à des minutes — une fenêtre où quitter le fil est le
   comportement NORMAL, pas une coïncidence de 2 secondes.

**Coût du fix si on l'implémentait quand même** : un message d'une conversation
à N langues produit N événements `message:translation`. Room-scopé, chacun ne
touche que les lecteurs ayant le fil ouvert. Chaîné sur les rooms personnelles,
chaque participant reçoit les N — dont N−1 dans des langues qu'il ne lit pas
(le payload n'est pas filtrable par lecteur : les clients REMPLACENT leur carte
de traductions, cf. la même contrainte documentée sur `emitAttachmentUpdated`).
Ce serait une régression de bande passante, sur mobile, pour fermer une fenêtre
de 2 secondes déjà couverte par le rejeu hors ligne livré ci-dessus.

**Décision : ne pas implémenter.** La 3e audience (hors ligne) était le vrai
trou, et elle est fermée. La borne actuelle de la 2e — `emitConversationPreviewUpdate`
sous `PreviewUpdateScope` (`onlyIfLatestIs` + `onlyIfPreviewCarriesLanguage`),
qui sert la ligne de LISTE et elle seule — est le bon compromis, pas une
omission.

## Surfaces vérifiées correctes pendant ce cycle (ne pas re-vérifier)

- **`enqueueForOfflineParticipants`** — exclusion d'acteur sur les DEUX identités
  (participant id / user id), clé de file `userId ?? id` alignée sur la
  convention de room personnelle du drain, best-effort non-throwing.
- **`RedisDeliveryQueue.ENQUEUE_DEDUP_LUA`** — `'new'` immuable (retour 0),
  tout autre type superseded en place (LSET, retour 2). C'est ce qui interdit
  d'enrichir l'entrée `'new'` en file plutôt que d'ajouter un eventType, et ce
  qui rend la `dedupKey` par langue obligatoire.
- **`_emitDeliveryForDrainedMessages`** — filtre `eventType === 'new'` : aucune
  des familles de mutation (traduction comprise) ne peut faire avancer une coche
  d'accusé de réception.
- **Payload de file du chemin d'envoi** — `broadcastPayload` n'est PAS filtré par
  langue (le filtrage vit dans `_emitMessageNewByLanguage`, par groupe de
  langues, au moment de l'emit live). Une entrée en file est donc correcte pour
  tous les destinataires hors ligne, quelles que soient leurs langues.

## Environnement de vérification (parité CI)

```bash
bun install --ignore-scripts                                  # postinstall grpc-tools bloqué par le proxy
cd packages/shared && npx prisma generate --generator client
cd packages/shared && bun run build                           # sinon @meeshy/shared non résolu au type-check
cd services/gateway && bun x jest --config=jest.config.json    # 716 suites / 17553 tests
cd packages/shared && bun x vitest run                         # 54 fichiers / 1542 tests
```
