# Cycle 128 — la bannière servait la bonne LANGUE et attachait le mauvais SON

## Le défaut

Suivi MESURÉ du cycle 123, laissé ouvert trois cycles et instruit ici :

> « La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste
> traduite du Prisme. »

Le cycle 123 a donné à la transcription sa propre source de Prisme
(`PreviewPrismBasis.transcript`) : depuis, le TEXTE de la bannière d'un vocal
descend le prisme du lecteur. Le FICHIER attaché à côté, lui, est resté
`first?.fileUrl` — l'original, sans condition, identique pour tous les lecteurs.

Un francophone recevant un vocal anglais voit donc une bannière **en français**
et, sous elle, un `UNNotificationAttachment` qui **parle anglais**. Les trois
clients savent pourtant descendre le Prisme sur la piste JOUÉE
(`AudioTrackLanguageResolver` iOS, `resolveAutoLanguage` web,
`resolveTranslatedAudio` Android) : l'écran verrouillé est la SEULE surface qui
ne le fait pas.

## Reachable, pas armé

`MessageTranslationService._handleAudioProcessCompleted` écrit pour chaque langue
`MessageAttachment.translations[lang] = { url: '/api/v1/attachments/file/translated/…', durationMs, format, … }`.
La piste traduite existe en production, servie par une route du gateway.

Et la lecture est **GRATUITE** : le `select` de l'éventail demande
`translations: true` depuis le cycle 123. `transcriptTranslationTexts()` n'en
dépouillait que le TEXTE et laissait `url` / `durationMs` / `format` sur la
table — la forme exacte de la leçon 279, appliquée au MÉDIUM.

## Les trois décisions de conception

1. **La piste est élue par la langue du TEXTE SERVI, jamais par une descente
   indépendante.** Deux descentes parallèles laisseraient la bannière dire
   « Bonjour » au-dessus d'une piste espagnole. `servedTranslation.language` est
   l'unique électeur — deux projections d'UNE descente (cycle 123).
2. **`null` (original servi) ⇒ fichier original.** Le Prisme ne substitue rien
   quand il n'a rien élu.
3. **Langue élue SANS piste ⇒ fichier original.** Fail-OPEN sur le médium : une
   traduction TTS peut manquer là où la traduction texte existe, et le son
   d'origine vaut mieux que le silence.

Et les TROIS champs voyagent ENSEMBLE — `url`, `mimeType`, `durationMs`. Servir
la piste traduite sous la durée de l'originale ferait mentir le libellé
« 🎤 Message vocal · 0:12 » que `buildMessageNotificationBodyI18n` compose depuis
cette durée (leçon 279 : ce qui QUALIFIE une chaîne voyage avec elle).

## Le correctif

- [x] `transcriptTranslationTracks()` — la JUMELLE de `transcriptTranslationTexts`,
      pour le MÉDIUM. Site UNIQUE du dépouillement `AttachmentTranslations` →
      `langue → { url, mimeType, durationMs }`
- [x] `normalizeTrackMimeType` — les deux producteurs de `format` divergent
      (`'mp3'` côté message, `'audio/mp3'` côté post) : normalisé, pas choisi
- [x] l'éventail compose la carte des pistes (aucune requête de plus) et la passe
      au lot `regular`, où le média du rich-push voyage déjà
- [x] `servedAttachmentMedia()` — l'élection, extraite pour qu'elle n'ait qu'un site
- [x] la durée SERVIE alimente le corps de la bannière ET le fil push

## Le second défaut, non cherché

Le premier témoin RED a rendu « 🎵 Audio · 0:00 » pour un vocal de 12 s.
`MessageAttachment.duration` est en MILLISECONDES (`schema.prisma`, et le
doc-comment de `formatSingleAttachmentLabelI18n` le redit) ; deux sites la
multipliaient par 1000. Un vocal de 34 s partait annoncé pour 9 h 26, sur le fil
push ET dans la ligne `Notification` que le SDK iOS décode.

- [x] les deux `* 1000` retirés, avec la raison écrite sur place

## Gates

- [x] `prismAudioTrackGate.test.ts` — **4 rouges contre `origin/main` / 11 verts après**
- [x] `prismAudioTrackFanOut.test.ts` — **2 rouges contre `origin/main` / 9 verts après**
- [x] suites voisines — 58 suites, 1103 témoins
- [x] `tsc --noEmit` gateway et shared — 0 erreur (code de retour lu SANS pipe)
- [x] suite `packages/shared` — 109 fichiers, 2593 témoins
- [x] suite gateway complète — **863/863 suites, 19588 témoins**, couverture 95,48 %
- [x] chaîne vérifiée jusqu'au PIXEL — URL relative, allowlist NSE, route wildcard, disque, UTI

## Revue

Rapport complet : `tasks/realtime-sync-audit-2026-08-24-cycle128.md`.
Leçon : `tasks/lessons.md` § 284. Règles : `/CLAUDE.md`, `services/gateway/CLAUDE.md`.
