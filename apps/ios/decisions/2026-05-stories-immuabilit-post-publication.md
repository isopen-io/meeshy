## 2026-05: Stories - Immuabilit post-publication
**Statut**: Accept
**Contexte**: Les utilisateurs peuvent crer/diter une story librement dans le composer pre-publish (StoryComposerView : slides, effets, stickers, audio, visibilit). **Aprs publication, aucune dition n'est possible** ; seule la suppression de la story (ou d'une slide individuelle) est offerte. Le menu kebab de l'utilisateur propritaire affiche uniquement "Supprimer".
**Decision**: Les stories sont **immuables** une fois publies. Le menu kebab ne propose JAMAIS d'option "Modifier" pour les stories. La granularit "delete single slide" reste possible.
**Justification SOTA (audit 2026-05-06)** :
- **Alignement industrie 100%** : Instagram, Snapchat, BeReal, TikTok Stories, Threads — toutes les plateformes leaders interdisent l'dition post-publish
- **Trust** : l'immuabilit = preuve de confiance (anti-fake-news, contre-mesure  l'dition silencieuse aprs viralit)
- **Simplicit cognitive** : modle write-once plus simple  expliquer  l'utilisateur
- **Confidentialit** : un follower qui a vu la story originale peut tre sr que ce qu'il a vu n'a pas t modifi  posteriori
**Alternatives rejet** :
- **dition libre 5min aprs publi** (style Threads/X pour les posts) : casse la trust, ncessite badge "Edited" omniprsent, complexifie les caches CDN, et n'est pas attendu pour des stories phmres 24h
- **dition limite au texte seul** : pas de demande utilisateur, complexit pour un gain marginal
**Implications** :
- Pour corriger une erreur, l'utilisateur supprime + recre (workflow universel sur les plateformes leaders)
- Le composer pre-publish doit rester puissant et accessible (pas de friction  l'dition AVANT publication)
- L'option "Add slide" sur story existante est append-only (acceptable, prserve l'immuabilit des slides existants)
**Cons**: aucun (alignement industrie unanime). Risque rsiduel : utilisateur frustr de devoir supprimer pour corriger un typo — accept comme tradeoff.
**Source**: `docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md` Pilier 20
