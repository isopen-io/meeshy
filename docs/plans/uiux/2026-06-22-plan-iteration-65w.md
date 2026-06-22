# Plan — Itération 65w (web)

## Objectif
Solder l'anti-pattern buggé **`t('key') || 'fallback'`** sur la modale de réglages de
conversation `components/conversations/ConversationSettingsModal.tsx` (surface
orthogonale aux 6 PR 64w en vol) ET corriger le **vrai bug i18n** des 6 clés
`fr`-only affichées en clé brute aux non-francophones.

## Base
- `main` HEAD `be9a663` (post-merge #853, iter-63wb sur `main`).
- Branche assignée : `claude/practical-fermat-s5hyhl` (resync sur `main`).

## Numérotation
**65w** — le slot 64w est saturé (#854/#857/#858/#859/#860). `branch-tracking.md`
(édité par #857) réserve explicitement « 65w+ » pour les fichiers restants de
l'anti-pattern.

## Périmètre (bounded, 1 composant)
- 30 occ. `t(k) || 'FR'` → `t(k, 'English')`.
- 24 clés déjà présentes ×4 → 0 ajout (dead-code + flash).
- 6 clés `fr`-only → ajoutées en en/es/pt (vrai bug : clé brute affichée).

## Étapes
1. [x] Resync branche assignée sur `main` HEAD.
2. [x] Mesurer (30 occ. / 1 fichier ; namespace `conversations`).
3. [x] Vérifier l'existence des clés ×4 → 24 OK, 6 `fr`-only.
4. [x] `t(k) || 'FR'` → `t(k, 'En')` (secours = valeur EN exacte du locale).
5. [x] Ajouter les 6 clés manquantes en/es/pt (`fr` intact) ; parité ×4 ; JSON valide.
6. [x] Ajouter les 6 clés au mock du test (cohérence).
7. [x] Vérifier 0 anti-pattern restant dans le fichier.
8. [ ] Commit + push branche `claude/practical-fermat-s5hyhl`.
9. [ ] PR → CI verte → merge dans `main`.
10. [ ] MAJ minimale `branch-tracking.md` (note SOLDÉ + History 65w).
11. [ ] Supprimer la branche après merge ; repartir de `main` HEAD pour 66w.

## Changements
- `components/conversations/ConversationSettingsModal.tsx` (30 occ.).
- `locales/{en,es,pt}/conversations.json` (+6 clés chacun).
- `__tests__/components/conversations/ConversationSettingsModal.test.tsx` (+6 mock).
- Docs 65w (analyse + plan) + note `branch-tracking.md`.

## Risque
Faible : transformation mécanique vérifiée ; 24 clés présentes (correctif pur
anti-flash) ; 6 clés ajoutées en parité ×4 (corrige un bug visible). Test = mock
1-arg insensible au 2ᵉ arg.

## Suite (66w+)
- ~190 occ. / ~34 fichiers restants de l'anti-pattern → lots bornés orthogonaux.
- Nettoyage documentaire dédié de `branch-tracking.md` (blocs pointeurs + History
  dupliqués) — toujours différé.
