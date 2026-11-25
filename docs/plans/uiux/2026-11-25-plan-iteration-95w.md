# Plan de correction — itération 95w (web)

**Analyse** : `docs/analyses/uiux/2026-11-25-iteration-95w.md`
**Objectif** : les DEUX derniers segments à PLURIEL de `composeMessageLabel`
qui restaient EN DUR EN FRANÇAIS — les comptes de pièces jointes
(`attachmentSegments`) et le préfixe des réactions (`reactionsSegment`) —
descendent le catalogue, FR byte-identique, les six autres langues portées
d'iOS (`a11y.message.{images,videos,audios,reactions}`) et du catalogue web
existant pour fichier/contact (absents d'iOS). **Ferme #20326.**

## Doctrine de branche

| | |
|---|---|
| Base de départ | `origin/dev` (HEAD `6fe9799af`) |
| Cible de la PR | `dev` (auto-merge au vert, #9226) |
| Branche de travail | `claude/practical-fermat-o90to9` |

## Étapes (RED → GREEN)

1. **RED** — cas ajoutés à `message-a11y-label.test.ts` :
   - EN → « 2 videos, 1 audio » (pas « 2 vidéos, 1 audio ») ; réactions EN
     « reactions: 👍 2 ».
   - AR → une image rend « 1 صورة » ; réactions AR « التفاعلات: ».
   - FR byte-identique : « Bruno Bêta, 2 images, 1 audio, …, réactions : 👍 2 »
     (le témoin d'ordre existant `:88` ne bouge pas).
   - `contact-card/label.test.ts:96` : `attachmentSegments([attachment({})], 'fr')`.
2. **GREEN** — réutiliser le modèle de pluriel `message.reaction.count.{one,other}` :
   - Ajouter aux **sept** `catalog-{lang}-shell-labels.ts`, après
     `message.location.shared.a11y` : `message.attachment.{image,video,audio,file,contact}.{one,other}`
     (`{count} <nom>`) + `message.reactions.a11y` (`<préfixe> {list}`). FR =
     octets d'avant.
   - `message-a11y-label.ts` :
     - `attachmentSegments(attachments, language)` : table `ATTACHMENT_KEYS`
       (catégorie → `[clé.one, clé.other]`), `translate(language, clé[count===1?0:1], { count })`.
       Supprimer `pluralize`.
     - `reactionsSegment(reactionSummary, language)` : `translate(language,
       'message.reactions.a11y', { list })`.
     - `composeMessageLabel` : passer `language` aux deux appels.
   - `protected-content.tsx:736` : `attachmentSegments(attachments, language)`.
   - `quoted-preview.ts:386,395` : `attachmentSegments(quoted.attachments, interfaceLanguage)`.
3. **Vérifier** : suite a11y GREEN ; `i18n-catalog.test.ts` parité 7/7 ;
   `contact-card/label` + `quoted-preview` + `protection-notice` verts ;
   `tsc --noEmit` = 0 ; gate d'harmonie #8879 = 0.
4. **Livrer** : PR vers `dev`, auto-merge au vert ; `Closes #20326` ; annoter
   l'analyse `✅ Statut : CORRIGÉ (iter-95w)` ; mettre à jour
   `web-iteration-pointer.md`.

## Résultat attendu

- FR : les comptes de pièces et le préfixe des réactions **byte-identiques**.
- EN/ES/PT/DE/IT/AR : enfin dans la langue du lecteur, sur les **trois** surfaces
  (nom accessible, constat de retenue admin, inventaire de citation).
- `attachmentSegments` reste la **source unique** ; `pluralize` retirée.
- **#20326 fermée** : plus un segment de `composeMessageLabel` en dur en français.

## Suite — tour 96w+

Reprendre une revue fraîche de l'`apps/web` (épuration dim. 12, optimisation),
mesurée contre iOS (`apps/ios` + MeeshySDK, **jamais modifiés**). **Toujours
remesurer le gate d'harmonie #8879 à l'ouverture** — il remonte dès que `dev`
reçoit une poche de chrome neuve.

## ✅ Statut : LIVRÉ (iter-95w)
