# Plan d'itération 60wb (web only)

> Renumérotée **60w → 60wb** (collision : 60w config-modal livré en parallèle par
> `claude/practical-fermat-r4vwgd`, mergé en premier ; périmètres disjoints).

**Objectif** : éliminer l'anti-pattern i18n `t('key') || 'fallback'` (dead-code +
flash-of-raw-keys, leçon 50w) sur la surface `auth` et basculer vers la signature
native `t('key', 'fallback')`.

## Base
- Branche tirée de `main` HEAD post-merge iter-58wd / #796 / #779 / #799 (`9857819`),
  resynchronisée sur `main` post-60w config-modal (`09b7a84`) au merge.
- Branche de travail : `claude/practical-fermat-o2g4dt`.

## Étapes
1. [x] Confirmer le bug au niveau de l'implémentation `use-i18n.ts` (`return fallback || key`).
2. [x] Mesurer la classe de bug (405 occ / 59 fichiers ; 125 / 11 sur auth).
3. [x] Vérifier l'absence de `t(args,params) || 'x'` (cas multi-arg risqué) → aucun.
4. [x] Transformer `t(k) || 'x'` → `t(k, 'x')` sur 10 fichiers auth (76 remplacements).
5. [x] Exclure `PhoneResetFlow.tsx` (collision #786 mergé / #800 ouverte).
6. [x] Vérifier que les clés existent dans `locales/{en,fr}/auth.json` (zéro changement visible).
7. [x] Angliciser les fallbacks FR → valeur EN exacte du locale (anti-flash).
8. [x] Vérifier 0 anti-pattern restant + parenthèses équilibrées sur les 10 fichiers.
9. [x] Commit + push, PR #808, CI verte (tous jobs success).
10. [ ] Merger dans `main` (résolution collision 60w docs) + mettre à jour `branch-tracking.md` + supprimer la branche.

## Hors périmètre / différé
- `PhoneResetFlow.tsx` (post-#800).
- ~270 occurrences sur ~48 fichiers web (admin/conversations/audio/settings/video-calls) → 60wc+.

## Risque
Minimal : transformation mécanique string-level, chaque ligne revue, clés présentes
(comportement runtime inchangé), aucun fichier de test ni JSON locale touché.
# Plan — Itération 60wb (web)

## Objectif
Solder l'anti-pattern buggé **`t('key') || 'texte'`** sur les deux dialogues
d'image (recadrage avatar + upload image de conversation). Surface **orthogonale**
à la PR focus-trap modales parallèle (#802) → zéro fichier partagé.

## Contexte / état du métier
`useI18n.t(key)` renvoie la **clé brute** (truthy) tant que la traduction n'est
pas chargée ou si la clé manque. Le construct `t('key') || 'French'` est donc
**doublement cassé** :
1. Le secours `|| …` ne se déclenche jamais (la clé brute est truthy).
2. Pendant le flash de chargement, la **clé brute** s'affiche (`profile.cropAvatar.zoom`).
+ le secours figé est en français (rupture Prisme).

La signature à 2 arguments `t('key', 'fallback')` traite le 2ᵉ string comme
**fallback natif** (anti-flash), convention établie en 50w (`fallbackLocale='en'`).

## Découverte clé (épuration)
Les 23 clés (`settings.profile.cropAvatar.*` ×8 +
`conversations.conversationImage.*` ×15) **existent déjà** dans les 4 locales →
**aucun fichier locale à modifier**. Les secours anglais en 2ᵉ arg sont recopiés
des valeurs `en/*.json` pour un flash cohérent.

## Changements (2 fichiers, 0 locale)
### 1. `components/settings/avatar-crop-dialog.tsx`
8× `t('profile.cropAvatar.X') || 'French'` → `t('profile.cropAvatar.X', 'English')`
(cropAvatarTitle, zoom, rotation, cropInstructions, reset, cancel, uploading,
processing, saveAvatar).

### 2. `components/conversations/conversation-image-upload-dialog.tsx`
15× `t('conversationImage.X') || 'French'` → `t('conversationImage.X', 'English')`
(processingError toast, title, selectImage, selectImageDescription, chooseFile,
fileRequirements, zoom, rotation, instructions, reset, changeImage, cancel,
uploading, processing, save).

## Hors périmètre (assumé)
- ~236 occurrences restantes du même anti-pattern sur 40 fichiers → différé
  borné, lots cohérents futurs (60w+). Ne pas tout faire d'un coup.
- Commentaires FR internes non user-facing → non touchés.
- Hook `useFocusTrap` (modifié par #802) → non touché (orthogonalité).

## Vérification
- node_modules absent → typecheck/build délégués au CI (cf. 58wb/59w).
- Grep résiduel `') ||` sur les 2 fichiers = 0 ; grep FR JSX user-facing = 0
  (reste : commentaires internes).
- 23 clés présentes ×4 locales (vérifié) → zéro régression d'affichage.

## Suite (différé restant)
- Lots suivants de l'anti-pattern `t() || 'fb'` (40 fichiers, ~236 occ.).
- Focus-trap lightboxes média (`ImageGallery`/`MediaImageCard`) — réservé 60w+ par #802.
- `Badge` success/warning/gold off-palette → arbitrage `theme.colors.*` vs `gp-*`.
