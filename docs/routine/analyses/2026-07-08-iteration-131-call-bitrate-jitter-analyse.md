# Iteration 131 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `16e3d12` (dernier merge PR #1704). Branche `claude/brave-archimedes-hygj6i` recréée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **130** → ce cycle prend **131**.

PR ouvertes au démarrage (strictement évitées) : #1715 (android pinned-message banner), #1713
(gateway SyncEngine `_seq` ordering), dependabot (#1714/#1712/#1711/#1708/#1706/#1705). Cible retenue
disjointe de toute PR ouverte : **corrections de calcul de statistiques WebRTC** dans
`apps/web/hooks/use-call-quality.ts` (sous-système d'appels récemment modernisé — Priorité 1, commit
`fix(calls): serialize thermal video downgrade…` #1692).

## Cible : `useCallQuality` — bitrate cumulatif (F131a) + jitter last-write-wins (F131b)

### Current state
`apps/web/hooks/use-call-quality.ts` échantillonne `RTCPeerConnection.getStats()` toutes les
`updateInterval` ms, agrège les rapports `inbound-rtp`, et expose `ConnectionQualityStats`
(`bitrate {audio, video}`, `jitter`, `packetLoss`, `rtt`, `bytesSent/Received`). Ces stats sont
affichées (`ConnectionQualityBadge`, `CallQualityOverlay`) **et** émises au serveur toutes les 10 s
via `CALL_QUALITY_REPORT`.

L'agrégation du **packet loss** a déjà été durcie (somme cross-stream : `totalPacketsLost /
totalPacketsReceived`) pour qu'un flux sain ne masque pas un flux perdant. Mais deux autres champs
échappent à ce durcissement.

### Problems identified

**F131a — `bitrate` calculé à partir d'un compteur cumulatif, pas d'un débit** (l.106-110)
```ts
if (report.kind === 'audio') {
  audioBitrate = (report.bytesReceived || 0) * 8 / 1000; // kbps
} else if (report.kind === 'video') {
  videoBitrate = (report.bytesReceived || 0) * 8 / 1000; // kbps
}
```
`RTCInboundRtpStreamStats.bytesReceived` est un compteur **monotone croissant** sur toute la durée de
la session. `bytesReceived * 8 / 1000` produit donc des **kilobits cumulés**, pas un débit par
intervalle — la valeur exposée/rapportée comme « bitrate kbps » **croît sans borne** avec la durée de
l'appel.

Scénario falsifiable (appel audio stable ~32 kbps) :
```
tick @ t=1s   bytesReceived≈40 000   → bitrate.audio ≈ 320   (déjà 10× trop)
tick @ t=600s bytesReceived≈2 400 000 → bitrate.audio ≈ 19 200 (et continue de grimper)
```

**F131b — `jitter` en last-write-wins cross-stream** (l.99-101)
```ts
if (report.jitter !== undefined) {
  jitter = report.jitter * 1000; // Convert to ms
}
```
Contrairement au packet loss (agrégé), le jitter est **réassigné** à chaque rapport `inbound-rtp`.
Dans un appel vidéo il y a 2 flux entrants (audio + video) ; la valeur retenue est celle du **dernier
flux itéré**, ordre **non défini par la spec** (`RTCStatsReport`). Un flux audio à 40 ms de jitter est
silencieusement masqué par un flux vidéo à 3 ms itéré après lui.

### Root cause
Le durcissement d'agrégation cross-stream (introduit pour le packet loss) n'a pas été appliqué aux
deux autres métriques dérivées des rapports `inbound-rtp`. Le bitrate suppose implicitement (à tort)
que `bytesReceived` est un delta par intervalle ; le jitter suppose (à tort) un unique flux entrant.

### Business impact
- **Bitrate** : le badge de qualité et l'overlay affichent un débit qui gonfle indéfiniment → info
  trompeuse pour l'utilisateur, et **données analytiques serveur fausses** (`CALL_QUALITY_REPORT`
  toutes les 10 s alimente potentiellement des dashboards/décisions QoS avec un bitrate cumulatif
  ininterprétable).
- **Jitter** : sous-estimation possible de la dégradation réelle d'un flux → diagnostic qualité faussé.

### Technical impact
- Incohérence interne : `packetLoss` est agrégé cross-stream, `bitrate`/`jitter` non.
- Contrat implicite « `bitrate` = débit kbps » violé par la sémantique de `bytesReceived`.

### Risk assessment
Faible et bien circonscrit. Fonction de projection dans un hook ; changement localisé à la boucle
d'agrégation `getStats`. Le bitrate delta-based nécessite un état inter-échantillon (compteur
précédent + timestamp), stocké dans un `ref` stable, réinitialisé au changement de `peerConnection`.
Deux tests existants (`computes video bitrate…`, `handles both audio and video…`) **assertaient le
comportement bugué** (bitrate > 0 depuis un unique échantillon cumulatif) → mis à jour vers un modèle
à deux échantillons (le premier échantillon n'a pas de prédécesseur → débit 0, standard WebRTC).

### Proposed improvement
1. **F131a** : dériver le bitrate du **delta** de `bytesReceived` par `kind`, divisé par le temps
   écoulé (`report.timestamp`, wall-clock, robuste à la dérive de `updateInterval`) :
   `kbps = max(0, bytes_now − bytes_prev) * 8 / elapsedMs`. Premier échantillon (pas de prédécesseur)
   → 0. Delta clampé à 0 (renégociation → reset compteur). État précédent dans un `ref` réinitialisé
   au changement/perte de `peerConnection`.
2. **F131b** : agréger le jitter en **max cross-stream** (`jitter = Math.max(jitter, report.jitter *
   1000)`) — cohérent avec l'intention « un flux dégradé ne doit jamais être masqué par un flux sain »
   du durcissement packet loss.

### Expected benefits
- Bitrate = débit réel borné, interprétable côté client **et** serveur.
- Jitter = pire cas cross-stream, cohérent avec l'agrégation packet loss.
- Les 3 métriques dérivées de `inbound-rtp` suivent désormais la **même** discipline d'agrégation.

### Implementation complexity
Faible — 1 fichier de production (boucle d'agrégation + 1 `ref` + reset), 1 fichier de test (nouveaux
cas delta-based bitrate + jitter max ; 2 cas existants convertis en deux échantillons).

### Validation criteria
- RED prouvé : bitrate cumulatif (unique échantillon → valeur non nulle qui grimpe entre échantillons)
  avant fix ; jitter = flux itéré en dernier (3 ms) avant fix.
- GREEN : bitrate = débit par intervalle stable (32 kbps sur delta constant, invariant à la durée) ;
  jitter = max cross-stream (40 ms).
- Suite `__tests__/hooks/use-call-quality.test.ts` intégralement verte.
- `tsc --noEmit` : 0 erreur.

## Écartés cette session (backlog / hors périmètre)
- **use-webrtc-p2p sérialisation des actuations caméra** (agent finding #2) : réel mais **intégration
  timing**, correction propre = pattern task-chain (comme iOS) → architecturalement significatif, laissé
  au backlog.
- **rtt last-write-wins** (même forme que jitter, l.117-129) : plus faible impact (les 2 sources RTT
  concordent normalement) → non retenu ce cycle, noté au backlog.

## Future improvements (backlog)
- **F131c** : appliquer l'agrégation cohérente au `rtt` (candidate-pair vs remote-inbound-rtp) si un
  cas de divergence réel apparaît.
- **F132** : sérialiser les actuations caméra web (`enableVideo`/`disableVideo`/`applyQualityTier`) via
  un pattern task-chain, parité iOS thermal downgrade.
- **F133 (HAUT IMPACT, vérifié)** : `use-conversation-messages.ts` `sortMessagesByDateDesc` (l.80-88)
  compare les dates en **chaînes brutes**. Correct pour de l'ISO-8601 mais un `createdAt` de type `Date`
  (message optimiste, `optimistic-message.ts:79 createdAt: now`) est stringifié via `String(date)` →
  `"Sun Feb 01 2026…"` qui ne trie **pas** chronologiquement et devient arbitraire mêlé à des ISO
  serveur. Correction : extraire le comparateur en module pur + comparer `new Date(x).getTime()`
  (pattern iter 121 `normalizeMarkdown`). **Candidat prioritaire prochaine itération.**
- **F134 (vérifié)** : `language-utils.ts` `getLanguageDisplayName`/`getLanguageFlag` (l.140-151) —
  lookup **sensible à la casse** (maps en lowercase, input non normalisé). `getLanguageFlag('FR')` → 🌐
  au lieu de 🇫🇷. Même classe que `findLanguageMeta` déjà durci ailleurs. Fix : lowercase avant index.
- **F135 (vérifié)** : `translation-cleaner.ts` `deepCleanTranslationOutput` (l.44) — regex de
  normalisation de guillemets `/["']([^"']*?)["']/g` apparie une apostrophe isolée (`It's`) avec le
  guillemet double suivant → corruption. Défaut voisin l.42 (espace injecté après `.`/`,` → `e.g.`
  devient `e. g.`, `www.site.com` cassé). Fix regex + garde.
- **F90** (inchangé) : message-search recall plafonné à `take: 200` — décision produit requise.
