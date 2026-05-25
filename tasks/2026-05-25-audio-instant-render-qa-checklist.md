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

## Follow-ups identifiés (post-merge)

1. **GRDB write-through pour `applyAttachmentUpdate`** : actuellement le delta socket n'écrit qu'en mémoire (`messageTranscriptions` / `messageTranslatedAudios`). Si l'utilisateur ferme la conv juste après l'enrichissement, la réouverture re-déclenche un pop-in jusqu'au prochain `refreshMessagesFromAPI`. Fix : ajouter `MessagePersistenceActor.applyAttachmentDelta(messageId:attachment:)` et l'appeler depuis `applyAttachmentUpdate`.

2. **Tests d'intégration gateway `message:attachment-updated`** : actuellement seuls les tests unitaires couvrent le serializer et `emitAttachmentUpdated`. Un test e2e qui mock le translator → vérifie que le gateway emit le delta serait précieux.

3. **AudioMediaView ↔ AudioAvailabilityResolver consolidation** : `AudioMediaView` (utilisé par `BubbleStandardLayout`) garde sa propre orchestration multi-langue, distincte du `AudioAvailabilityResolver` (utilisé par `BubbleAttachmentView`). Une factorisation propre demanderait que le resolver accepte un `url` overridable + `kind: MediaKind` — pas fait dans ce sprint pour limiter le scope.
