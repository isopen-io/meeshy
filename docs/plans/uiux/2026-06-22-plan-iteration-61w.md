# Plan — Itération 61w (Web)

**Base** : `main` HEAD `09b7a84` (post-merge #806 iter-60w config-modal).
**Branche** : `claude/practical-fermat-x2ian5`.

**Objectif** : i18n du hint de geste *dismiss* « Appuyez sur Échap pour fermer » des
lightbox **texte** et **PPTX** (FR figé en TOUTES langues), pour aligner sur le
lightbox markdown frère déjà localisé (`viewers.markdown.escToClose`).

## Pourquoi cette surface

- L'objectif 60w initial (config-modal) a été livré en parallèle (#806 mergé) → ma PR
  #813 fermée comme doublon. Repivot obligatoire sur surface orthogonale.
- Cible **confirmée absente de toute PR ouverte** (scan `list_pull_requests` : 9 PR web
  actives, aucune sur text/pptx lightbox).
- On-thème avec la consigne « gestes habituellement reconnus pour dismiss ».

## Étapes

1. [x] Reset branche sur `main` HEAD post-#806.
2. [x] Scan PR ouvertes → écarter config-modal/AttachmentPreviewReply/PhoneResetFlow/
   admin/auth/image dialogs ; cibler text+pptx lightbox (non contestés).
3. [x] Ajouter `escToClose` à `viewers.text` + `viewers.pptx` ×4 (mirroir de
   `viewers.markdown.escToClose`).
4. [x] `TextLightbox.tsx` → `tViewers('text.escToClose')` (hook déjà présent).
5. [x] `PPTXLightbox.tsx` → ajout hook `useI18n('viewers')` + `tViewers('pptx.escToClose')`.
6. [x] Vérifs : JSON parité ×4, grep FR = 0, `jest TextLightbox` 53/53, tsc 0 erreur
   sur les 2 fichiers.
7. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Clés i18n ajoutées

```
viewers.text.escToClose
viewers.pptx.escToClose
```

## Leçon collision (renforcée ce cycle)

`git fetch origin main` + `list_pull_requests` AVANT de coder ; **vérifier qu'aucune PR
ouverte ne touche le fichier cible** (pas seulement le titre). Cycle à très forte
contention (≥9 agents web) → privilégier les surfaces périphériques (lightbox, viewers)
plutôt que les hubs (settings, attachments, auth).

## Suite (62w+)

`AttachmentDetails.tsx` (code mort → épuration), `console.error` FR, dette typage
`LightboxRenderers` (`unknown`→`Attachment[]`), audit qualité es/pt.
