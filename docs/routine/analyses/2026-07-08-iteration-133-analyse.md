# Iteration 133 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `37d9522` (dernier merge PR #1643). Branche `claude/brave-archimedes-e0vf6d` recréée depuis
`origin/main`. Numérotation : l'itération **132** est déjà prise par la PR humaine #1644 (jcnm, F95 —
mentions/email boundary, encore en CI). Ce cycle prend donc **133** et **évite strictement tout fichier
de la zone "mentions"** (`mention-parser.ts`, `types/mention.ts`, `MentionService.ts`,
`mention-display.ts`, `useMentions.ts`) pour ne pas entrer en conflit avec #1644.

PR ouvertes au démarrage : #1644 (humaine, laissée intacte) + dependabot (#1549/#1542/#1539/#1536/#1532).

## Écartés cette session (revue, non retenus)
Revue d'ingénierie ciblée Priorité 1 (features récemment modernisées). Candidats instruits puis
**écartés** :

- **`use-message-translations.ts` — alias `model` ignoré dans le dedup** (l.143/158) : bug réel de dedup
  qualité-first (la variante de payload `{ language, content, model }` n'est pas lue en `t.model`, seulement
  `t.translationModel`) — MAIS `processMessageWithTranslations` n'a **aucun consommateur de production**
  aujourd'hui (`bubble-stream-page.tsx` ne le destructure pas). Impact business nul → non retenu ce cycle
  (queué **F97**).
- **DND overnight + `dndDays`** (`NotificationService.isDNDActive`) : la porte "jour" ne teste que
  *aujourd'hui* alors qu'une fenêtre nocturne 22:00→07:00 appartient au jour de **début**. Bug plausible,
  mais la sémantique "jour d'une fenêtre nocturne" est un choix produit discutable et DND vient d'être
  re-testé (iter 131). Trop ambigu pour un fix autonome sûr → queué **F98** (décision produit).

## Cible : F99 — `useCallQuality` : la perte de paquets écrase au lieu d'agréger les flux entrants

### Current state
`apps/web/hooks/use-call-quality.ts`, fonction `updateStats` (boucle `stats.forEach`). Le hook parcourt
les rapports WebRTC `RTCStatsReport` et calcule `packetLoss` (%), `rtt`, `jitter`, bitrates et compteurs
d'octets. `packetLoss` alimente **directement** `calculateQualityLevel(packetLoss, rtt)` → le niveau de
qualité (`excellent`/`good`/`fair`/`poor`) qui pilote à son tour `useAdaptiveDegradation`
(dégradation adaptative du flux) et le report `CALL_QUALITY_REPORT` envoyé au gateway toutes les 10 s.

Chemin de production confirmé : `VideoCallInterface.tsx:106` consomme `useCallQuality`, et
`use-adaptive-degradation.ts` consomme le `qualityStats` produit.

### Problems identified
Un appel WebRTC comporte **plusieurs** flux `inbound-rtp` (au minimum audio **et** vidéo). Dans la boucle
`forEach`, `packetLoss` était **réassigné** à chaque rapport `inbound-rtp` :

```ts
if (totalPackets > 0) {
  packetLoss = (packetsLost / totalPackets) * 100;   // ← écrase le flux précédent
}
```

Seule la perte du **dernier** flux itéré survit. Si l'audio perd 20 % de ses paquets mais que la vidéo
(itérée après) est saine à 0 %, `packetLoss` finit à `0` → niveau `excellent` alors que l'appel est en
réalité dégradé. Le défaut est masqué par le harnais de test existant, qui n'émet jamais qu'**un seul**
rapport `inbound-rtp` par cas.

Contraste flagrant **dans la même fonction** : `bytesReceived` (et `bytesSent`) sont, eux, correctement
**cumulés** avec `+=` — le commentaire dit explicitement « summed across all RTP streams ». La perte de
paquets aurait dû suivre le même pattern.

### Root cause
Réassignation (`=`) là où l'agrégation (`+=`/accumulation) était requise. La perte de paquets d'une
session multi-flux est un ratio global `Σ perdus / Σ total`, pas la valeur d'un flux arbitraire. Le code
mélangeait deux styles : accumulation pour les octets, écrasement pour la perte.

### Business / Technical impact
- **Qualité d'appel sous-estimée** : un flux audio dégradé masqué par une vidéo saine (ou l'inverse)
  laisse la dégradation adaptative *inactive* alors qu'elle devrait réduire le débit → l'utilisateur subit
  une mauvaise expérience sans que le système ne réagisse.
- **Télémétrie faussée** : `CALL_QUALITY_REPORT` persiste un `packetLoss` non représentatif côté gateway.
- **Non déterministe** : le résultat dépend de l'ordre d'itération des rapports (`getStats()` n'ordonne
  pas), donc la valeur retenue peut varier d'un tick à l'autre pour les mêmes conditions réseau.

### Risk assessment
Faible. Changement confiné à une seule fonction pure de parsing ; aucune API modifiée. La forme du
`ConnectionQualityStats` produit est inchangée (mêmes champs). Comportement mono-flux **identique**
(un seul rapport → `Σ = ce rapport`).

### Proposed improvement
Cumuler `totalPacketsLost` et `totalPacketsReceived` sur **tous** les rapports `inbound-rtp` (comme
`bytesReceived`), puis calculer `packetLoss = Σ perdus / Σ total × 100` **une seule fois** après la boucle.
Aligne la perte de paquets sur le pattern d'accumulation déjà documenté pour les octets.

### Expected benefits
- Niveau de qualité correct dès qu'un flux se dégrade → dégradation adaptative déclenchée à temps.
- Télémétrie fidèle.
- Déterminisme (indépendant de l'ordre d'itération).
- Cohérence de style interne (perte de paquets ↔ octets, même stratégie d'agrégation).

### Implementation complexity
Très faible — 1 fichier de production (accumulation + calcul post-boucle), 1 test de régression
(2 flux `inbound-rtp` : audio lossy + vidéo saine → `packetLoss` agrégé, niveau `poor`).

### Validation criteria
- **RED prouvé** : avec `{audio: 20 perdus/80 reçus}` + `{video: 0/100}`, l'ancien code renvoyait
  `packetLoss = 0` → `excellent` ; le nouveau renvoie `10` → `poor`.
- Tous les cas mono-flux existants restent verts (comportement inchangé).
- Suite `use-call-quality.test.ts` intégralement verte.
- Zéro changement de la forme de `ConnectionQualityStats`.

## Backlog mis à jour
- **F97** (nouveau) : `use-message-translations.ts` — lire l'alias `t.model`/`t.fromCache` dans le dedup
  (à réactiver quand le hook aura un consommateur de production).
- **F98** (nouveau) : `NotificationService.isDNDActive` — sémantique jour d'une fenêtre DND nocturne
  (décision produit requise).
- **F90** (report) : message-search — recall des traductions (architecturalement significatif).
