# Plan de correction — itération 92w (web)

**Analyse** : `docs/analyses/uiux/2026-11-22-iteration-92w.md`
**Objectif** : l'accusé du libellé d'accessibilité d'un message (`aria-label` de
la rangée) se dit dans la LANGUE DU LECTEUR, pas en français en dur — jumelle
`deliveryWord` supprimée au profit du `statusLabel` TRADUIT et PARTAGÉ du pied de
rangée.

## Doctrine de branche

| | |
|---|---|
| Base de départ | `origin/dev` (HEAD `ec490d596`) |
| Cible de la PR | `dev` (auto-merge au vert, #9226) |
| Branche de travail | `claude/practical-fermat-xtlc3p` |

## Étapes (RED → GREEN)

1. **RED** — describe « l'accusé reprend le vocabulaire traduit du pied (92w) »
   dans `message-a11y-label.test.ts` : `delivery:'read'`/`language:'en'` →
   contient « read », pas « lu » ; `delivery:'delivered'`/`language:'fr'` →
   « remis », pas « distribué » ; non-régression FR pending/sent/read.
2. **GREEN** — unifier sur une source traduite :
   - Extraire `STATUS_KEY` + `statusLabel` de `components/message-blocks.tsx` vers
     un module PUR `lib/view/message-status-label.ts` ; `message-blocks` l'importe
     et le RÉEXPORTE (ses 12 consommateurs inchangés).
   - `lib/view/message-a11y-label.ts` : supprimer `deliveryWord`, appeler
     `statusLabel(delivery, language)` dans la branche `isMine`.
   - Rafraîchir les commentaires de `focal-row.tsx` qui nommaient `deliveryWord`.
3. **Vérifier** : suite a11y 41/41 ; consommateurs `statusLabel` 72/72 ;
   `tsc --noEmit` = 0 ; gate d'harmonie #8879 = 0 (inchangé).
4. **Livrer** : PR vers `dev`, auto-merge au vert ; annoter l'analyse
   `✅ Statut : CORRIGÉ (iter-92w)` ; mettre à jour `web-iteration-pointer.md`.

## Résultat

- Suite a11y **38 → 41** GREEN ; consommateurs **72/72** ; `tsc` 0 ; harmonie 0.
- FR : pending/sent/read **byte-identiques** ; `delivered` « distribué » → **« remis »**
  (unification avec le pied de rangée). Les 6 autres langues disent enfin l'accusé.
- **Aucune nouvelle traduction** : les clés `message.status.*` existaient déjà ×7.

## Suite — 93w+ (DETTE, à ouvrir en issue)

Le reste de `composeMessageLabel` garde des segments EN DUR EN FRANÇAIS (« Sans
compte », comptes de pièces jointes, « modifié », « épinglé », « réponse à »,
« Position », « sticker », « réactions ») — même défaut, clés NEUVES ×7 requises
(dont pluriel + arabe). À traiter par petits paquets, d'abord les segments sans
pluriel, en réutilisant le vocabulaire des surfaces quand il existe. Voir le pied
de l'analyse 92w. Remesurer le gate d'harmonie à chaque ouverture.

## ✅ Statut : LIVRÉ (iter-92w)
