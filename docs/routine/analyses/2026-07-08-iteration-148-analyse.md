# Iteration 148 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `83df407a` (dernier merge sur `main` : PR #1729 présence + suivis
`eaaad6bc`/`83df407a`). Branche `claude/brave-archimedes-c7ob1w` recréée depuis
`origin/main`. PRs ouvertes au démarrage (autres sessions, hors périmètre autonome) :
#1730 (Android forward), #1731 (realtime reactions replay, « iter 147 »). Ce cycle
prend **148** pour éviter toute collision de numéro/fichier avec #1731.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src` (services
récents : présence, delivery queue, reactions, stats), (b) `apps/web` +
`packages/shared` (présence, prisme, typing, reactions). Consigne : **un** défaut
de logique quasi-pure, haute confiance, **actuellement en production**, non couvert
par les tests. Priorité 1 = features récemment développées.

---

## Cible retenue : F115 — la delivery-queue hors-ligne **écrase la seconde édition** d'un message par la première → contenu intermédiaire périmé rejoué au reconnect

### Current state
`services/gateway/src/services/RedisDeliveryQueue.ts`. Quand un destinataire est
hors-ligne, `MessageHandler._enqueueOfflineEventForParticipants(...)`
(`MessageHandler.ts:673-675` pour `edited`, `:815-817` pour `deleted`) empile
l'événement dans la file de livraison, rejouée à la reconnexion
(`MeeshySocketIOManager._drainPendingMessages`). Sans ce rejeu, « le message
caché du destinataire reste sur le contenu pré-édition » (commentaire
`MessageHandler.ts:1123-1131`).

L'enqueue déduplique sur la paire `(messageId, eventType)` et **conserve la
première entrée** :

```lua
-- ENQUEUE_DEDUP_LUA (avant correctif)
if decodedEventType == ARGV[4] then
  return 0          -- déjà présent → on NE pousse PAS la nouvelle entrée
end
```

Chemin mémoire (fallback outage Redis), `RedisDeliveryQueue.ts:126` (avant
correctif) :

```ts
if (existing.some(e => e.messageId === entry.messageId
      && normalizedEventType(e) === normalizedEventType(entry))) {
  return;           // idem : la première entrée gagne, la nouvelle est jetée
}
```

### Problems identified
Plusieurs éditions d'un même message partagent **toutes** `eventType === 'edited'`.
La dédup « garde la première » jette donc la 2e (et dernière) édition et conserve
le contenu intermédiaire périmé.

Entrée concrète (Redis sain — cas nominal) :
1. Destinataire R hors-ligne.
2. Édition M : `"hello"` → `"hello world"` → empilé `{messageId:M, eventType:'edited', content:'hello world'}`.
3. Nouvelle édition M : `"hello world"` → `"goodbye"` → `ENQUEUE_DEDUP_LUA`
   trouve une entrée `edited` existante, renvoie `0`, ne pousse rien. La file
   garde `'hello world'`.
4. R se reconnecte → rejeu de `MESSAGE_EDITED` avec `content:'hello world'`.

- Sortie erronée : le cache de R affiche l'édition intermédiaire `"hello world"`.
- Attendu : le contenu final de l'expéditeur `"goodbye"`.

Cela **viole l'invariant que le code documente lui-même**
(`RedisDeliveryQueue.ts:18-23` : « … must all replay on drain … so the
recipient's final state matches the sender's ») et **défait le but même** de la
feature de rejeu d'édition hors-ligne.

