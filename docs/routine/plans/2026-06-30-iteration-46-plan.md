# Iteration 46 — Plan d'implémentation (2026-06-30)

> **Renumérotation** : lot d'abord produit comme « 45 », rencommé en **46** suite à la collision
> de noms de fichiers docs avec l'itération 45 parallèle (F23, comptes de non-lus) mergée dans
> `main` le même jour. Lots disjoints — aucune collision de code. Voir l'analyse.

## Objectif
Lot « Source unique du formatage de taille de fichier (F24) » : éliminer les 3 réimplémentations
locales web de `formatFileSize` en les faisant déléguer à la fonction canonique déjà testée
(`packages/shared/types/attachment.ts`). Sorties byte-identiques pour B/C ; **unification
d'affichage délibérée** pour D (composer). Gateway FR conservée (F24b).

## Pré-requis runner (parité CI)
- [x] `packages/shared && bun run build` (tsc) → `dist/` présent (sinon web jest ne résout pas
      `@meeshy/shared`).
- [x] Baselines vertes : shared vitest **1208/1208** ; web jest `attachmentService`+`tusUploadService`
      **110/110**, `AttachmentDetails`+`media-compression` **62/62**.

## Étapes (délégation à une SSOT déjà testée — pas de nouveau RED shared requis)

### Phase A — Ancre SSOT (vérif, aucune modif)
- [ ] Confirmer `formatFileSize` exporté de `packages/shared/types/attachment.ts` et couvert par
      `__tests__/types/attachment.test.ts` (0 B → TB). Aucune modification shared.

### Phase B — `apps/web/utils/media-compression.ts`
- [ ] Supprimer le `function formatFileSize` local (l.316-325) + son commentaire.
- [ ] Ajouter `import { formatFileSize } from '@meeshy/shared/types/attachment';` en tête.
- [ ] `node_modules/.bin/jest __tests__/utils/media-compression.test.ts` → vert.

### Phase C — `apps/web/components/attachments/AttachmentDetails.tsx`
- [ ] Supprimer le `const formatFileSize` local (l.59-66) + son commentaire.
- [ ] Importer `formatFileSize` depuis `@meeshy/shared/types/attachment` (regrouper avec un import
      existant si présent).
- [ ] `node_modules/.bin/jest __tests__/components/attachments/AttachmentDetails.test.tsx` → vert
      (assertions `2 MB`/`500 KB`/`5 GB`/`0 B` inchangées).

### Phase D — `apps/web/components/v2/MessageComposer.tsx`
- [ ] Supprimer le `function formatFileSize` local divergent (l.135-139).
- [ ] Ajouter `import { formatFileSize } from '@meeshy/shared/types/attachment';`.
- [ ] `node_modules/.bin/jest __tests__/components/common/message-composer.test.tsx __tests__/components/message-composer/integration.test.tsx`
      → vert (aucune assertion de taille ; unification d'affichage assumée).

### Phase E — Vérification & livraison
- [ ] `tsc --noEmit` web : aucun nouveau type error sur les 3 fichiers touchés.
- [ ] Suite web jest ciblée (B+C+D) verte ; shared vitest **1208/1208** inchangé.
- [ ] Commit + push `claude/sharp-wozniak-dx26dd` ; PR vers `main` ; CI verte ; **merge dans main**.

## Hors périmètre (consigné dans l'analyse)
F2 (staging), F10 (dual-write/backfill), F21 (sémantique), F23b (audit `senderId`/`participant.id`),
F24b (formatFileSize locale-aware gateway FR), F18d (queue de présentation date).
**F23 est FAIT** (itération 45 parallèle mergée dans `main`) — retiré du backlog.

## Continuité
Iter 47+ : **F24b** (formatFileSize locale-aware côté gateway/i18n) si une fenêtre i18n s'ouvre ;
sinon scout d'une nouvelle duplication pure (validators regex, array utils). **F23b** (audit
sémantique `senderId` vs `participant.id` dans le compte batché d'iter 45) si confirmé visible ;
F2/F10/F21 dès qu'une fenêtre staging/backfill existe.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — ancre SSOT confirmée : `formatFileSize` (shared) reste l'unique canonique,
      couvert par `attachment.test.ts` (vitest **150/150**, suite shared **1208/1208**).
- [x] Phase B — `media-compression.ts` : local supprimé, import depuis le canonique.
      web jest `media-compression` vert.
- [x] Phase C — `AttachmentDetails.tsx` : local supprimé, `formatFileSize` regroupé avec
      `getAttachmentType`. `AttachmentDetails.test.tsx` vert (assertions de taille inchangées).
- [x] Phase D — `MessageComposer.tsx` : local divergent supprimé, import canonique
      (affichage unifié app-wide). `message-composer` + `integration` verts.
- [x] Phase E — 6 suites web affectées **218/218** vertes ; `tsc --noEmit` web : **aucun
      nouveau** type error sur les 3 fichiers touchés (les 2 erreurs visibles —
      `AttachmentDetails` `(attachment as unknown).metadata`, `StreamComposer` `ref`— pré-existent
      à HEAD). Reste : push + PR + CI verte + merge dans main.
