# Plan — Itération 62w (web)

## Objectif
Solder l'anti-pattern buggé **`t('key') || 'French'`** sur le cluster **bulle de
message** (`components/common/bubble-message/`, surface chat LIVE) ET combler 1 clé
i18n **totalement absente** des 4 locales (`bubbleStream.bubble.forwarded`, rupture
Prisme active). Surface **orthogonale** aux PR i18n parallèles en vol (#835 en-tête
conversation, #837/#810 AttachmentPreviewReply, #814 dialogues image, #816/#818
lightboxes, #812 config-modal).

## Base
- Branche tirée de `main` HEAD post-merge iter-60wd (#811, `799ea44`).
- Branche de travail : `claude/practical-fermat-knf2oo`.

## Contexte / état du métier
`useI18n.t(key)` renvoie la **clé brute** (truthy) tant que la traduction n'est
pas chargée ou si la clé manque (`use-i18n.ts`). Le construct `t('key') || 'French'`
est donc **doublement cassé** : secours mort + flash de clé brute, + secours figé
en FR (rupture Prisme). La signature à 2 args `t('key', 'fallback')` traite le 2ᵉ
string comme **fallback natif** (anti-flash, `fallbackLocale='en'`, leçon 50w).

## Découverte clé (1 clé absente ×4 locales)
`bubble.forwarded` (badge « Transféré » des messages transférés) **n'existait dans
aucune locale** sous `bubbleStream` (sous-objet `bubble` inexistant) → la clé brute
`bubble.forwarded` s'affichait en toutes langues. Ajoutée ×4 (en/fr/es/pt), parité
stricte.

## Étapes
1. [x] Confirmer la classe de bug (`use-i18n.ts` + extraction du namespace `bubbleStream`).
2. [x] Mesurer le cluster (6 occ. / 3 fichiers) + tracer les namespaces réels
   (`tBubble = useI18n('bubbleStream')` threadé ; `deleteMessage` local).
3. [x] Vérifier l'existence des clés ×4 locales → 4 OK, **1 absente** (`bubble.forwarded`).
4. [x] Ajouter `bubbleStream.bubble.forwarded` ×4 locales (additif, JSON valide).
5. [x] Transformer `t(k) || 'FR'` → `t(k, 'En')` sur les 6 occ. (secours = valeur EN exacte).
6. [x] Élargir le type `t` prop (`MessageActionsBar`, `MessageContent`) → `(key, fallback?) => string`.
7. [x] Vérifier 0 anti-pattern restant dans le cluster + tests non impactés (mock 1-arg).
8. [ ] Commit + push, PR, CI verte.
9. [ ] Merger dans `main` + mettre à jour `branch-tracking.md` + supprimer la branche.

## Changements (3 fichiers composant, 4 locales)
- `MessageActionsBar.tsx` (4 occ. + type `t`), `MessageContent.tsx` (1 occ. + type `t`),
  `DeleteConfirmationView.tsx` (1 occ.).
- `locales/{en,fr,es,pt}/bubbleStream.json` : +1 clé `bubble.forwarded` chacune.

## Hors périmètre (assumé)
- ~241 occ. restantes du même anti-pattern sur ~38 fichiers → lots cohérents
  bornés futurs (63w+), coordination agents parallèles.
- PR en vol (#835/#837/#810/#814/#816/#818) laissées intactes. **#812 = doublon de
  #806 (config-modal) déjà mergé** → signalé pour fermeture.
- Commentaires FR internes (logs `console.error`) non user-facing → non touchés.

## Risque
Minimal : transformation mécanique string-level + ajout d'1 clé additif (round-trip
JSON, parité ×4). Tests existants non impactés (mock 1-arg compatible avec prop
élargi). node_modules absent → typecheck/build délégués au CI.

## Suite (différé restant)
- Lots suivants de l'anti-pattern `t() || 'fb'` (~38 fichiers, ~241 occ.) par feature.
- `app/settings/loading.tsx` (server i18n), `next-themes` orphelin, épuration
  `settings/_archived/`, console.error FR.
