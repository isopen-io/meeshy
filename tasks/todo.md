# Cycle 56 — la police d'écriture d'un conteneur, posée à un conteneur SANS hiérarchie

## La piste

- [x] Piste n°4 du cycle 55 : « `PUT /conversations/:id` accepte toujours de
      renommer un DM ». Instruite ici — et le renommage s'avère être le SYMPTÔME
      inoffensif d'un défaut d'autorisation qui, lui, ne l'est pas

## Le constat

- [x] `PUT /conversations/:id` ne filtre QUE sur le RÔLE
      (`creator|admin|moderator`), jamais sur le TYPE de conversation
- [x] Dans un tête-à-tête, l'initiateur reçoit `role: 'creator'` et l'autre
      `role: 'member'` (`core.ts`, création) — l'asymétrie est un artefact de
      « qui a tapé le premier », pas une autorité
- [x] L'initiateur peut donc poser `isAnnouncementChannel: true` (ou
      `defaultWriteRole: 'admin'`) sur le tête-à-tête
- [x] `conversationWriteAdmission` est CÂBLÉ depuis un cycle précédent
      (`MessagingService.handleMessage`) : `member` (rang 1) < `admin` (rang 3)
      ⇒ **les messages de l'autre partie sont refusés**
- [x] Aucun retour en arrière pour la victime : `PUT` lui répond 403 (`member`)
- [x] Les champs COSMÉTIQUES (`title`, `avatar`) sont, eux, sans danger — web
      résout le nom/l'avatar du pair et ignore ceux du conteneur en DM

## Correctif — deux gestes, deux questions distinctes

- [x] **La règle** (`requiredWriteRank`) : un `direct` n'a pas de hiérarchie
      d'écriture, exactement comme `global` n'en a pas. Le module énumérait déjà
      les types sans hiérarchie — il n'en connaissait qu'un. Guérit les lignes
      DÉJÀ empoisonnées en base
- [x] **L'autorité** (route `PUT`) : refuser les trois champs de police
      (`defaultWriteRole`, `isAnnouncementChannel`, `slowModeSeconds`) sur un
      `direct`. Empêche l'écriture ET l'événement `conversation:updated` qui
      annoncerait un drapeau sans effet
- [x] Type lu via la relation du `findFirst` d'appartenance déjà émis — aucune
      requête de plus, et le `select` réduit le sur-transfert au passage
- [x] Type INCONNU ⇒ permissif côté route (idiome documenté du module) : la
      garde réelle est la règle, qui lit le type sur la ligne AUTORITAIRE

## Gates

- [x] Suite gateway complète sous bun (parité CI)
- [x] `prisma generate` + `packages/shared` construits avant campagne
- [x] Preuve par mutation dans les deux sens
- [x] `main` refusionné à la main avant push
- [x] CHANGELOG + journal de cycle + leçon

## Revue

Voir `tasks/realtime-sync-audit-2026-08-17-cycle56-bis.md` — le tableau des quatre
écrivains de ces champs, pourquoi le câblage juste du cycle 31 a armé un champ
cosmétique sans que son écrivain change, et les sept pistes du cycle 57.

Gates constatés : **740 suites / 17 937 témoins verts**, `tsc --noEmit` à 0
erreur sur tout le gateway, `conversationWriteAdmission.ts` à 100 % (lignes,
branches, fonctions), 9 témoins neufs, 4 mutations (2 sous-dosages, 2
sur-dosages) toutes rouges comme attendu.
