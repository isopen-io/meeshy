# Positionnement App Store — fiche complète (2026-08-25)

Objectif : définir EXACTEMENT comment présenter Meeshy au public pour donner
envie — en vendant ce que l'app FAIT (inventaire factuel), pas la roadmap —
et livrer tous les champs de la fiche App Store, branchés sur la lane
`release` (fastlane deliver lit `apps/ios/fastlane/metadata/`).

## Plan

- [ ] Inventaire factuel des fonctionnalités livrées (agent Explore : iOS + web, statut livré/partiel/absent)
- [ ] Définir l'angle de vente : à qui, quel besoin, quelle promesse — document de positionnement
- [ ] Créer `apps/ios/fastlane/metadata/` (deliver) :
  - [ ] `fr-FR/` : name, subtitle, description, keywords, promotional_text, release_notes, support/marketing/privacy URLs
  - [ ] `en-US/` : mêmes champs
  - [ ] non localisé : copyright, primary/secondary category
- [ ] Respect strict des limites App Store (30/30/170/4000/100 caractères) — vérifié par script
- [ ] Document `docs/marketing/app-store-fiche-2026-08.md` : positionnement, plan de captures d'écran, ASO, ce qu'on ne vend PAS (chantiers)
- [ ] Vérifier les longueurs + cohérence avec les fonctionnalités livrées
- [ ] Commit + push sur `claude/app-store-positioning-3hlny8`

## Review

(à remplir en fin de tâche)
