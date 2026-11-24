# Plan de correction — itération 94w (web)

**Analyse** : `docs/analyses/uiux/2026-11-24-iteration-94w.md`
**Objectif** : les trois segments SANS pluriel du libellé d'accessibilité d'un
message qui restaient EN DUR EN FRANÇAIS — « Sans compte », « sticker »,
« Position : {lieu} »/« lieu partagé » — descendent le catalogue, FR byte-identique,
les six autres langues reprises des surfaces et de l'iOS relu. L'info-bulle du
fantôme anonyme (`focal-row.tsx`) suit la même clé. Suite de 93w (issue #20326).

## Doctrine de branche

| | |
|---|---|
| Base de départ | `origin/dev` (HEAD `28af9179a`) |
| Cible de la PR | `dev` (auto-merge au vert, #9226) |
| Branche de travail | `claude/practical-fermat-stot2z` |

## Étapes (RED → GREEN)

1. **RED** — cas ajoutés à `message-a11y-label.test.ts` : EN → « Without an
   account » (pas « Sans compte ») ; AR → « ملصق » (pas « sticker ») ; EN →
   « shared location: Tour Eiffel » (pas « Position ») ; lieu sans nom → FR « lieu
   partagé » / EN « shared location ». Les trois témoins FR existants chargent
   désormais le catalogue (`loadInterfaceCatalog('fr')`).
2. **GREEN** — réutiliser le vocabulaire déjà traduit :
   - Ajouter `message.anonymous.a11y`, `message.sticker.a11y`,
     `message.location.named.a11y` ({place}), `message.location.shared.a11y` aux
     **sept** `catalog-{lang}-shell-labels.ts`, à côté de `message.replyTo.a11y`.
     FR = octets d'avant ; anonyme repris de `linkDetail.stats.anonymous` ; lieu
     repris de l'étiquette iOS `a11y.message.location` (PT traduit, absent iOS).
   - `lib/view/message-a11y-label.ts` : `'Sans compte'` → `message.anonymous.a11y` ;
     `sticker {emoji}` → `${translate(message.sticker.a11y)} {emoji}` ;
     `Position : ${name ?? 'lieu partagé'}` → `named.a11y`/`shared.a11y` (repli
     couvrant `null`/`undefined`/`''`).
   - `components/focal-row.tsx` : `title="Sans compte"` →
     `translate(currentInterfaceLanguage(), 'message.anonymous.a11y')`.
3. **Vérifier** : suite a11y 49/49 ; parité `i18n-catalog.test.ts` 12/12 ;
   `message-blocks`/`message-detail-sheet` 32/32 ; `focal-row` 69/69 ;
   `tsc --noEmit` = 0 ; gate d'harmonie #8879 = 0.
4. **Livrer** : PR vers `dev`, auto-merge au vert ; annoter l'analyse
   `✅ Statut : CORRIGÉ (iter-94w)` ; mettre à jour `web-iteration-pointer.md`.

## Résultat

- Suite a11y **45 → 49** GREEN ; catalogues **12/12** (49 610 `expect`) ;
  consommateurs **32/32** ; `focal-row` **69/69** ; `tsc` 0 ; harmonie **0**.
- FR : les quatre segments **byte-identiques** ; EN/ES/PT/DE/IT/AR les disent enfin
  dans la langue du lecteur, info-bulle du fantôme comprise.
- **Une seule traduction inventée** (PT du lieu, absent iOS) ; le reste repris des
  surfaces (`linkDetail.stats.anonymous`) et de l'iOS relu (`a11y.message.location`).

## Suite — 95w+ (DETTE, issue #20326 toujours ouverte)

Ne restent QUE les segments à PLURIEL de `composeMessageLabel` : comptes de pièces
jointes (`attachmentSegments` `:106-110`, variantes `.one`/`.other` ;
`attachmentSegments` est EXPORTÉ et aussi consommé par `ProtectionNotice`) et
réactions (`reactionsSegment` `:119`, préfixe). Les clés
`message.reaction.count.{one,other}` existent déjà ×7 comme modèle de pluriel.
Remesurer le gate d'harmonie à chaque ouverture.

## ✅ Statut : LIVRÉ (iter-94w)
