# Plan — Itération 61w (web)

## Objectif
Internationaliser les **2 dernières chaînes FR figées** de la visionneuse vidéo
plein écran `components/video/VideoLightbox.tsx` — parité avec sa jumelle
`ImageLightbox.tsx` (soldée en 59w). Surface **orthogonale** à toutes les PR en
vol (#804–#814 : config-modal, admin/agent, auth, attachments, anti-pattern
`t()||'fb'`).

## Contexte / état du métier
`VideoLightbox.tsx` est déjà i18n à ~95 % (`useI18n('common')`, tous les
`aria-label`). Restaient 2 surfaces FR figées affichées en TOUTES langues
(rupture Prisme), identiques au défaut corrigé sur `ImageLightbox` :
1. `title` du bouton plein écran (tooltip survol).
2. Bloc d'aide clavier desktop (`<p>…</p>`).

## Changements (1 composant, 4 locales)
### 1. `components/video/VideoLightbox.tsx`
- L668 `title` : `"Quitter le plein écran (F)"`/`"Plein écran (F)"` →
  `t('common.exitFullscreen')`/`t('common.enterFullscreen')` (**réutilise** les
  clés déjà câblées sur l'`aria-label` du même bouton — zéro clé neuve ; retire le
  « (F) » redondant avec l'aide clavier).
- L684-685 aide clavier : `<p>Utilisez les flèches…</p>` →
  `<p>{t('common.videoLightboxKeyboardHelp')}</p>`.

### 2. `locales/{en,fr,es,pt}/common.json`
- 1 clé neuve `common.videoLightboxKeyboardHelp` (après `lightboxKeyboardHelp`),
  texte vidéo (Espace play/pause, M mute, F plein écran) ×4 locales à parité.

## Découverte clé (épuration)
- Les clés `common.exitFullscreen`/`enterFullscreen` **existent déjà** ×4 → le
  `title` ne crée aucune clé. Une seule clé réellement neuve.

## Hors périmètre (assumé)
- Anti-pattern `t()||'fb'` (40 fichiers) → en cours #814, ne pas dupliquer.
- `metadata-test.tsx` (debug FR) → vérifier mort/vivant avant i18n.
- Commentaires FR internes de `VideoLightbox.tsx` → non user-facing.

## Vérification
- node_modules absent → typecheck/build délégués au CI (cf. 58wb/59w/60w).
- JSON valide ×4, clé `videoLightboxKeyboardHelp` présente ×4 (vérifié).
- Grep FR user-facing dans `VideoLightbox.tsx` = 0 (reste : commentaires).

## Suite (différé restant)
- Lots de l'anti-pattern `t()||'fb'` une fois #814 mergée (par feature).
- `metadata-test.tsx` (si vivant en prod).
- `Badge` success/warning/gold off-palette → arbitrage `theme.colors.*` vs `gp-*`.
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
Solder l'anti-pattern buggé **`t('key') || 'French'`** sur le cluster **en-tête de
conversation** (`components/conversations/header/`) ET combler 4 clés i18n
**totalement absentes** des 4 locales (rupture Prisme active). Surface
**orthogonale** aux PR i18n parallèles en vol (#814 dialogues image, #811 admin/
agent, #816/#818 lightboxes, #810/#804 AttachmentPreviewReply, #812 config-modal).

## Base
- Branche tirée de `main` HEAD post-merge iter-60wb (#808, `7f4f093`).
- Branche de travail : `claude/practical-fermat-x182ra`.

## Contexte / état du métier
`useI18n.t(key)` renvoie la **clé brute** (truthy) tant que la traduction n'est
pas chargée ou si la clé manque (`use-i18n.ts:172`). Le construct
`t('key') || 'French'` est donc **doublement cassé** : secours mort + flash de clé
brute, + secours figé en FR (rupture Prisme). La signature à 2 args
`t('key', 'fallback')` traite le 2ᵉ string comme **fallback natif** (anti-flash,
`fallbackLocale='en'`, leçon 50w).

## Découverte clé (4 clés absentes ×4 locales)
`anonymousUser`, `startCall`, `startAudioCall`, `searchMessages` **n'existaient
dans aucune locale** → le secours **FR figé** s'affichait en toutes langues.
Ajoutées sous `conversations.conversationHeader.*` ×4 (en/fr/es/pt), parité stricte.

## Étapes
1. [x] Confirmer la classe de bug (`use-i18n.ts` `return fallback || key` + extraction wrapper `conversations`).
2. [x] Mesurer le cluster (23 occ. / 7 fichiers ; `conversations` namespace).
3. [x] Vérifier l'existence des 19 clés ×4 locales → 14 OK, **4 absentes**.
4. [x] Ajouter les 4 clés manquantes ×4 locales (valeurs alignées sur `startVideoCall`).
5. [x] Transformer `t(k) || 'FR'` → `t(k, 'En')` sur les 23 occ. (secours = valeur EN exacte).
6. [x] Élargir le type `t` (7 déclarations) → `(key, fallback?) => string`.
7. [x] Vérifier 0 anti-pattern restant + 0 secours FR dans les nouveaux appels.
8. [x] Vérifier non-régression des tests (`mockT` 1-arg compatible, autres tests hors périmètre).
9. [ ] Commit + push, PR, CI verte.
10. [ ] Merger dans `main` + mettre à jour `branch-tracking.md` + supprimer la branche.

## Changements (8 fichiers composant, 4 locales)
- `HeaderActions.tsx` (5), `HeaderAvatar.tsx` (3), `HeaderToolbar.tsx` (6),
  `TypingIndicator.tsx` (1), `use-encryption-info.ts` (3), `use-header-actions.ts` (4),
  `ConversationHeader.tsx` (1), `header/types.ts` (type `t`).
- `locales/{en,fr,es,pt}/conversations.json` : +4 clés chacune.

## Hors périmètre (assumé)
- ~247 occ. restantes du même anti-pattern sur ~41 fichiers → lots cohérents
  bornés futurs (62w+), coordination agents parallèles.
- Commentaires FR internes (logs `console.error`) non user-facing → non touchés.
- `ParticipantsDisplay`/`use-header-preferences` : `t` narrowé conservé (aucun
  appel 2 args, type compatible) — pas un oubli.

## Risque
Minimal : transformation mécanique string-level + ajout de clés additif (round-trip
JSON, parité ×4 vérifiée). Tests existants non impactés (mock 1-arg compatible).
node_modules absent → typecheck/build délégués au CI (cf. 58wb/59w/60wb).

## Suite (différé restant)
- Lots suivants de l'anti-pattern `t() || 'fb'` (~41 fichiers, ~247 occ.) par feature.
- `PhoneResetFlow.tsx:490` sr-only indicatif (post-#800) ; `AttachmentPreviewReply`
  title/aria FR (si #810/#804 non mergées).
- `Badge` success/warning/gold off-palette → arbitrage `theme.colors.*` vs `gp-*`.
