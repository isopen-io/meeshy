# Iteration 70 — Analyse d'optimisation (2026-07-01)

## Protocole renforcé v2 (démarrage) — OK
`main` réaligné (`026b2bb0`, force-update détecté vs branche de travail — branche de travail remise à zéro sur
`origin/main`). Environnement re-provisionné (clone frais, `node_modules` absent) :
- `bun install` : les scripts `postinstall` de `@prisma/engines` échouent (`ECONNRESET`, CDN
  `binaries.prisma.sh` bloqué par le proxy — **identique iter 68/69**). Installé avec `--ignore-scripts`
  (2081 paquets) → **web + shared vérifiables**, **gateway non vérifiable** (client Prisma non générable).
- Baseline `tsc --noEmit` (apps/web) : **1198 erreurs pré-existantes** (identique iter 69 → aucune dérive).
- `packages/shared` : `bun run build` (dist) exit 0 ; vitest exit 0.

**Contrainte environnement (rappel)** : le type-check/tests **gateway** ne sont **pas vérifiables** en local
(Prisma). On cible donc à nouveau un cluster **web/shared** à CI garantie verte. **F32 (SSOT ObjectId gateway)**
reste en backlog tant que le proxy bloque le CDN Prisma.

## Choix de cible — anti-collision + vérifiabilité + impact SSOT
Fan-out d'exploration (agent Explore) → 5 candidats web mécaniques. Analyse de sémantique :

| Candidat | Sites | Verdict |
|----------|-------|---------|
| `capitalize` (`x.charAt(0).toUpperCase()+slice(1)`) | ~4 réels | **Conflaté** par l'agent avec l'initiale d'avatar (`(x\|\|'U').charAt(0).toUpperCase()`, ~20 sites, **sémantique différente** : 1 seul caractère, pas de `+slice(1)`, char de fallback variable). Fusion **non mécanique** → backlog F33. |
| initiale d'avatar | ~20 | Fallback char divergent (`'U'`/`'C'`/`'#'`) + chaînes de fallback multiples → **non mécanique**. Backlog F33. |
| `msToSeconds` (`Math.floor(ms/1000)`) | 8 | Arithmétique triviale — wrapper = sur-abstraction (CLAUDE.md « ne pas sur-ingénier »). **Écarté.** |
| `isValidUrl` (`try{new URL()}catch`) | 3 | Bon, mais 3 sites et `xss-protection.ts` à étendre — backlog F34. |
| localStorage JSON | 13 | Gestion d'erreur/fallback **divergente par site** → risque comportemental. Backlog F35. |

### Constat retenu — `formatFileSize` réimplémenté hors de la source unique
Une **source unique de vérité existe déjà** : `formatFileSize()` dans `@meeshy/shared/types/attachment`
(B/KB/MB/GB/TB, clamp au dernier palier, `parseFloat(.toFixed(2))`), consommée par **~15 sites**
(MessageComposer, FilePreviewCard, Image/File/Video/PDF lightboxes, `attachmentService`, `tusUploadService`…).
**Trois** modules la **réimplémentent en ligne**, violant le principe *Single Source of Truth* :

| Fichier | Forme locale | Rapport à la SSOT |
|---------|--------------|-------------------|
| `components/attachments/AttachmentDetails.tsx:60` | `const formatFileSize` (B/KB/MB/GB, `toFixed(2)`) | **byte-identique** pour tailles réalistes (< 1 TB) |
| `utils/media-compression.ts:319` | `function formatFileSize` (idem) | **byte-identique** |
| `app/admin/monitoring/page.tsx:272` | `const formatBytes` (`toFixed(1)`) | diffère **uniquement** par la précision (1 vs 2 décimales) |

Un 4e module — `components/admin/user-detail/UserMediaSection.tsx:41` `formatSize` — a une **sémantique
distincte** (`''` si falsy, `toFixed(0)` en KB, seuils manuels B/KB/MB). **Non fusionné** → backlog F36.

## Cible iter 70 — Convergence sur la source unique `formatFileSize`

### Conception (préservation de comportement)
1. **Extension rétro-compatible** de la SSOT : `formatFileSize(bytes, options?: { decimals?: number })`,
   `decimals` par défaut **2** → les **~15 appelants existants sont strictement inchangés**. `monitoring`
   passe `{ decimals: 1 }` pour **reproduire exactement** son ancien affichage.
2. `AttachmentDetails.tsx` + `media-compression.ts` : suppression de la copie locale → import de la SSOT
   (byte-identique).
3. `monitoring/page.tsx` : `formatBytes` devient un alias `formatFileSize(bytes, { decimals: 1 })` — **les
   sites d'appel restent inchangés** (impact minimal).

### Pourquoi ce choix
- **Purement mécanique + vérifiable** (web tsc baseline + jest ciblé + vitest shared), CI garantie verte.
- Renforce un **SSOT existant** plutôt que d'en créer un nouveau → cœur du principe *Single Source of Truth*.
- Les candidats plus volumineux (avatar-initial, localStorage) portent une **variance sémantique** qui les
  rend non-mécaniques → différés proprement au backlog.

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| **F32** | Regex ObjectId dupliquée **gateway** (~25 sites) — non vérifiable local (Prisma). | MOYEN-HAUT |
| **F33** | Initiale d'avatar `(x\|\|'…').charAt(0).toUpperCase()` (~20 sites) + `capitalize` (~4) — fallback/chaînes divergents, **non mécanique**. Nécessite un helper `avatarInitial(name, opts)` + audit par site. | MOYEN |
| **F34** | `isValidUrl` (`try{new URL()}catch`) — 3 sites → exporter depuis `xss-protection.ts`. | FAIBLE-MOYEN |
| **F35** | localStorage JSON (13 sites) — gestion d'erreur/fallback divergente, refactor comportemental. | MOYEN |
| **F36** | `UserMediaSection.formatSize` — sémantique compacte distincte (`''`/`toFixed(0)`), ne pas fusionner tel quel. | FAIBLE |
| F25b | Deux validateurs téléphone (`phone-validator` simple vs `phone-validation-robust` libphonenumber) — APIs divergentes. | MOYEN |

## Gain
Réimplémentations locales de « octets → lisible » : **3 → 0**. `formatFileSize` : **1 seule** implémentation
(SSOT étendue, rétro-compatible). tsc : **0 régression** (1198 = 1198). vitest shared : **153/153** (dont
**+3** nouveaux tests `decimals`/clamp). jest web : **80/80** sur les 3 suites impactées. Lint exit 0.
