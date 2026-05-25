# Audio Instant Render + Attachment Size — QA Checklist

**Branch** : `worktree-feat-audio-instant-render`
**Spec** : `docs/superpowers/specs/2026-05-25-audio-instant-render-and-attachment-size-design.md`
**Plan** : `docs/superpowers/plans/2026-05-25-audio-instant-render-and-attachment-size-plan.md`
**Date** : 2026-05-25

Cette checklist couvre les 4 scénarios E2 du plan + la vérification E1 du badge image. À exécuter sur device (simulateur iPhone 16 Pro ou physique) une fois le gateway local redémarré pour prendre les nouveaux events.

## Pré-requis

- [ ] Worktree branché et build OK : `cd .claude/worktrees/feat-audio-instant-render && ./apps/ios/meeshy.sh run`
- [ ] Gateway local relancé avec le nouveau code (tmux window 1 : `cd services/gateway && npm run dev`)
- [ ] Compte test 1 connecté sur l'app simulateur (cf. `apps/ios/fastlane/.env` → `atabeth`)
- [ ] Compte test 2 disponible sur un autre device / web (`jcharlesnm`) pour envoyer des audios en live

---

## Scénario 1 — Ouverture conv avec audios transcrits (Lot B)

**Objectif** : aucun pop-in à l'ouverture d'une conv qui contient déjà des audios transcrits + traduits côté serveur.

- [ ] Ouvrir une conversation qui contient au moins 3 messages audio avec transcription + traductions audio finalisées en DB
- [ ] À la PREMIÈRE FRAME, vérifier :
  - [ ] Transcriptions visibles immédiatement sous chaque scrubber (pas de flash)
  - [ ] Drapeaux de langue (traductions audio disponibles) présents dès l'apparition de la bulle
  - [ ] Aucun « pop » de la transcription qui apparaît 1 seconde après la bulle

**Si KO** : capturer une vidéo et logger via `Logger.media` pour identifier sur quel chemin (`.fresh`, `.stale`, `refreshMessagesFromAPI`) le pop se produit.

---

## Scénario 2 — Réception live d'un audio déjà enrichi (Lot C+D)

**Objectif** : un audio reçu en temps réel via socket arrive complet (transcription incluse) si le serveur l'a déjà transcrit.

- [ ] Garder la conv ouverte sur le device 1
- [ ] Depuis le device 2 (compte `jcharlesnm`), envoyer un audio court (~3s)
- [ ] Attendre que la pipeline gateway → translator finalise (vérifier dans les logs gateway `transcriptionReady` reçu)
- [ ] À l'arrivée du bubble sur le device 1 :
  - [ ] Si la transcription est déjà finalisée côté serveur quand `message:new` est broadcast → transcription présente dans la même frame que le bubble
  - [ ] Sinon (cas le plus courant) → cf. Scénario 3 ci-dessous

---

## Scénario 3 — Enrichissement async (Lot C4 + D2)

**Objectif** : le bubble apparaît immédiatement, puis la transcription/traduction s'injecte IN PLACE sans flash quand le worker finit.

- [ ] Depuis device 2, envoyer un audio long (>5s) pour laisser le temps à Whisper de tourner
- [ ] À T0, vérifier sur device 1 :
  - [ ] Le bubble apparaît immédiatement sans transcription (état attendu, Whisper en cours)
- [ ] À T1 (~quand Whisper finit) :
  - [ ] La transcription apparaît IN PLACE sous le scrubber
  - [ ] Aucun flash visible, aucun saut de layout
  - [ ] Logs Xcode : `[RT-DIAG] decoded message:attachment-updated msg=… att=…` reçu
- [ ] À T2 (~quand TTS finit pour chaque langue) :
  - [ ] Les drapeaux de traductions audio apparaissent un par un
  - [ ] Tap sur un drapeau → bascule de langue fonctionne immédiatement

**Si KO** : vérifier que le gateway émet bien `message:attachment-updated` (logs `_broadcastAttachmentUpdated`). Vérifier dans iOS que `attachmentUpdatedPublisher` reçoit l'event (logger).

---

## Scénario 4 — Audio gate (Lot A)

**Objectif** : quand l'auto-DL audio est bloqué, le bouton play devient flèche download avec taille affichée.

- [ ] Settings → Media downloads → désactiver l'auto-DL audio sur Wi-Fi (forcer le blocage)
- [ ] Ouvrir une nouvelle conv avec audios (non encore téléchargés sur ce simulateur, clean app data si besoin)
- [ ] Pour chaque bubble audio :
  - [ ] Le bouton play normal est remplacé par l'icône `arrow.down.to.line`
  - [ ] Sous l'icône, label `« 850 KB »` (ou taille réelle) visible
  - [ ] Tap → l'icône devient anneau de progression
  - [ ] Pendant le DL : label devient `« 410 KB / 850 KB »` (progress en temps réel)
  - [ ] Au DL terminé → swap automatique vers le bouton play normal (sans rebuild de la bulle)

