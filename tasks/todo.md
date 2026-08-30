# Positionnement App Store — fiche complète (2026-08-25)

Objectif : définir EXACTEMENT comment présenter Meeshy au public pour donner
envie — en vendant ce qui attire les 16-25 ans (étude concurrence + besoins),
pas la fiche technique — et livrer tous les champs App Store, branchés sur la
lane `release` (fastlane deliver lit `apps/ios/fastlane/metadata/`).

## Plan

- [x] Inventaire factuel des fonctionnalités livrées (iOS + web, statut livré/partiel/absent)
- [x] Étude marketing : concurrence (Tandem, HelloTalk, Slowly, Wizz, Yubo, Litmatch, Azar, Discord…), besoins Gen Z 2025-2026, hooks, ASO fr/en
- [x] Angle retenu : « amis sans frontières » (territoire vacant depuis Ablo) + hook viral « ta voix parle 80+ langues »
- [x] `apps/ios/fastlane/metadata/` créé :
  - [x] `fr-FR/` : name (29), subtitle (30), description (2570), keywords (95), promotional_text (164), release_notes, 3 URLs
  - [x] `en-US/` : name (30), subtitle (28), description (2342), keywords (90), promotional_text (165), release_notes, 3 URLs
  - [x] non localisé : copyright, primary (SOCIAL_NETWORKING) / secondary (EDUCATION) category
- [x] `check_metadata.sh` : vérifie les limites 30/30/170/100/4000 (UTF-8), appelé par la lane `release` avant `upload_to_app_store` — tout vert
- [x] `docs/marketing/app-store-fiche-2026-08.md` : angle, cibles, fiche justifiée champ par champ, plan de 7 captures, playbook campagne, claims interdits, checklist de review
- [x] Commit + push sur `claude/app-store-positioning-3hlny8`

## Review

- L'angle de vente est SOCIAL (« make friends worldwide »), pas utilitaire :
  c'est le langage des apps qui gagnent chez les 16-25 (Wizz, Yubo, Litmatch)
  et le créneau « chat mondial traduit » est vide depuis la mort d'Ablo (2022).
- Chaque claim de la fiche est adossé à une preuve code de l'inventaire ;
  les claims interdits (200 langues, protocole Signal, E2EE généralisé,
  Dynamic Island, gestion d'échantillons vocaux) sont listés dans le doc.
- Deux incohérences à corriger hors de cette passe : la landing web
  (« 200 languages », « server-side translation » vs discours privacy) et
  `ITSAppUsesNonExemptEncryption=false` à faire arbitrer.
- Reste à produire (hors repo) : captures d'écran 6.7"/6.5" selon le plan §4,
  App Preview vidéo du hook vocal, metadata des 5 autres langues du bundle.

## Vérification du « reste » web — 2026-08-25

Demandé : vérifier qu'il y a VRAIMENT à faire avant d'attaquer. Verdict mesuré
sur le code (le recensement datait d'avant le travail web déjà livré) :

| Surface | Verdict |
|---|---|
| `StoryViewer.tsx` | **RIEN** — `grep -cE "isLiked\|isBookmarked\|isReposted\|hasReacted\|myReaction\|userReaction"` rend **0**. Aucun état « c'est moi » n'y existe ; rien n'est renforçable |
| réactions emoji (picker) | marginal — l'emoji choisi s'affiche DÉJÀ à la place du cœur, ce qui EST le signal |
| `CommentItem.tsx` | **un seul site réel** — `isLiked` et `comment.authorId` disponibles → fait |

Le web est donc épuisé lui aussi, à ceci près que le partage et le repost y sont
bloqués par les mêmes états manquants que sur iOS.

> **Annoncer « il reste X » sans le mesurer coûte deux fois** : une fois en
> promesse, une fois en démenti. Ici « restent StoryViewer et les commentaires »
> valait pour moitié — et c'est la moitié creuse qui aurait été attaquée en
> premier si personne n'avait demandé de vérifier.
