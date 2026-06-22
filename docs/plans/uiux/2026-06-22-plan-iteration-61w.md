# Plan — Itération 61w (web)

## Objectif
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
