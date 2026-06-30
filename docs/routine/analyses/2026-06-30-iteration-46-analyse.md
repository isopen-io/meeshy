# Iteration 46 — Analyse d'optimisation (2026-06-30)

> **Renumérotation / résolution de collision** — Ce lot a d'abord été produit sous le numéro
> « 45 ». Un agent parallèle a mergé dans `main`, le même jour, une **autre** itération 45 (lot
> **F23** : `getUnreadCountsForParticipants` N `message.count` → 1 `message.findMany` + dichotomie,
> dans `MessageReadStatusService.ts`). Les deux lots sont **disjoints** (F23 = gateway ; F24 = web
> `formatFileSize`) ; seuls les **noms de fichiers** docs entraient en collision (add/add).
> Résolution : ce lot devient l'**itération 46** ; F23 est retiré du backlog (fait dans `main`).

## Contexte
Suite iter 44 (« Source unique de l'arithmétique calendaire — F18c ») puis iter 45 parallèle
(« Comptes de non-lus : N requêtes → 1 requête + dichotomie — F23 », mergée dans `main` :
`getUnreadCountsForParticipants` collapse N `message.count` en 1 `message.findMany` index-backed +
bucketing dichotomique). Les lots iter 43/44 ont épuisé la duplication **date/temps** ; iter 45 a
traité le poste DB dominant de la diffusion.

Le scout iter 46 (lecture seule, monorepo complet) a cherché la prochaine duplication de
**logique pure** consolidable avec sortie préservée, testable sur runner Linux (shared vitest /
web jest). Constat le plus net : **le formatage de taille de fichier** est réimplémenté
localement dans 3 fichiers web alors qu'une fonction canonique existe déjà et est testée.

Surfaces testables sur ce runner :
- **shared vitest** : baseline **1208/1208 vert** (gate bloquante). `formatFileSize` déjà
  couvert par `packages/shared/__tests__/types/attachment.test.ts` (0 B → TB, 150 tests verts).
- **web jest** : `attachmentService.test.ts` + `tusUploadService.test.ts` **110/110 vert** ;
  `AttachmentDetails.test.tsx` + `media-compression.test.ts` **62/62 vert** (assertions de
  taille : `2 MB`, `500 KB`, `5 GB`, `0 B`…).
- gateway/iOS : hors périmètre (gateway garde sa variante FR — voir plus bas).

## Audit — constats vérifiés (F24)

### Source unique existante (l'ancre SSOT)
`packages/shared/types/attachment.ts:765` exporte la fonction canonique :
```ts
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeIndex = Math.min(i, FILE_SIZE_UNITS.length - 1); // ['B','KB','MB','GB','TB']
  return `${parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(2))} ${FILE_SIZE_UNITS[sizeIndex]}`;
}
```
Déjà importée par **8 sites** web (`FileAttachment`, `ImageAttachment`, `ImageLightbox`,
`VideoLightbox`, `PDFLightboxSimple`, `FilePreviewCard`, `attachmentService`, `tusUploadService`).

### 1. Réimplémentation locale byte-identique — `media-compression.ts:319`
```ts
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];                  // PAS de TB, PAS de clamp
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
```
Sortie identique au canonique pour tout fichier < 1 To. Pour ≥ 1 To, le local émet
`X undefined` (`sizes[4]` indéfini) là où le canonique borne à `TB` → **le canonique est
strictement plus correct**. Usage unique : message « fichier trop volumineux, compression… ».

### 2. Réimplémentation locale byte-identique — `AttachmentDetails.tsx:60`
Copie mot-pour-mot de la variante #1 (même `sizes` à 4 unités, même absence de clamp). 5 appels
(l.138/151/167/183/198). Couverte par `AttachmentDetails.test.tsx` (assertions `2 MB`, `500 KB`,
`5 GB`…), toutes égales à la sortie canonique → délégation sûre, tests inchangés.

### 3. Réimplémentation locale **divergente** — `MessageComposer.tsx:135`
```ts
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;  // 1 décimale
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;                   // 1 décimale, pas de GB/TB
}
```
Sortie **différente** du reste de l'app : 1 décimale fixe (`1.5 KB`, `10.0 MB`) vs 2 décimales
ajustées (`1.46 KB`, `10 MB`), et aucun palier GB/TB. Un même fichier de 1,46 Ko s'affiche donc
`1.5 KB` dans le composer mais `1.46 KB` dans la fiche de détail — **incohérence de Prisme**
(principe « Cohérence : le prisme s'applique à TOUT le contenu »). Aucun test n'asserte la sortie
du composer → délégation = **amélioration de cohérence délibérée**, pas une régression masquée.

### Hors périmètre (justifié) — gateway `NotificationService.ts:40`
```ts
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;                       // FR : « o » et non « B »
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
```
Localisation **française** du texte de notification (octets/Ko/Mo). Sémantiquement distincte du
canonique anglais ; l'unifier exigerait un paramètre `locale` + changement d'arrondi (risque sur
contenu visible côté push). **Conservée locale**, consignée pour un futur lot i18n dédié (F24b).

## Décision iter 46 — lot « Source unique du formatage de taille de fichier (F24) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Ancrer le canonique : vérifier que `formatFileSize` (shared) reste l'unique SSOT (déjà testé vitest) | SSOT — gate bloquante shared |
| B | `media-compression.ts` : supprimer le local, importer depuis `@meeshy/shared/types/attachment` | Dédup ; +correct (TB) ; web jest `media-compression` vert |
| C | `AttachmentDetails.tsx` : supprimer le local, importer depuis le canonique | Dédup ; +correct (TB) ; `AttachmentDetails.test.tsx` 28/28 vert |
| D | `MessageComposer.tsx` : supprimer le local divergent, importer le canonique | **Cohérence d'affichage** app-wide (2 déc. + paliers GB/TB partout) |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill ; fenêtre de maintenance |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` (User/Community) | MOYEN | États distincts ; audit sémantique + backfill |
| F23b | Audit sémantique `senderId` vs `participant.id` dans le compte batché (cf. iter 45 F23) | MOYEN | Vérifier si la discordance est visible avant correction |
| F24b | Unifier la variante FR gateway (`o`/`Ko`/`Mo`) via un `formatFileSize` locale-aware shared | FAIBLE | Change l'arrondi de contenu push visible ; lot i18n dédié |

> **F23 — FAIT** (itération 45 parallèle, mergée dans `main`) : `getUnreadCountsForParticipants`
> exécute désormais 1 `cursor.findMany` + 1 `message.findMany` index-backed + bucketing
> dichotomique au lieu de N `message.count`. Retiré du backlog.
| F18d | Unifier la **queue de présentation** date/weekday | FAIBLE | Queues hétérogènes ; gain marginal |

## Gain estimé global
Source unique pour le formatage de taille de fichier : **3 réimplémentations locales éliminées**
(~22 LOC), la totalité des 11 sites web pointant désormais sur le canonique testé. Deux
délégations byte-identiques (et strictement plus correctes ≥ 1 To) + une délégation qui **unifie
l'affichage** (cohérence de Prisme : un fichier de taille donnée s'affiche à l'identique partout).
Couvert par la gate bloquante shared vitest (`formatFileSize` 0 B→TB) + web jest
(`attachmentService`/`tusUploadService` 110/110, `AttachmentDetails`/`media-compression` 62/62).
