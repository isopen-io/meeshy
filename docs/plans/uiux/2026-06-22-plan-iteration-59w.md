# Plan — Itération 59w (web) : accessibilité i18n des saisies OTP

## Objectif
Internationaliser et compléter les labels d'accessibilité des **4 saisies de code
OTP** des flows d'authentification (récupération, reset téléphone, vérification
téléphone, vérification 2FA). Surface orthogonale au cluster feed/reels en forte
contention (agents parallèles).

## Base de départ
- Branche : `claude/practical-fermat-se47fi`, resynchronisée sur `main` HEAD
  `98f2ce5` (post-merge #666/#774/#776).

## Étapes
1. **i18n** — Ajouter bloc `auth.otp` (2 clés) dans `locales/{en,fr,es,pt}/auth.json` :
   - `groupLabel` : "{length}-digit verification code" (+ FR/ES/PT)
   - `digitLabel` : "Digit {index} of {total}" (+ FR/ES/PT)
   - Insertion additive après `"auth": {` (diff minimal, round-trip JSON validé). ✅
2. **`components/auth/recovery/OTPInput.tsx`** — import + `useI18n('auth')` ;
   remplacer les 2 `aria-label` FR figés par `t('otp.groupLabel'/'otp.digitLabel')`. ✅
3. **`components/auth/PhoneResetFlow.tsx`** — `useI18n('auth')` dans l'`OTPInput`
   inline ; remplacer les 2 `aria-label` FR figés. ✅
4. **`app/auth/verify-phone/page.tsx`** — `useI18n('auth')` dans l'`OTPInput`
   inline ; **ajouter** `role="group"` + 2 `aria-label` + `autoComplete="one-time-code"`. ✅
5. **`app/auth/verify-2fa/page.tsx`** — idem (length variable via prop). ✅

## Vérification
- Grep FR résiduel (`Chiffre `/`Code de vérification`) → vide. ✅
- JSON valide ×4 locales, parité 2 clés. ✅
- Interpolation `{length}`/`{index}`/`{total}` confirmée (`use-i18n.ts`). ✅
- Typecheck/build délégué au CI (`node_modules` absent en routine).

## Hors périmètre (différé)
- `config-modal.tsx` (libellés onglets FR) → 60w.
- `PhoneResetFlow.tsx:490` `sr-only` `Indicatif pays`.
- `AttachmentPreviewReply.tsx` title/aria FR.
- feed/reels → agents parallèles.

## Merge
PR vers `main` ; après merge, mettre à jour `branch-tracking.md` + supprimer la branche.
</content>

---

# Plan — Itération 59w (web)

## Base
- Repartir de `main` HEAD `5148505` (post-merge #787 iter-58wb PostsFeedScreen + FeedTabs).
- Branche de travail : `claude/practical-fermat-gkkftf-59w` (créée depuis `main`).

## Contexte
- Revue des analyses `docs/analyses/uiux/` + plans `docs/plans/uiux/` : tout le
  cluster feed 53w est soldé (ReelPlayer #774, ReelsFeedScreen #780, PostsFeedScreen
  #787) ; modales hand-rolled 58w soldées ; rouge erreur 56wb soldé.
- Audit d'optimisation orienté **surfaces live user-facing**. Faux positif écarté :
  `components/settings/font-selector.tsx` contient ~12 chaînes FR figées MAIS n'est
  monté QUE par `components/settings/_archived/settings-layout.tsx` (code archivé,
  jamais rendu en prod) — i18n d'un composant mort = valeur nulle. **NE PAS i18n
  font-selector tant qu'il reste dans `_archived`.**
- Cible 59w : `components/attachments/ImageLightbox.tsx` — visionneuse d'images
  plein écran **live** (montée partout où une image est ouverte). Déjà i18n à 90 %
  (boutons download/close/nav/zoom/rotate) mais **3 chaînes FR figées** restantes
  + lacune a11y dialog.

## Objectif
1. i18n des 3 dernières chaînes FR de `ImageLightbox` (rupture Prisme — affichées
   en TOUTES langues) :
   - L209 `Impossible de charger l'image` → `t('common.imageLoadError', ...)`
   - L220 bouton `Télécharger quand même` → `t('common.downloadAnyway', ...)`
   - L337 aide clavier `Utilisez les flèches ← →…` → `t('common.lightboxKeyboardHelp', ...)`
2. a11y : sémantique dialogue sur le portail plein écran (pattern 58w) —
   `role="dialog"` + `aria-modal="true"` + `aria-label={t('common.imageViewer')}`.

## Étapes
1. [x] 4 clés neuves sous l'objet `common` de `locales/{en,fr,es,pt}/common.json`
   (`imageViewer`, `imageLoadError`, `downloadAnyway`, `lightboxKeyboardHelp`).
2. [x] `ImageLightbox.tsx` : 3 swaps `t()` (fallbacks EN 2e arg, leçon 50w) +
   `role`/`aria-modal`/`aria-label` sur le `motion.div` racine.
3. [x] Vérif : JSON valide ×4 ; parité des 4 clés ×4 locales ; grep FR résiduel = 0.
4. [x] Annoter analyse + `branch-tracking.md` (58wb mergée, base 59w, ne plus
   re-flagger ImageLightbox ni font-selector archivé).
5. [ ] Commit + push ; PR ; merge `main` après CI vert ; supprimer la branche.

## Contraintes
- Fallbacks EN en 2e arg (anti-flash, leçon 50w).
- Namespace `common` réutilisé (le composant fait déjà `useI18n('common')`) —
  aucun nouveau namespace, aucun nouvel import.
- Gestes déjà conformes (Escape→close, clic backdrop→close, flèches nav) : ne pas
  retoucher la logique clavier/souris, seulement la sémantique a11y manquante.
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (60w+)
- `Badge` v2 variants success/warning/gold hexes off-palette — **nécessite arbitrage
  `theme.colors.*` vs `gp-*` AVANT toute migration** (déféré 56wb, ne pas trancher
  à l'aveugle).
- focus-trap complet sur `ConversationDrawer` + `AgentTopicEditModal` (58w laissait
  ce reliquat borné).
- `font-selector.tsx` : décider épuration (suppression `_archived/`) OU i18n si
  ré-activé — NE PAS i18n tant qu'archivé.
- console.error FR (logs dev, non bloquant) ; `next-themes` orphelin (touche lockfile).

---

# Plan — Itération 59w (web only)

## Base
- `main` HEAD post-merge iter-58w `#792` (`1d1b3b6`).
- Branche de travail : `claude/practical-fermat-sgqj60`.

## Contexte — pivot après collision
Le 58w (Escape + dialog semantics) a été livré en parallèle par #792. Le doublon
strict de ce run (#793) a été fermé. Pivot sur le volet différé « 59w+ » par
#792 : le **focus-trap** des 2 dialogues maison.

## Objectif
Compléter l'a11y clavier des 2 dialogues en **réutilisant** le hook canonique
`useFocusTrap` (Single Source of Truth), pas de réimplémentation.

## Étapes
1. [x] Étendre `hooks/use-accessibility.ts` `useFocusTrap` : focus-restore au
   cleanup ; signature `RefObject<HTMLElement | null>` (rétro-compatible).
2. [x] `ConversationDrawer` : `panelRef` + `useFocusTrap(panelRef, isOpen)`.
3. [x] `AgentTopicEditModal` : `panelRef` + `useFocusTrap(panelRef, true)`.
4. [x] `tsc --noEmit` 0 erreur sur les 3 fichiers ; vérifier non-impact des
   tests settings qui mockent le hook.
5. [x] Analyse + `branch-tracking.md` (collision #793, 59w, focus-trap soldé).
6. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes / décisions
- **Réutiliser** `useFocusTrap` existant (0 consommateur) — ne pas dupliquer.
- Pas de focus auto perturbant : le hook focus le 1er élément focusable (close /
  champ) — comportement modal standard, acceptable.
- Aucune nouvelle dépendance ; aucune autre frontend (iOS/Android hors périmètre).

## Suite (60w+)
`PostsFeedScreen.tsx` (~30, large), `Badge` off-palette (arbitrage tokens),
`app/settings/loading.tsx` (server-component i18n).
