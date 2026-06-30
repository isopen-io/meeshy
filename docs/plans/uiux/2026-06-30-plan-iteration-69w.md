# Plan — Itération 69w (Web)

> **Scope** : `apps/web` exclusivement. Base : `main` HEAD (db5cf6e, post-#1082/68w). Branche : `claude/practical-fermat-vbsdvr`.

## Objectif
Solder le cluster d'accessibilité clavier du **modal de création de lien de conversation** : rendre opérables au clavier (Enter/Space), focusables et correctement exposés au lecteur d'écran tous les contrôles de configuration aujourd'hui souris-only. Catégorie « différé prioritaire 69w+ » du pointeur autoritaire 68w.

## Étapes
1. **Audit ciblé** `apps/web` (hors clusters 67w/68w) → liste rankée de `<div onClick>`/`role`-less. Cluster retenu : `create-link-modal/`. ✅
2. **LanguagesSection.tsx** : `CardHeader` repliable → `role="button"` + `tabIndex={0}` + `aria-expanded` + `onKeyDown` Enter/Space + `focus-visible`. ✅
3. **PermissionsSection.tsx** : idem. ✅
4. **SelectableSquare.tsx** (substitut de case réutilisé partout dans le modal) → `role="checkbox"` + `aria-checked` + `aria-label` + `aria-disabled` + `tabIndex` (−1 si disabled) + `onKeyDown` Enter/Space (no-op si disabled) + `focus-visible`. ✅
5. **Tests** : 2 nouvelles suites (16 cas) + non-régression. ✅
6. **CI vert** → merge `main` via PR → supprimer branche → MAJ branch-tracking. ⏳

## Contraintes
- 0 nouvelle clé i18n (libellés/titres existants = nom accessible).
- Pattern clavier identique à 67w/68w (inline `onKeyDown`, pas de hook partagé — aucun n'existe).
- Token `focus-visible:ring-ring` (standard shadcn, déjà utilisé `ui/button`, `ui/tabs`).
- Aucune modification de comportement souris (clic préservé, testé).

## Critères d'acceptation
- [x] En-têtes Langues/Permissions activables clavier + `aria-expanded`.
- [x] `SelectableSquare` = checkbox accessible (toutes ses instances).
- [x] jest ciblé 16/16 + non-régression 25/25.
- [x] `tsc --noEmit` 0 erreur sur le diff.
- [ ] CI verte sur la PR, merge `main`, branche supprimée.

## ✅ PLAN EXÉCUTÉ (69w — 2026-06-30)
Toutes les étapes de code/tests/docs faites. Reste : merge `main` après CI verte. Suite (70w+) : audit a11y clavier restant (admin agent Badges, AudioEffectsTimeline, details-sidebar, invite-user-modal) — cf. analyse 69w § différé.
**Objectif** : accessibilité clavier des cartes de communauté (`GroupCard`) sur `/groups` — solder l'anti-pattern `<div onClick>` souris-only signalé par le pointeur 68w (balayage hors video-calls/conversations).

## Étapes
1. [x] Audit transverse `<div>/<span>/<li>` + `onClick` sans `role`/`tabIndex`/`onKeyDown` (hors zones soldées 67w/68w) → cluster `GroupCard` (2 contrôles, 1 fichier, surface à fort trafic).
2. [x] `GroupCard.tsx` carte : `role="button"` + `tabIndex` + `aria-pressed` + `aria-label` + `onKeyDown` Enter/Space + `focus-visible`.
3. [x] `GroupCard.tsx` span copie identifiant : idem + `stopPropagation` clavier (la copie ne sélectionne pas la carte).
4. [x] i18n : 2 clés `groups.card.{openLabel,copyIdentifier}` ×4 locales (interpolation `{name}`/`{identifier}`).
5. [x] Type-safety : élargir `onCopyIdentifier` `MouseEvent` → `MouseEvent | KeyboardEvent` (GroupCard → GroupsList → groups-layout). Aucun cast.
6. [x] Test `__tests__/components/groups/GroupCard.test.tsx` (7 cas, vert).
7. [x] Type-check : 0 erreur sur fichiers modifiés.
8. [ ] Commit → push branche `claude/practical-fermat-8hpdmm` → PR → CI vert → merge `main`.

## Fichiers touchés
- `apps/web/components/groups/GroupCard.tsx` (fix a11y + i18n)
- `apps/web/components/groups/GroupsList.tsx` (type prop)
- `apps/web/components/groups/groups-layout.tsx` (signature handler)
- `apps/web/locales/{en,fr,es,pt}/groups.json` (+`card`)
- `apps/web/__tests__/components/groups/GroupCard.test.tsx` (nouveau)

## Backlog (itérations futures, non détaillé)
- `components/links/` cartes de liens extensibles cliquables.
- `components/contacts/` lignes de contact cliquables.
- `components/admin/` lignes de tableaux cliquables.
# Plan de correction — Itération 69w (Web)

> Base de départ : `main` HEAD (`769f55a`, post-merge 67w/#1078 + 68w/#1082 ; resync effectué). Branche : `claude/practical-fermat-c2m1kd`.
> Scope : `apps/web` exclusivement. Thème : résidus **i18n + a11y** des **overlays d'appel vidéo** (continuité 68w).

## Objectifs (cluster cohérent)
1. **CallInfoOverlay** — localiser + pluraliser le compteur de participants (`participant(s)` codé en dur EN → `calls.info.participant(s)` ×4, interpolation `{count}`).
2. **AudioEffectsPanel** — nommer les 2 boutons info icône-seule (`aria-label={t('moreInfo')}`, `audioEffects.moreInfo` ×4) + corriger `type="button"` manquant.

## Étapes
- [x] Resync branche assignée sur `main` HEAD ; confirmer 67w (#1078) + 68w (#1082) mergées.
- [x] Audit web (sous-agent) → candidats i18n/a11y/dark-mode ; tri des faux positifs (`text-white` sur flux vidéo = intentionnel).
- [x] Vérifier dé-duplication via `branch-tracking.md` (constats absents des lignes `✅`, présents en « Différé » 68w).
- [x] Vérifier l'existence des clés plurielles `{count}` + l'interpolation de `t` (`use-i18n.ts`).
- [x] **RED** : MAJ `CallInfoOverlay.test.tsx` (singulier/pluriel) + NOUVEAU `AudioEffectsPanel.test.tsx` (nom accessible boutons info) → 3 échecs.
- [x] **GREEN** : ajout clés locales ×4 (`calls.info.*`, `audioEffects.moreInfo`) + 2 composants → tests verts.
- [x] Non-régression : `jest` répertoire `video-calls` = **7 suites / 26 tests passed**.
- [x] Docs analyse + plan + tracking + pointeur autoritaire.
# Plan de correction — Itération 69w (Web)

> Base de départ : `main` HEAD (post-merge 67w/#1078 + 68w/#1082, resync effectué). Branche : `claude/practical-fermat-iwrmmn`.
> Scope : `apps/web` exclusivement. Thème : a11y clavier des previews de pièces jointes en zone de réponse (`role="button"` focusable mais sans `onKeyDown`).

## Objectifs (cluster cohérent — 1 fichier)
1. **Miniature image** `AttachmentPreviewReply` → ouverture lightbox au clavier (Enter/Espace).
2. **Icône PDF** → ouverture lightbox PDF au clavier.
3. **Icône texte/code** → ouverture lightbox texte au clavier.
4. **Anneau focus-visible** sur les 3 contrôles (WCAG 2.4.7), token `--primary` (parité 67w/68w).

Les `aria-label` existaient déjà (clés i18n présentes ×4 locales) → **aucune nouvelle clé**.

## Étapes
- [x] Resync branche assignée sur `main` HEAD ; confirmer 67w (#1078) + 68w (#1082) mergées.
- [x] Audit `role="button"` vs `onKeyDown` au niveau fichier → `AttachmentPreviewReply.tsx` (3 occ., 0 keydown) confirmé.
- [x] Écarter les faux positifs (vidéo = `<button>` natif ; audio/autres = `role="listitem"` non interactif).
- [x] **RED** : +6 cas clavier dans `AttachmentPreviewReply.test.tsx` (Enter/Espace image, Enter PDF, Espace texte, no-op touche neutre) → 4 échecs.
- [x] **GREEN** : helper `handleKeyActivate` + signatures `React.SyntheticEvent` + `onKeyDown` sur les 3 contrôles + focus-visible.
- [x] `jest` `AttachmentPreviewReply` → **34/34** ; dossier `attachments` → **7 suites / 236 passed**.
- [x] Docs analyse + plan + tracking.
- [ ] Commit + push + PR + CI `Quality (bun)` + merge `main`.
- [ ] Supprimer la branche après merge ; mettre à jour le pointeur autoritaire.

## Gating CI (rappel tracking)
- **Gater** sur la suite jest spécifique aux fichiers modifiés (`video-calls`) + `Quality (bun)`.
- `Test web` / `Test shared` : historiquement non fiables sur certaines ères (rouges pré-existants hors-web) ; ce diff (i18n + a11y video-calls, aucun fichier auth/shared touché) ne les régresse pas.

## Différé (candidats, itérations futures)
- a11y clavier transverse HORS `video-calls`/`conversations` : `<div onClick>`/`role="button"` sans `onKeyDown`/`focus-visible`.
- Classe résiduelle `t()||fallback` : `PhoneResetFlow.tsx` (56 occ), `StoryViewer`, `app/settings`, `contacts`, `dashboard/LastMessagePreview`.
- `preferences.reducedMotion` applicatif (toggle quasi no-op) — distinct du `prefers-reduced-motion` global déjà câblé (#862).
- **Gater** sur la suite jest spécifique (`AttachmentPreviewReply`) + `Quality (bun)`.
- `Test web` : les tests d'auth périmés (ère #872) sont **soldés** — la suite `forgot-password` est de nouveau verte en local sur `main`. Ce diff ne touche aucun fichier auth/shared.
- `Test shared` : rouge pré-existant hors-web (régression zod v4, propriétaire migration shared) — non bloquant, non touché.

## Différé (candidats a11y clavier, itérations futures 70w+)
- `v2/MediaAudioCard.tsx` (overlay transcription) + `v2/MediaVideoCard.tsx` (overlays play/pause) : `<div onClick>` **sans** `role`/`tabIndex`/`onKeyDown`.
- `ui/foldable-section.tsx` + `v2/CategoryHeader.tsx` : en-têtes accordéon `<div onClick>` (ajouter `role="button"`/`aria-expanded`/clavier).
- `affiliate/share-affiliate-modal.tsx` : onglets/copie en `<div>`/`<span>` cliquables.
- `preferences.reducedMotion` applicatif (toggle quasi no-op, distinct du `prefers-reduced-motion` global #862).
- Classe résiduelle `t()||fallback` (~quelques fichiers : `app/settings`, `contacts`, `PhoneResetFlow`, `StoryViewer`, `dashboard/LastMessagePreview`).
## Objectif
Combler le gap d'accessibilité clavier (WCAG 2.1.1 / 2.4.7) des 3 previews interactives de `AttachmentPreviewReply.tsx` (image, PDF, texte) : `<div role="button">` focusables au Tab mais non activables au clavier et sans focus visible.

## Étapes
1. [x] Audit transverse `<div onClick>` non-`<button>` (hors PR en vol #1084 / #1077) → cluster `AttachmentPreviewReply`.
2. [x] Vérifier anti-doublon (`ImageAttachment`/`FileAttachment` déjà faits, `MediaImageCard` = `<button>`, `MediaVideoCard:245` = backdrop).
3. [x] Ajouter helper DRY `activateOnEnterOrSpace` (Enter/Espace → `preventDefault` + action).
4. [x] Élargir signatures handlers `MouseEvent → MouseEvent | KeyboardEvent` (évite `as unknown`).
5. [x] Brancher `onKeyDown` + classes `focus-visible:ring-*` sur les 3 previews.
6. [x] Étendre les tests (+6 cas Enter/Espace/no-op pour image/PDF/texte).
7. [x] Vérifier : suite verte (34/34), répertoire attachments vert (236), 0 nouvelle erreur tsc.
8. [ ] Commit + push branche `claude/practical-fermat-jwl0pc`.
9. [ ] CI verte → merge dans `main` → MAJ tracking → suppression branche.

## Contraintes
- 0 clé i18n neuve (aria-labels existants ×4 locales).
- Aucune régression visuelle (ajout de classes `focus-visible` uniquement actives au focus clavier).
- Orthogonal aux PR en vol (create-link-modal #1084, auth #1077).

## Résultat
- 3 previews désormais activables Enter/Espace + anneau focus visible.
- `AttachmentPreviewReply.test.tsx` : 28 → 34 tests.
- Pas de nouvelle dette TS (les casts `as unknown` lightbox restent pré-existants, hors-scope).
