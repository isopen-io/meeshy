# Bandeau stats profil + correctif menu DM — 2026-07-25

Spec : `docs/superpowers/specs/2026-07-25-profile-posts-stats-band-and-dm-menu-fix-design.md`
Décisions user : compteurs = hybride (phase 1 app-only), métriques = Postes/Réels/Stories, libellé = « Infos conversation ».

Contrainte projet : XcodeGen (nouveaux `.swift` auto-inclus ; `meeshy.sh` ne régénère pas → `xcodegen generate` avant build local ; NE JAMAIS committer le churn pbxproj/scheme/Package.resolved). Commits sélectifs — ne pas toucher aux modifs concurrentes déjà présentes (StoryViewerView.swift, project.pbxproj, StoryGroupIntroPolicyTests.swift).

## Commit A — fix menu long-press DM (doublon profil + libellé)
- [ ] RED : `MeeshyTests/Unit/Views/ConversationAvatarMenuTests.swift` — descriptors DM = [Infos conversation (info.circle.fill), Voir le profil (person.circle.fill)] ; exactement 1 entrée profil ; groupe sans profil.
- [ ] GREEN : `ThemedConversationRow.swift` — builder pur `ConversationAvatarMenu` (descriptors) ; DM détail → clé `conversation.info` ; `onViewProfile: nil` passé à MeeshyAvatar (stoppe l'auto-injection SDK).
- [ ] `Localizable.xcstrings` — clé `conversation.info` (fr/en/es/de/pt-BR).
- [ ] Vérif : `MeeshyAvatar.onViewProfile` ne sert QU'à l'injection menu (pas un tap).

## Commit B — bandeau stats phase 1 (app-only)
- [ ] RED : tests `ProfilePostsCounts.compute` (POST/REEL/STORY + isApproximate=hasMore) + format valeur (« N+ » si approx & >0, sinon « N »).
- [ ] GREEN : `ProfileUserPostsList.swift` — `ProfilePostsCounts` (pur) + propriété VM `postsCounts` + `ProfilePostsStatsBand` (3 chips style miniStatChip) inséré avant le LazyVStack.
- [ ] `Localizable.xcstrings` — labels Postes/Réels/Stories.

## Verrou build/push
- [ ] `cd apps/ios && xcodegen generate` (inclure nouveaux fichiers test)
- [ ] `meeshy.sh build` vert + tests ciblés simu 18.2 (`-only-testing`) verts
- [ ] `git checkout` churn xcodegen (pbxproj/scheme/Package.resolved) — NE PAS committer
- [ ] commit A, commit B (sélectifs), push, surveiller CI iOS

## Phase 2 (hors cycle) — totaux exacts backend
Documentée dans le spec. Non implémentée ici.

## Review
(à compléter en fin de tâche)