### Root causes
La dédup a été conçue pour des **retries idempotents** d'un événement identique
(éviter la double-livraison d'un `new` re-émis). Clé sur `(messageId, eventType)`
+ « garder la première » ne distingue pas un retry identique d'une édition
réellement plus récente : elle traite une édition qui **supersède** comme un
doublon et conserve le payload périmé. `edited`/`deleted` sont des événements
**mutables** dont le dernier payload doit gagner ; `new` est le seul événement
véritablement **immuable** (retry idempotent).

### Business impact
Un destinataire qui était hors-ligne pendant plusieurs éditions voit une version
intermédiaire figée d'un message (typo corrigée puis re-corrigée → il reste sur la
1re correction) jusqu'à un refetch complet non lié. Érode la confiance dans la
cohérence du fil et le Prisme (le contenu affiché n'est pas celui qu'a voulu
l'expéditeur).

### Technical impact
Deux chemins concernés, tous deux en production :
- **Redis** (`ENQUEUE_DEDUP_LUA`, l.26-40) : chemin nominal.
- **Mémoire** (l.125-133) : fallback pendant un blip Redis.
Les deux partagent le même contrat one-entry-per-`(messageId, eventType)` sur
lequel s'appuient `drain`/`PRUNE_STALE_LUA` (unicité des valeurs sérialisées).

### Risk assessment
Risque **faible**. Le correctif :
- préserve l'idempotence stricte pour `new` (retour `0`, première entrée gardée) ;
- **supersède en place** les événements mutables (Redis `LSET` à la position FIFO
  d'origine, retour `2` ; mémoire `map`-replace) — **une seule** entrée par paire
  conservée, l'invariant d'unicité tenu, `enqueuedAt` porté au plus récent (le tri
  `byEnqueuedAt` du drain reste cohérent : l'édition superseded se place toujours
  après le `new` qu'elle cible).
Rétro-compatible : tous les tests existants restent verts (le cas « édition
répétée identique » collapse toujours à une entrée, `size === 1`).

### Proposed improvements
1. `ENQUEUE_DEDUP_LUA` : sur match `(messageId, eventType)`, si `eventType==='new'`
   → `return 0` ; sinon `LSET KEYS[1] i-1 ARGV[1]` + `EXPIRE` + `return 2`.
2. JS : logguer `2` comme « supersede » (distinct du dedup `0`).
3. Chemin mémoire : `findIndex` de la paire ; `new` → dedup (return) ; mutable →
   `existing.map((e,i)=> i===dupIndex ? entry : e)` (remplacement immuable en place).
4. Tests de régression (mémoire) : 2 éditions à contenu divergent → drain rejoue le
   **dernier** contenu ; FIFO conservé après le `new` ; retry `new` reste idempotent
   (1re entrée gardée). Test Redis : `eval` renvoie `2` géré sans fallback mémoire.

### Expected benefits
- La dernière édition d'un message hors-ligne est **toujours** celle rejouée.
- Aucun changement pour `new` (idempotence conservée), aucun changement de schéma,
  d'API, de type ou de migration.
- Cohérence Redis ↔ mémoire (mêmes sémantiques de supersede).

### Implementation complexity
Faible — ~15 lignes de logique (Lua + mémoire + JS) + 4 tests comportementaux.

### Validation criteria
- RED : 2 `edited` à contenu divergent → `drained[1].payload.content` valait
  `'hello world'` (intermédiaire) au lieu de `'goodbye'`.
- GREEN : après correctif, `drained` a 2 entrées `['new','edited']` et
  `drained[1].payload.content === 'goodbye'`.
- Non-régression : suite `RedisDeliveryQueue` verte, `tsc --noEmit` propre, suite
  gateway complète verte.

### Proof no existing test caught it
`__tests__/unit/services/RedisDeliveryQueue.test.ts:979-987` empile **deux fois le
même objet** `edited` (contenu identique) et n'assertait que `size === 1` — jamais
le cas contenu divergent, ni quel payload survit. Les tests l.953-977 ne couvrent
que « `edited`/`deleted` non bloqué par un `new` » (eventTypes différents). Les
tests Redis (l.990-1035) mockent `eval` (la vraie Lua n'est jamais exécutée).

---

## Notes de revue (fan-out) — candidats reportés

### F116 (retenu comme **priorité 1 du prochain cycle**) — `mergeParticipants` : un `isOnline:true` sans `lastActiveAt` est écrasé par le tie-break timestamp
`apps/web/stores/user-store.ts:52-54`. Un `lastActiveAt` **absent** est coercé en
epoch `0` (« infiniment vieux »), donc toute mise à jour de présence sans timestamp
est jugée plus ancienne qu'une entrée existante horodatée et **intégralement
rejetée** — y compris un `isOnline` fraîchement passé à `true`. Reachable en prod :
`toMinimalUser` (iter 146) émet `lastActiveAt: undefined` quand le gateway nulle le
timestamp pour `showLastSeen=false` tout en préservant `isOnline`. Manifestation
secondaire (même cause racine) : quand l'entrant gagne le tie-break, le spread
`{ ...existing, ...user }` (l.54) écrase les champs profil riches par les
placeholders fabriqués par `toMinimalUser` (`displayName: username`,
`firstName:''`, `email:''`). Non retenu **ce cycle** car le correctif propre
découple deux préoccupations (fraîcheur vs application des champs) avec une
heuristique « préférer les scalaires entrants non vides » qui touche la sémantique
de merge de présence tout juste refondue (#1727/#1729) — mérite son propre cycle
dédié + revue. **Prochaine priorité.**

### Runners-up (plus faibles)
- `StatusService.ts:94-102` : la garde de déconnexion anonyme (`anon_online_*`) ne
  peut jamais matcher (`markDisconnected` n'écrit que `anon_activity_*`), mais le
  seul appelant prod passe toujours `isAnonymous=false` → branche inatteignable.
- `message-reactions.tsx:355` : `count: reaction.count - 1` peut valoir `0`
  (dépend du pluriel i18n) — confiance plus faible.
- Dérive iOS/web `lastSeenString` (<24 h à cheval sur minuit) : le web suit le spec,
  la divergence est côté iOS (hors périmètre de ce fan-out).
