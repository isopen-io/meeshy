# DM vide silencieux — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un DM (`type: 'direct'`) créé sans message doit rester invisible et silencieux pour le destinataire (pas de notification, pas d'entrée dans `GET /conversations`) tant qu'aucun message n'a été échangé — visible uniquement pour son créateur — sans casser l'idempotence DM existante, le transfert de propriété existant, ni le fan-out socket dont dépendent déjà les clients.

**Architecture:** Un champ nullable `Conversation.firstMessageSentAt` (posé `null` explicitement à la création d'un direct, jamais backfillé sur les conversations existantes) sert de source de vérité unique. `Participant.role === 'creator'` (déjà existant, déjà source de vérité ailleurs dans le codebase) identifie qui voit le DM vide — avec repli automatique vers le comportement actuel (visible pour tous) quand aucun créateur n'est identifiable (DM créés hors `POST /conversations`). Aucune émission socket nouvelle n'est nécessaire au premier message : trois mécanismes client déjà existants matérialisent une conversation inconnue depuis `message:new` seul.

**Tech Stack:** Fastify 5, Prisma 6 + MongoDB, Socket.IO, Jest.

## Global Constraints

- Spec source de vérité : `docs/superpowers/specs/2026-08-04-notification-dismiss-and-silent-dm-visibility-design.md`, section « Problème 2 ». Chaque tâche ci-dessous cite le fichier:ligne exact de la version du spec au moment de l'écriture — si le code a bougé depuis, relire la section correspondante du spec avant d'implémenter.
- **Piège absent vs null (bloquant)** : `firstMessageSentAt: null` ne matche QUE les documents où le champ a été explicitement écrit `null` — jamais les documents où il est simplement absent (conversations créées avant la migration). Toute clause de visibilité doit être formulée en négatif : `NOT: { firstMessageSentAt: null }` ⇒ visible (absent OU non-null).
- Pas de booléen compagnon (`isEmpty`/`hasMessages`) à côté de `firstMessageSentAt` — `services/gateway/CLAUDE.md` : « No redundant boolean + timestamp pairs ».
- Ne jamais nicher une condition sur `Conversation.type`/`Conversation.firstMessageSentAt` À L'INTÉRIEUR d'un `participants.some` — ce sont des champs de `Conversation`, pas de `Participant`.
- Parité de test locale (bun) avant de committer une tâche gateway, par `services/gateway/CLAUDE.md` :
  ```bash
  cd packages/shared && npx prisma generate --generator client
  cd packages/shared && bun run build
  cd services/gateway && bun run test:coverage
  ```

---

### Task 1: Schema Prisma — champ `firstMessageSentAt`

**Files:**
- Modify: `packages/shared/prisma/schema.prisma:332` (modèle `Conversation`, juste après `lastMessageAt`)

**Interfaces:**
- Produces: `Conversation.firstMessageSentAt: DateTime | null` — consommé par les Tasks 2 à 6 via le client Prisma généré.

- [ ] **Step 1: Add the field**

Dans `packages/shared/prisma/schema.prisma`, modèle `Conversation` (ligne 313), insérer juste après la ligne `lastMessageAt DateTime @default(now())` (ligne 332) :

```prisma
  lastMessageAt DateTime @default(now())
  /// null tant qu'aucun message n'a été envoyé dans une conversation `direct`.
  /// Source de vérité unique pour la visibilité des DM vides (voir Prisme
  /// design doc 2026-08-04) — jamais backfillé sur les conversations
  /// existantes : le champ est ABSENT (pas `null`) sur tout document créé
  /// avant cette migration. Toute lecture doit tester en négatif
  /// (`NOT: { firstMessageSentAt: null }` ⇒ visible), jamais en positif.
  firstMessageSentAt DateTime?
```

- [ ] **Step 2: Regenerate the Prisma client and rebuild `packages/shared`**

```bash
cd packages/shared && npx prisma generate --generator client
cd packages/shared && bun run build
```

Expected: les deux commandes réussissent sans erreur — le client Prisma généré expose désormais `firstMessageSentAt` sur `Conversation`.

- [ ] **Step 3: Verify nothing broke**

```bash
cd services/gateway && bun run test:coverage
```

Expected: même score vert qu'avant (249/249 suites) — un champ nullable ajouté sans valeur par défaut ne doit rien casser tant qu'aucun code ne le lit/l'écrit encore.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(shared): add Conversation.firstMessageSentAt for silent empty-DM visibility"
```

---

### Task 2: `POST /conversations` — création silencieuse d'un DM vide

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts:1000-1170` (création, émission `CONVERSATION_NEW`, notifications d'invitation)
- Test: `services/gateway/src/__tests__/unit/routes/conversation-core.test.ts:1209` et `:2046` (mettre à jour), + un nouveau test dans le même `describe('POST /conversations', ...)` (`:1045`)

**Interfaces:**
- Consumes: `Conversation.firstMessageSentAt` (Task 1).
- Produces: aucune nouvelle interface publique — comportement de `POST /conversations` modifié pour `type === 'direct'` uniquement.

- [ ] **Step 1: Update the two existing tests that assert the old behavior**

Le test à la ligne ~1209 (« sends invitation notifications when notificationService is present », `type: 'direct'`) et celui à la ligne ~2046 (« uses username fallback when creator.displayName is null », `type: 'direct'`) assertent aujourd'hui que `createConversationInviteNotification` **est** appelée pour un `direct` fraîchement créé. Avec ce changement, ce n'est plus vrai — un direct sans message ne notifie plus B à la création. Remplacer l'assertion dans ces deux tests :

```ts
// AVANT (ligne ~1209 et ~2046, à retirer) :
expect(createInviteNotif).toHaveBeenCalled(); // ou notifMock.toHaveBeenCalled()

// APRÈS :
expect(createInviteNotif).not.toHaveBeenCalled();
```

Ajouter un commentaire au-dessus de chaque assertion modifiée : `// direct sans message : silencieux à la création, voir Prisme design doc 2026-08-04`.

- [ ] **Step 2: Write the failing test for the new group behavior (non-regression) and the narrowed emit**

Ajouter, dans `describe('POST /conversations', ...)` (`:1045`) :

```ts
it('still sends invitation notifications for group conversations', async () => {
  mockValidateSchema.mockReturnValue({ type: 'group', title: 'Team', participantIds: [OTHER_USER_ID] });
  const createInviteNotif = jest.fn().mockResolvedValue(undefined);
  fastify.notificationService = { createConversationInviteNotification: createInviteNotif };
  prisma.user.findMany.mockResolvedValue([
    { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
    { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
  ]);
  prisma.conversation.create.mockResolvedValue({
    id: CONV_ID, type: 'group', title: 'Team', createdAt: new Date(), participants: [],
  });

  await getCreateHandler(fastify)(makeRequest({ body: {} }), makeReply());

  expect(createInviteNotif).toHaveBeenCalled();
});

it('emits CONVERSATION_NEW only to the creator for a fresh direct conversation', async () => {
  mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
  prisma.user.findMany.mockResolvedValue([
    { id: USER_ID, displayName: 'Alice', username: 'alice', avatar: null },
    { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null },
  ]);
  prisma.conversation.create.mockResolvedValue({
    id: CONV_ID, type: 'direct', title: null, createdAt: new Date(), participants: [],
  });

  await getCreateHandler(fastify)(makeRequest({ body: {} }), makeReply());

  // `createMockFastify()` (ligne 208) route tout `io.to(room).emit(...)` à
  // travers UN SEUL `mockTo`/`mockEmit` partagé (`fastify._mockTo`/
  // `fastify._mockEmit`) — le mock ROOMS de ce fichier (ligne 135) donne
  // `ROOMS.user(id) === 'user:${id}'`. Un seul emit total pour ce test
  // (notificationService est `null` par défaut dans createMockFastify, donc
  // le chemin notification n'émet rien ici) confirme que seul le créateur a
  // reçu conversation:new.
  expect(fastify._mockEmit).toHaveBeenCalledTimes(1);
  expect(fastify._mockTo).toHaveBeenCalledWith(`user:${USER_ID}`);
  expect(fastify._mockTo).not.toHaveBeenCalledWith(`user:${OTHER_USER_ID}`);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- conversation-core.test.ts`
Expected: FAIL sur les deux tests modifiés (le code actuel appelle encore `createConversationInviteNotification` pour un direct) et sur le nouveau test d'émission narrowée (le code actuel émet à tous les participants).

- [ ] **Step 4: Write the minimal implementation**

Dans `services/gateway/src/routes/conversations/core.ts`, au `prisma.conversation.create` (ligne ~1000), ajouter `firstMessageSentAt: null` **explicitement** pour un direct — important : Prisma/MongoDB omet le champ si on ne le pose pas, ce qui le laisserait ABSENT plutôt qu'explicitement `null` (voir Global Constraints) :

```ts
      const conversation = await prisma.conversation.create({
        data: {
          identifier: finalIdentifier,
          type,
          title,
          description,
          communityId: communityId || null,
          ...(isBroadcast ? { isAnnouncementChannel: true, defaultWriteRole: 'admin' } : {}),
          ...(type === 'direct' ? { firstMessageSentAt: null } : {}),
          participants: {
            create: [
              // ... inchangé ...
```

Puis, dans le bloc d'émission socket (autour de `core.ts:1106-1133`), restreindre la liste des destinataires de l'`emit` (**pas** de l'auto-join, qui reste universel) :

```ts
          const allParticipantIds = [userId, ...uniqueParticipantIds];
          // L'auto-join room reste universel pour TOUS les participants —
          // sans quoi B ne recevrait même pas le message:new de son premier
          // message (voir Prisme design doc 2026-08-04, invariant explicite).
          for (const participantId of allParticipantIds) {
            socketManager.joinUserToConversationRoom(participantId, conversation.id).catch(
              (err: unknown) => logger.error('Failed to auto-join participant to new conversation room', { participantId, error: err })
            );
          }
          const conversationNewPayload = {
            conversationId: conversation.id,
            conversationType: type,
            title: displayTitle,
            creatorId: userId,
            participantIds: allParticipantIds,
            createdAt: conversation.createdAt instanceof Date
              ? conversation.createdAt.toISOString()
              : String(conversation.createdAt)
          };
          // Un direct fraîchement créé (0 message) reste silencieux pour les
          // autres participants — seul le créateur voit sa conversation
          // vide apparaître immédiatement.
          const emitParticipantIds = type === 'direct' ? [userId] : allParticipantIds;
          for (const participantId of emitParticipantIds) {
            io.to(ROOMS.user(participantId)).emit(
              SERVER_EVENTS.CONVERSATION_NEW,
              conversationNewPayload
            );
          }
```

Enfin, dans le bloc de notification d'invitation (autour de `core.ts:1141`), sauter entièrement les directs :

```ts
      const notificationService = fastify.notificationService;
      if (notificationService && uniqueParticipantIds.length > 0 && type !== 'direct') {
        try {
          // ... inchangé ...
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- conversation-core.test.ts`
Expected: PASS sur tous les tests du fichier, y compris les deux modifiés et les deux nouveaux.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts \
        services/gateway/src/__tests__/unit/routes/conversation-core.test.ts
git commit -m "fix(gateway): silence conversation:new and invite notification for empty direct DMs"
```

---

### Task 3: `POST /conversations` — chemin de dédoublonnage (destinataire réinitie lui-même)

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts:943-976` (bloc `existingDirect`)
- Test: `services/gateway/src/__tests__/unit/routes/conversation-core.test.ts` (nouveau test dans `describe('POST /conversations', ...)`)

**Interfaces:**
- Consumes: `Conversation.firstMessageSentAt` (Task 1).
- Produces: rien de nouveau côté interface — comportement additionnel sur le chemin 200 existant.

- [ ] **Step 1: Write the failing test**

```ts
it('flips firstMessageSentAt and notifies the creator when the recipient re-initiates a silent empty DM', async () => {
  mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
  const existingDirect = {
    id: CONV_ID,
    type: 'direct',
    title: null,
    createdAt: new Date('2026-08-01'),
    firstMessageSentAt: null,
    participants: [
      { userId: OTHER_USER_ID, role: 'creator' },
      { userId: USER_ID, role: 'member' },
    ],
  };
  prisma.conversation.findFirst.mockResolvedValue(existingDirect);
  prisma.conversation.updateMany.mockResolvedValue({ count: 1 });

  await getCreateHandler(fastify)(makeRequest({ body: {} }), makeReply());

  expect(prisma.conversation.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id: CONV_ID, firstMessageSentAt: null }),
      data: expect.objectContaining({ firstMessageSentAt: expect.any(Date) }),
    })
  );
});

it('does not flip firstMessageSentAt when the caller is already the creator (re-fetching own empty DM)', async () => {
  mockValidateSchema.mockReturnValue({ type: 'direct', participantIds: [OTHER_USER_ID] });
  const existingDirect = {
    id: CONV_ID,
    type: 'direct',
    title: null,
    createdAt: new Date('2026-08-01'),
    firstMessageSentAt: null,
    participants: [
      { userId: USER_ID, role: 'creator' },
      { userId: OTHER_USER_ID, role: 'member' },
    ],
  };
  prisma.conversation.findFirst.mockResolvedValue(existingDirect);

  await getCreateHandler(fastify)(makeRequest({ body: {} }), makeReply());

  expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- conversation-core.test.ts`
Expected: FAIL — `prisma.conversation.updateMany` n'est pas encore appelé sur ce chemin.

- [ ] **Step 3: Write the minimal implementation**

Remplacer le bloc `if (existingDirect) { return sendSuccess(...) }` (`core.ts:975-978`) par :

```ts
        if (existingDirect) {
          const callerParticipant = existingDirect.participants.find((p: any) => p.userId === userId);
          const creatorParticipant = existingDirect.participants.find((p: any) => p.role === 'creator');
          const isEmptyDirect = existingDirect.type === 'direct' && !existingDirect.firstMessageSentAt;

          if (isEmptyDirect && creatorParticipant && callerParticipant?.role !== 'creator') {
            // Le destinataire silencieux réinitie lui-même la conversation —
            // intention mutuelle aussi explicite qu'un message. On la rend
            // visible désormais des deux côtés (Prisme design doc 2026-08-04).
            const flip = await prisma.conversation.updateMany({
              where: { id: existingDirect.id, firstMessageSentAt: null },
              data: { firstMessageSentAt: new Date() }
            });
            if (flip.count > 0) {
              existingDirect.firstMessageSentAt = new Date();
              try {
                const socketIOHandler = fastify.socketIOHandler;
                const io = socketIOHandler?.getManager()?.getIO();
                if (io && creatorParticipant.userId) {
                  io.to(ROOMS.user(creatorParticipant.userId)).emit(SERVER_EVENTS.CONVERSATION_NEW, {
                    conversationId: existingDirect.id,
                    conversationType: existingDirect.type,
                    title: existingDirect.title,
                    creatorId: creatorParticipant.userId,
                    participantIds: existingDirect.participants.map((p: any) => p.userId).filter(Boolean),
                    createdAt: existingDirect.createdAt instanceof Date
                      ? existingDirect.createdAt.toISOString()
                      : String(existingDirect.createdAt)
                  });
                }
              } catch (broadcastError) {
                logger.error('error broadcasting CONVERSATION_NEW on DM reinitiation', { error: broadcastError });
              }
            }
          }

          return sendSuccess(reply, {
            ...existingDirect,
            title: existingDirect.title || null
          }, { statusCode: 200 });
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- conversation-core.test.ts`
Expected: PASS sur les deux nouveaux tests et l'ensemble du fichier (pas de régression sur les tests d'idempotence DM existants).

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts \
        services/gateway/src/__tests__/unit/routes/conversation-core.test.ts
git commit -m "fix(gateway): treat a recipient re-initiating a silent empty DM as mutual intent"
```

---

### Task 4: `GET /conversations` — filtre de visibilité

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts:350` (juste après le bloc `withUserId`, avant la section pagination)
- Test: `services/gateway/src/__tests__/unit/routes/conversation-core.test.ts` (dans `describe('GET /conversations', ...)`, `:360`)

**Interfaces:**
- Consumes: `Conversation.firstMessageSentAt`, `Participant.role` (existant).

- [ ] **Step 1: Write the failing tests**

```ts
it('excludes an empty direct DM from a non-creator participant list', async () => {
  prisma.conversation.findMany.mockResolvedValue([]);
  const req = makeRequest({ query: {} });
  const reply = makeReply();

  await getListHandler(fastify)(req, reply);

  expect(prisma.conversation.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { type: { not: 'direct' } },
          { NOT: { firstMessageSentAt: null } },
          { participants: { some: { userId: USER_ID, role: 'creator' } } },
          { participants: { none: { role: 'creator' } } },
        ]),
      }),
    })
  );
});

it('applies the same empty-DM visibility gate when withUserId is provided', async () => {
  prisma.conversation.findMany.mockResolvedValue([]);
  const req = makeRequest({ query: { withUserId: OTHER_USER_ID } });
  const reply = makeReply();

  await getListHandler(fastify)(req, reply);

  expect(prisma.conversation.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.any(Array), // bloc withUserId existant, inchangé
        OR: expect.arrayContaining([
          { participants: { some: { userId: USER_ID, role: 'creator' } } },
        ]),
      }),
    })
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- conversation-core.test.ts`
Expected: FAIL — `whereClause.OR` n'existe pas encore.

- [ ] **Step 3: Write the minimal implementation**

Dans `services/gateway/src/routes/conversations/core.ts`, immédiatement après la fermeture du bloc `if (withUserId) { ... delete whereClause.participants; }` (ligne 350) et **avant** le commentaire `// Cursor-based pagination...` (ligne 352) :

```ts
      // Visibilité DM vide — Prisme design doc 2026-08-04. Ajouté APRÈS le
      // bloc withUserId ci-dessus (qui reconstruit whereClause.participants
      // /.AND) pour ne jamais être écrasé par lui : un OR à la racine du
      // whereClause se combine par ET implicite avec .AND/.participants,
      // quel que soit leur contenu.
      whereClause.OR = [
        { type: { not: 'direct' } },
        { NOT: { firstMessageSentAt: null } }, // absent (legacy) OU déjà posé ⇒ visible
        { participants: { some: { userId, role: 'creator' } } },
        { participants: { none: { role: 'creator' } } } // aucun créateur identifiable ⇒ comportement actuel
      ];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- conversation-core.test.ts`
Expected: PASS. Vérifier aussi qu'aucun test existant du fichier n'échoue (en particulier ceux du bloc `GET /conversations` déjà présents, `:360` et suivants — un `whereClause` désormais toujours porteur d'un `OR` peut invalider une assertion `expect.objectContaining` trop stricte ailleurs dans le fichier ; `objectContaining` tolère normalement les clés additionnelles, mais vérifier).

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts \
        services/gateway/src/__tests__/unit/routes/conversation-core.test.ts
git commit -m "fix(gateway): hide empty direct DMs from GET /conversations for non-creator participants"
```

---

### Task 5: `MessagingService.updateConversation` — flip gardé au premier message

**Files:**
- Modify: `services/gateway/src/services/messaging/MessagingService.ts:360-365`
- Test: `services/gateway/src/__tests__/unit/services/MessagingService.test.ts`

**Interfaces:**
- Consumes: `Conversation.firstMessageSentAt` (Task 1).

- [ ] **Step 1: Write the failing test**

Le fichier a déjà un `describe('handleMessage — runPostSaveSideEffects error paths', ...)` (chercher ce titre) avec un `beforeEach` qui pose `mockPrisma.conversation.findFirst`, `mockPrisma.conversation.findUnique`, `mockPrisma.participant.findUnique`, `mockPrisma.message.create`, et un test « logs error and still returns success when updateConversation fails (line 286) » qui invoque `service.handleMessage({ conversationId: testConversationId, content: 'Hello' }, testParticipantId)` puis flush les side effects fire-and-forget avec `await Promise.resolve()` répété. Ajouter, dans ce même `describe` (réutilise son `beforeEach`, ses constantes `testConversationId`/`testParticipantId` déjà déclarées dans le scope englobant) :

```ts
it('flips firstMessageSentAt when it is currently null, without touching the unconditional lastMessageAt bump', async () => {
  mockPrisma.conversation.update.mockResolvedValue({});
  mockPrisma.conversation.updateMany.mockResolvedValue({ count: 1 });

  const response = await service.handleMessage(
    { conversationId: testConversationId, content: 'Hello' },
    testParticipantId
  );

  // Flush background promises — mêmes 3 `await Promise.resolve()` que le
  // test voisin « logs error and still returns success when
  // updateConversation fails », runPostSaveSideEffects étant fire-and-forget.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  expect(response.success).toBe(true);
  expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { lastMessageAt: expect.any(Date) } })
  );
  expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id: testConversationId, firstMessageSentAt: null }),
      data: expect.objectContaining({ firstMessageSentAt: expect.any(Date) }),
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/gateway && bun run test -- MessagingService.test.ts`
Expected: FAIL — `prisma.conversation.updateMany` n'est pas encore appelé par `updateConversation`.

- [ ] **Step 3: Write the minimal implementation**

```ts
  private async updateConversation(conversationId: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() }
    });
    // Flip gardé, séparé du bump ci-dessus — celui-ci doit rester
    // inconditionnel, il pilote l'ordre de liste/le curseur/le delta sync
    // pour TOUS les messages, pas seulement le premier. Ne concerne que les
    // DM créés vides (Prisme design doc 2026-08-04) ; `count` à 0 signifie
    // "pas le premier message" ou "conversation non concernée" — no-op.
    await this.prisma.conversation.updateMany({
      where: { id: conversationId, firstMessageSentAt: null },
      data: { firstMessageSentAt: new Date() }
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/gateway && bun run test -- MessagingService.test.ts`
Expected: PASS.

- [ ] **Step 5: Audit other message-creation paths**

`MessageTranslationService.ts:309-335` crée aussi des messages/conversations hors `MessagingService.handleMessage` (voir spec, section « Flux premier message »). Lire ce fichier et déterminer s'il bump `lastMessageAt` par un chemin distinct de `MessagingService.updateConversation` — si oui, y appliquer le même flip gardé (mêmes deux écritures, même commentaire). Documenter dans le message de commit si un second point d'intégration a été trouvé et traité, ou si l'audit confirme qu'aucun autre chemin ne le nécessite.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/messaging/MessagingService.ts \
        services/gateway/src/__tests__/unit/services/MessagingService.test.ts
git commit -m "fix(gateway): flip firstMessageSentAt on the first message of a silently-created DM"
```

---

### Task 6: `delete-for-me.ts` — fermer un DM vide au lieu de transférer la propriété

**Files:**
- Modify: `services/gateway/src/routes/conversations/delete-for-me.ts:47-95`
- Test: `services/gateway/src/__tests__/unit/routes/conversations-delete-for-me.test.ts` **et** `services/gateway/src/__tests__/unit/routes/conversations/delete-for-me.test.ts` — **deux fichiers homonymes distincts testent tous les deux cette route** (vérifié : 335 lignes et 200 lignes, tous deux réels, aucun n'est mort — piège connu du projet, cf. `reference_two_test_files_same_name_gateway_socialeventshandler`). Chacun a son propre helper `makePrisma()` local (pas partagé entre les deux fichiers).

**Interfaces:**
- Consumes: `Conversation.firstMessageSentAt`, `Conversation.type` (Task 1).

- [ ] **Step 1: Add a safe default `conversation.findUnique` mock to BOTH `makePrisma()` helpers**

Le nouveau code (Step 4) appelle `prisma.conversation.findUnique(...)` dès que `participant.role === 'creator'` — sans mock par défaut, **tous** les tests existants qui atteignent cette branche planteraient avec `TypeError: prisma.conversation.findUnique is not a function`, y compris ceux qui ne le testent pas explicitement.

Dans `services/gateway/src/__tests__/unit/routes/conversations-delete-for-me.test.ts:60-72`, `makePrisma` fait un merge PAR NAMESPACE (`overrides.conversation` est fusionné dans l'objet `conversation` de base, pas remplacé) :

```ts
function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      ...(overrides.participant ?? {}),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({}),
      findUnique: jest.fn<any>().mockResolvedValue({ type: 'group', firstMessageSentAt: new Date('2026-01-01') }),
      ...(overrides.conversation ?? {}),
    },
  };
}
```

Dans `services/gateway/src/__tests__/unit/routes/conversations/delete-for-me.test.ts:70-81`, `makePrisma` fait un `...overrides` au niveau RACINE (un override de `conversation` remplace tout l'objet, ne le fusionne pas) :

```ts
function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(mockParticipant),
      update: jest.fn<any>().mockResolvedValue({ ...mockParticipant, isActive: false }),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
      findUnique: jest.fn<any>().mockResolvedValue({ type: 'group', firstMessageSentAt: new Date('2026-01-01') }),
    },
    ...overrides,
  };
}
```

Dans les deux cas, la valeur par défaut (`type: 'group'`, `firstMessageSentAt` posé) préserve exactement le comportement actuel des tests successor existants (« creator transfers to moderator/oldest member ») sans toucher à un seul de ces tests — le merge par défaut suffit, aucune modification de test individuel n'est nécessaire pour ce fichier grâce au namespace-merge (`conversations-delete-for-me.test.ts`) ; pour `conversations/delete-for-me.test.ts` (remplacement racine), vérifier qu'aucun test existant ne passe déjà un `conversation: {...}` dans son override — au moment de l'écriture de ce plan, aucun ne le fait (seuls des overrides `participant` sont utilisés dans ce fichier).

- [ ] **Step 2: Write the failing tests for the new empty-DM behavior, in BOTH files**

Dans `conversations-delete-for-me.test.ts`, nouveau `describe` au même niveau que « creator with moderator successor » (`:166`) :

```ts
describe('DELETE /conversations/:id/delete-for-me — creator, empty direct DM', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;

  beforeAll(async () => {
    (resolveConversationId as jest.MockedFunction<any>).mockResolvedValue(CONV_ID);
    ({ app, prisma } = await buildApp({
      prismaOverrides: {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: PARTICIPANT_ID, userId: USER_ID, conversationId: CONV_ID,
            role: 'creator', isActive: true,
          }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
        conversation: {
          update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
          findUnique: jest.fn<any>().mockResolvedValue({ type: 'direct', firstMessageSentAt: null }),
        },
      },
    }));
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 and closes the conversation instead of transferring ownership', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
    expect(prisma.participant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'creator' } })
    );
  });
});
```

Dans `conversations/delete-for-me.test.ts`, nouveau `describe` au même niveau que « creator with successor (moderator) » (`:144`) :

```ts
describe('DELETE /conversations/:id/delete-for-me — creator, empty direct DM', () => {
  it('returns 200 and closes the conversation instead of transferring ownership', async () => {
    const creatorParticipant = { ...mockParticipant, role: 'creator' };
    const prisma = makePrisma({
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue(creatorParticipant),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      conversation: {
        update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, isActive: false }),
        findUnique: jest.fn<any>().mockResolvedValue({ type: 'direct', firstMessageSentAt: null }),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me` });
    expect(res.statusCode).toBe(200);
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
    expect(prisma.participant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'creator' } })
    );
    await app.close();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- delete-for-me`
Expected: FAIL sur les deux nouveaux tests uniquement — le code actuel n'appelle jamais `prisma.conversation.findUnique` et transfère toujours quand un successeur existe. Les tests successor existants doivent rester VERTS à ce stade (l'ancien code ne lit pas encore `findUnique`) ; le Step 1 les protège pour APRÈS le Step 4, où le nouveau code appelle `findUnique` sur tous les chemins `role === 'creator'`, y compris ceux exercés par les tests successor.

- [ ] **Step 4: Write the minimal implementation**

Dans `services/gateway/src/routes/conversations/delete-for-me.ts`, remplacer le bloc `if (participant.role === 'creator') { ... }` (lignes 47-95) par :

```ts
      if (participant.role === 'creator') {
        const conversationInfo = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { type: true, firstMessageSentAt: true },
        })
        const isEmptyDirect = conversationInfo?.type === 'direct' && !conversationInfo.firstMessageSentAt

        if (isEmptyDirect) {
          // DM vide jamais utilisé : rien à préserver pour un successeur qui
          // ne l'a pas demandé (Prisme design doc 2026-08-04) — fermer
          // plutôt que transférer, même s'il reste un autre participant actif.
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { isActive: false },
          })
        } else {
          // Try moderator first, then oldest active member
          let successor = await prisma.participant.findFirst({
            where: {
              conversationId,
              isActive: true,
              userId: { not: userId },
              role: 'moderator',
            },
            orderBy: { joinedAt: 'asc' },
          })

          if (!successor) {
            successor = await prisma.participant.findFirst({
              where: {
                conversationId,
                isActive: true,
                userId: { not: userId },
              },
              orderBy: { joinedAt: 'asc' },
            })
          }

          if (successor) {
            await prisma.participant.update({
              where: { id: successor.id },
              data: { role: 'creator' },
            })

            const io = socketIOHandler?.getManager()?.getIO()
            if (io) {
              io.to(ROOMS.conversation(conversationId)).emit(
                SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED,
                {
                  conversationId,
                  userId: successor.userId,
                  newRole: 'creator',
                  updatedBy: userId,
                }
              )
            }
          } else {
            // No other active members — close conversation
            await prisma.conversation.update({
              where: { id: conversationId },
              data: { isActive: false },
            })
          }
        }
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- delete-for-me`
Expected: PASS dans les deux fichiers, y compris les tests successor mis à jour (Step 1) et les deux nouveaux tests empty-DM.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/routes/conversations/delete-for-me.ts \
        services/gateway/src/__tests__/unit/routes/conversations-delete-for-me.test.ts \
        services/gateway/src/__tests__/unit/routes/conversations/delete-for-me.test.ts
git commit -m "fix(gateway): close an empty direct DM instead of transferring ownership on delete-for-me"
```

