# Iteration 61 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 60 (« Source unique du prédicat d'expiration `isExpired` », mergée dans `main` : PR #1199
/ `7f72782`). Le **domaine expiration** est clos (`formatTimeRemaining` + `isExpired`). Scout iter 61 :
formatage **compact** des compteurs (abréviation K/M) — disjoint des tracks parallèles (initiales, iOS).

## Constat — 3 réimplémentations divergentes du « compteur compact »

| Fichier | Fonction | Comportement |
|---------|----------|--------------|
| `components/v2/PostDetail.tsx:37` | `formatCount` | `K` / `M` **majuscules**, paliers 1 K / 1 M |
| `components/v2/CommunityCarousel.tsx:96` | `formatCount` | `k` **minuscule** / `M`, paliers 1 K / 1 M |
| `app/(connected)/me/page.tsx:41` | `formatNumber` | `k` **minuscule**, **pas de palier million** |

`formatCount` de `admin/ranking/utils.tsx` est **différent** (`toLocaleString` — nombre complet avec
séparateurs, pas d'abréviation) → hors périmètre. Les `sampleRate / 1000` (`kHz`) sont un autre
domaine (audio) → hors périmètre.

### Problèmes (cohérence + état de l'art)
1. **Divergence de casse** : le même compteur affiche `1.2K` (posts) vs `1.2k` (communautés/profil).
   Incohérent au sein du produit.
2. **Bug de couverture** : `me/page` n'a **pas** de palier million → un compteur ≥ 1 M s'affiche
   `2000.0k` au lieu de `2.0M`.
3. **Triplication** d'un algorithme trivial, non testé, non déterministe vis-à-vis des paliers.

### Choix de l'état de l'art
Les plateformes de référence (YouTube, X/Twitter, Instagram) affichent un suffixe **majuscule**
`K` / `M` / `B`. On unifie donc vers ce standard, avec un palier **milliard** (`B`) pour complétude et
la gestion symétrique des négatifs.

## Décision iter 61 — lot « Source unique — compteur compact (F29) »

Créer `apps/web/utils/format-number.ts` → `formatCompactNumber(value)` : `K`/`M`/`B` majuscules, une
décimale, seuil 1 000, négatifs symétriques, pur/déterministe. Converger les 3 fonctions locales
(`PostDetail.formatCount`, `CommunityCarousel.formatCount`, `me.formatNumber`) en délégations.

### Impact comportemental (unification assumée)
- `PostDetail` : **inchangé** (déjà `K`/`M` majuscules).
- `CommunityCarousel` : `k` → `K` (casse unifiée).
- `me/page` : `k` → `K` **et** ajout du palier million (`2000.0k` → `2.0M`, correction de bug).
- Aucun test n'assert l'ancienne sortie (`CommunityCarousel.test.tsx` teste la navigation, pas les
  compteurs) → pas de contrat verrouillé.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F30 | 16 sites `navigator.clipboard.writeText` (copie presse-papier) | MOYEN | Toasts variés — helper `copyToClipboard` à concevoir |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Compteurs compacts unifiés dans `apps/web` vers le standard de l'état de l'art (`K`/`M`/`B` majuscules,
palier million partout) : une source unique pure et testée (`formatCompactNumber`), casse cohérente,
bug million de `me/page` corrigé. Prochain grain : cluster presse-papier (F30, helper `copyToClipboard`),
slug/url, sanitize, ou validateurs téléphone (F25b).
