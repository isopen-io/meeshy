# Iteration 138 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `3d8d74b` (dernier merge PR #1654, iter 137). Branche `claude/brave-archimedes-hus6dh` recréée
depuis `origin/main`. Ce cycle prend **138**. Revue d'ingénierie fan-out (Priorité 1/3) sur les fonctions
pures de formatage `services/gateway` + `packages/shared/utils`.

## Cible : F103 — `NotificationService.formatFileSize` : tier choisi sur la valeur brute mais affichée arrondie → « 1024 Ko » au lieu de « 1.0 Mo »

### Current state
`services/gateway/src/services/notifications/NotificationService.ts:44-48` :

```ts
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;   // ← tier sur brut, valeur arrondie
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
```

### Problems identified
Le **tier** (unité) est sélectionné à partir de la valeur **brute** (`bytes < 1024 * 1024`) mais le
nombre imprimé est **arrondi** (`(bytes / 1024).toFixed(0)`). Pour tout `bytes ∈ [1_048_064, 1_048_575]`,
`bytes / 1024 ∈ [1023.5, 1023.999…]` → `.toFixed(0) = "1024"` → sortie `"1024 Ko"`. Or le tier Ko plafonne
à 1023 : `1024 Ko` aurait dû rouler en `1.0 Mo`.

Exemple concret : `formatFileSize(1_048_500)` → `"1024 Ko"` (attendu `"1.0 Mo"`).

### Root causes
Le seuil de bascule (`bytes < 1024*1024`) et la valeur affichée (`toFixed(0)`) utilisent deux référentiels
d'arrondi différents. Le seuil doit porter sur la valeur **arrondie**, pas sur la brute.

### Business impact
`formatFileSize` alimente `formatSingleAttachmentLabelI18n` (label d'une pièce jointe audio/vidéo/image/
document) et `buildMessageNotificationBodyI18n` (corps de notification quand le texte est absent). Une
pièce jointe réelle dont la taille tombe juste sous 1 Mio produit une notification push/in-app affichant
`"🎵 Audio · 1024 Ko"` — chaîne invalide, visible par l'utilisateur final. Non masqué, atteignable en prod.

### Technical impact
Défaut de correctness d'un helper pur. Le sibling `packages/shared/utils/call-summary.ts:formatCallDataSize`
(l.325-326) a été **explicitement durci contre cette exacte classe de bug** avec le commentaire : « Use the
post-rounding value for the unit cutover so e.g. 999.7 KB promotes to '1 MB' rather than printing '1000 KB'. »
Le comportement voulu est donc établi et documenté dans le codebase ; `formatFileSize` omettait de
l'appliquer.

### Risk assessment
Très faible. 2 lignes. Les valeurs déjà correctes (p.ex. `500_000 → "488 Ko"`, `15_000_000 → "14.3 Mo"`)
sont inchangées. Seule la fenêtre de rollover bascule vers la sortie correcte.

### Proposed improvements
Comparer la valeur **arrondie** au seuil, comme le sibling :

```ts
const ko = Math.round(bytes / 1024);
if (ko < 1024) return `${ko} Ko`;
return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
```

### Expected benefits
- Aucune notification n'affiche plus `"1024 Ko"` (chaîne invalide) → rollover Ko→Mo correct.
- Cohérence avec le contrat de formatage déjà établi par `formatCallDataSize`.
- Couverture nette ajoutée sur le bord de mébioctet (auparavant non testé).

### Implementation complexity
Triviale — 2 lignes de production + commentaire. 2 tests de régression (bord de rollover + non-régression
du tier Ko) sur le helper pur exporté `formatSingleAttachmentLabelI18n`.

### Validation criteria
- **RED prouvé** : `formatSingleAttachmentLabelI18n('fr', { type: 'audio', fileSize: 1_048_500 })` →
  `"🎵 Audio · 1024 Ko"` avant fix (échec de `not.toContain('1024 Ko')`).
- Après : `"🎵 Audio · 1.0 Mo"`. `500_000 → "488 Ko"` inchangé. Suite notifications 346/346 verte.

## Backlog mis à jour
- **F102** (nouveau) : `packages/shared/types/attachment.ts:formatFileSize` (algo log-based, decimals=2) —
  même classe de bug sur une fenêtre étroite `[1_048_572, 1_048_575]` → `"1024.00 KB"`. Surface web large
  (consommateurs multiples) → analyse dédiée requise avant fix (hors scope de cette itération ciblée).
- **F104** (nouveau) : `NotificationService.formatFileSize` — pas de tier « Go » (≥ 1 Gio → `"1024.0 Mo"`).
  Impact faible (limites d'upload bien en deçà) ; à traiter si un cas ≥ 1 Gio devient réel.
- **F100** (report) : `isTextMessageStat` — sémantique produit (message texte whitespace-only).
- **F98** (report) : `NotificationService.isDNDActive` — sémantique jour d'une fenêtre DND nocturne.
- **F90** (report) : message-search — recall des traductions.