---

## Scénario 5 — Vérification badge image (Lot E1)

**Objectif** : confirmer la parité visuelle vidéo/audio/image quand auto-DL bloqué.

- [ ] Garder l'auto-DL bloqué (cf. Scénario 4)
- [ ] Ouvrir une conv contenant des images non téléchargées
- [ ] Pour chaque bubble image :
  - [ ] Le `centredIdleBadge` (cercle 56pt indigo + icône `arrow.down.to.line`) est visible
  - [ ] **Vérification critique** : la pill noire sous le cercle affiche la taille (« 2.3 MB » ou similaire)
- [ ] Si la pill taille est absente : c'est un fix 1-liner à faire dans `ConversationMediaViews.swift:116-140` (déjà documenté dans `apps/ios/CLAUDE.md` § Attachment Size Display Before Download)

---

## Reporting

Quand tous les scénarios sont validés, marquer ici :

- [ ] Scénario 1 (ouverture conv) — ✅ / ❌ + observations
- [ ] Scénario 2 (live transcribed) — ✅ / ❌ + observations
- [ ] Scénario 3 (live async enrichment) — ✅ / ❌ + observations
- [ ] Scénario 4 (audio gate) — ✅ / ❌ + observations
- [ ] Scénario 5 (badge image) — ✅ / ❌ + observations

Si ❌ sur un scénario, créer un commit `fix(ios/...)` ou `fix(gateway/...)` sur la branche `worktree-feat-audio-instant-render` avant de PR.

## Self-review post-merge — issues fixées + restantes en backlog

Suite à une self-review du sprint (cf. agent code-reviewer), 6 issues ont été identifiées. Les 3 critiques sont fixées dans des commits post-merge.

### ✅ Fixées (commits 7d84ee258, 375fd0608, c20a22cb1)

| # | Fix | Symptôme évité |
|---|---|---|
| 1 | `APIMessageAttachment` init custom avec `try?` sur Prisme blobs | Plus d'event socket silencieusement avalé quand une seule entry `translations` est malformée |
| 2 | `hydrateMetadataFromGRDB(forceOverwrite:)`, `refreshMessagesFromAPI` passe `true` | Re-transcription serveur propage maintenant à l'UI (bouton arrow.clockwise) |
| 5 | `MessagePersistenceActor.applyAttachmentEnrichment` + appel dans `applyAttachmentUpdate` | Plus de pop-in à la réouverture de conv après réception live d'enrichissement |

### ⏳ Backlog (non bloquantes mais à traiter)

| # | Issue | Localisation | Priorité |
|---|---|---|---|
| 3 | `_broadcastAttachmentUpdated` race avec write translator — le re-query Prisma peut retourner le row pre-enrichi si le translator n'a pas await son write avant emit ZMQ | `services/gateway/src/socketio/MeeshySocketIOManager.ts:943-949` | Important — investigate si on observe des transcriptions "null" en logs ; sinon fix en passant data du caller au helper |
| 4 | `MessageStore.apply()` publie sans equality guard — un extra re-render à chaque background refresh | `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift:317` | Cosmétique perf, fix 1-ligne |
| 6 | `_serializeAttachmentsField` retourne `[]` silencieusement si `attachments` undefined — même pattern silent-drop que ce qu'on a corrigé | `services/gateway/src/socketio/handlers/MessageHandler.ts:910-913` | Ajouter `logger.error` pour visibilité |
| 7 | Asymétrie texte transcription socket vs GRDB — `t.transcribedText ?? t.text` vs `t.text` seul | `ConversationViewModel.swift:3039 vs 2908` | Helper partagé `MessageTranscription.fromAPI(_:)` |

### Follow-ups architecturaux (out-of-scope du sprint)

- **AudioMediaView ↔ AudioAvailabilityResolver consolidation** : `AudioMediaView` (utilisé par `BubbleStandardLayout`) garde sa propre orchestration multi-langue, distincte du `AudioAvailabilityResolver` (utilisé par `BubbleAttachmentView`). Une factorisation propre demanderait que le resolver accepte un `url` overridable + `kind: MediaKind` — pas fait dans ce sprint pour limiter le scope.
- **Tests d'intégration gateway `message:attachment-updated`** : actuellement seuls les tests unitaires couvrent le serializer et `emitAttachmentUpdated`. Un test e2e qui mock le translator → vérifie que le gateway emit le delta serait précieux.