---

### Task 7: Documentation

**Files:**
- Modify: `services/gateway/decisions.md`
- Modify: `packages/shared/CLAUDE.md`

**Interfaces:** aucune — documentation seule.

- [ ] **Step 1: Add an ADR entry**

Dans `services/gateway/decisions.md`, ajouter une entrée décrivant la décision (visibilité conditionnelle d'un DM vide, champ `firstMessageSentAt`, réutilisation de `Participant.role === 'creator'`, alternatives écartées — `createdBy` dédié, requête `COUNT`, brouillon 100% client) en suivant le format déjà utilisé par les entrées existantes de ce fichier.

- [ ] **Step 2: Document the new schema field**

Dans `packages/shared/CLAUDE.md`, section schema, documenter `Conversation.firstMessageSentAt` — sa sémantique (`null` = DM direct sans message, jamais backfillé), et le piège absent-vs-null pour quiconque l'interroge par la suite.

- [ ] **Step 3: Commit**

```bash
git add services/gateway/decisions.md packages/shared/CLAUDE.md
git commit -m "docs(gateway,shared): document the silent empty-DM visibility decision"
```

- [ ] **Step 4: Vérification pré-merge (opérationnelle, pas du code)**

Avant de merger cette branche, exécuter en base (staging ou prod, lecture seule) une requête de comptage des DM `type: 'direct'` sans aucun message historique (`messages: { none: {} }` ou équivalent), pour confirmer l'ampleur réelle du cas marginal documenté dans le spec (« un DM déjà vide en base redevient invisible pour le participant non-créateur après migration »). Si ce compte est significatif (pas quasi-nul), remonter au propriétaire produit avant de merger — sinon, procéder normalement.
