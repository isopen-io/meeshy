# Plan de correction — itération 93w (web)

**Analyse** : `docs/analyses/uiux/2026-11-23-iteration-93w.md`
**Objectif** : trois segments du libellé d'accessibilité d'un message
(`aria-label` de la rangée) qui restaient EN DUR EN FRANÇAIS — « réponse à
{auteur} », « modifié », « épinglé » — descendent le catalogue, FR byte-identique,
les six autres langues portées de l'iOS déjà relu. Suite de 92w (issue #20326).

## Doctrine de branche

| | |
|---|---|
| Base de départ | `origin/dev` (HEAD `46706246c`) |
| Cible de la PR | `dev` (auto-merge au vert, #9226) |
| Branche de travail | `claude/practical-fermat-10zclt` |

## Étapes (RED → GREEN)

1. **RED** — describe « réponse/modifié/épinglé descendent le catalogue (93w) »
   dans `message-a11y-label.test.ts` : FR byte-identique (`réponse à Amina Diallo`,
   `modifié`, `épinglé`) ; EN → `replying to …`/`edited`/`pinned`, pas le français ;
   auteur inconnu → « l'expéditeur », pas « expéditeur inconnu » ; modérateur
   inchangé. Mettre à jour l'assertion du cas inconnu (`:125`).
2. **GREEN** — réutiliser le vocabulaire déjà traduit :
   - Ajouter `message.edited.a11y`, `message.pinned.a11y`, `message.replyTo.a11y`
     aux **sept** `catalog-{lang}-shell-labels.ts`, à côté de `message.badge.pinned`
     / `quote.sender.unknown`. FR = octets d'avant ; 6 autres langues portées de
     iOS `a11y.message.edited` / `a11y.message.pinned` / sujets de réponse.
   - `lib/view/message-a11y-label.ts` : `réponse à ${author}` →
     `translate(language, 'message.replyTo.a11y', { author })`, le repli inconnu
     reprenant `translate(language, 'quote.sender.unknown')` ; `'modifié'` →
     `message.edited.a11y` ; `'épinglé'` → `message.pinned.a11y`.
3. **Vérifier** : suite a11y 45/45 ; parité catalogues `i18n-catalog.test.ts` 12/12 ;
   consommateurs 32/32 ; `tsc --noEmit` = 0 ; gate d'harmonie #8879 = 46/46 (0).
4. **Livrer** : PR vers `dev`, auto-merge au vert ; annoter l'analyse
   `✅ Statut : CORRIGÉ (iter-93w)` ; mettre à jour `web-iteration-pointer.md`.

## Résultat

- Suite a11y **42 → 45** GREEN ; catalogues **12/12** ; consommateurs **32/32** ;
  `tsc` 0 ; harmonie **0**.
- FR : « modifié », « épinglé », « réponse à {auteur} » **byte-identiques** ;
  l'auteur inconnu passe à « l'expéditeur » (unification avec le pied de citation).
  Les 6 autres langues disent enfin ces trois segments.
- **Aucune traduction inventée pour « modifié »/« épinglé »** (portées de l'iOS
  relu) ; l'auteur inconnu réutilise `quote.sender.unknown`.

## Suite — 94w+ (DETTE, issue #20326 toujours ouverte)

Reste en dur dans `composeMessageLabel` : « Sans compte » (`:247`, + `title` du
glyphe `focal-row.tsx:803`), « Position »/« lieu partagé » (`:325`), « sticker »
(`:314`) — SANS pluriel, d'abord ; puis les comptes de pièces jointes (`:106-110`)
et les réactions (`:119`) avec variantes `.one`/`.other` (les clés
`message.reaction.count.{one,other}` existent déjà ×7). Voir le pied de l'analyse
93w. Remesurer le gate d'harmonie à chaque ouverture.

## ✅ Statut : LIVRÉ (iter-93w)
