# Plan — Itération 64wb (web)

## Base
- Branche tirée de `main` HEAD `39f02b3` (post-merge #849 iter-63w sidebar détails conv).
- Branche de travail : `claude/practical-fermat-16bsl0`.

## Objectif
Éliminer l'anti-pattern i18n `t('key') || 'fallback'` sur le gros porteur
`components/conversations/ConversationSettingsModal.tsx` (**29 occ.**, le plus volumineux non couvert) —
surface **orthogonale** aux 6 PR web en vol (#852–#858).

## Contexte / état du métier
`useI18n.t(key)` renvoie la **clé brute** (truthy) si la clé manque (`use-i18n.ts` `return fallback || key`).
Le construct `t('key') || 'fallback'` est donc cassé : secours mort + clé brute affichée. La signature à
2 args `t('key', 'fallback')` traite le 2ᵉ string comme **fallback natif** (anti-flash, leçon 50w).

## Découverte critique (bug visible, pas hygiène)
5 clés (`conversationDetails.{activity,viewAllParticipants,mediaAndAppearance,changeBanner,uploadBanner}`)
étaient **absentes de en/es/pt** (présentes seulement en fr) → les utilisateurs en/es/pt voyaient la
**clé brute dottée** dans la modale. Les 29 secours `||` étaient en **FRANÇAIS** (rupture Prisme).

## Étapes
1. [x] Reset branche sur `main` HEAD `39f02b3`.
2. [x] `list_pull_requests` → écarter #852–#858 ; cibler ConversationSettingsModal (non contesté).
3. [x] Mesurer : 29 occ. (namespace `conversations`).
4. [x] Vérifier l'existence des clés ×4 → **5 manquantes en/es/pt** détectées.
5. [x] Ajouter les 5 clés ×3 locales (en/es/pt) sous `conversationDetails.*` (fr complet).
6. [x] Transformer les 29 `t(k) || 'FR'` → `t(k, 'English')` (secours = valeur EN exacte du locale).
7. [x] Vérifier 0 anti-pattern restant + parité ×4 + JSON valide.
8. [ ] Commit + push, PR, CI verte.
9. [ ] Merger dans `main` + `branch-tracking.md` + supprimer la branche.

## Changements
- `components/conversations/ConversationSettingsModal.tsx` (29 lignes).
- `locales/{en,es,pt}/conversations.json` (+5 clés chacun ; fr inchangé).

## Hors périmètre (assumé)
- Gros porteurs restants : `PhoneResetFlow.tsx` (56), `magic-link` (44), `verify-phone` (26),
  `links/tracked/[token]` (15), `useMessageActions` (10) → lots bornés dédiés 65w+. Vérifier les clés ×4.

## Risque
Faible : transformation mécanique string-level + ajout additif de 5 clés (clés vérifiées présentes ×4
après ajout). Test existant vert (mock `t` ignore le 2ᵉ arg). node_modules absent → CI fait build/typecheck.
