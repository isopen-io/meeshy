export const meta = {
  name: 'android-parity-dev-green',
  description: 'Corrige les tests Android rouges de dev, un groupe par PR (racine du défaut, iOS en référence)',
  whenToUse: 'args {run, runId, jobId, sha, groups:[{key, tests}]} — groupes relevés dans le journal du dernier run android.yml de dev arrivé au bout.',
  phases: [{ title: 'Fix', detail: 'sonnet : correctif de cause racine par groupe, PR vers dev' }],
}
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EP6Bfac7sFfP8RkuHTATHN'
const R = { type: 'object', properties: { pr: { type: 'number' }, sha: { type: 'string' }, fixed: { type: 'array', items: { type: 'string' } }, notFixed: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } }, required: ['fixed', 'notFixed', 'note'] }
function prompt(g) {
  return `isopen-io/meeshy : sur dev ${args.sha}, ces tests Android échouent (android.yml run ${args.runId}, job ${args.jobId}) : ${g.tests}.
Journal : charge mcp__github__get_job_logs par ToolSearch, job_id ${args.jobId}, return_content true, tail_lines 3000 (6000 si besoin) ; le téléchargement direct du blob est refusé par le proxy. Cherche le nom des tests et les assertions dessous. Une rafale d'AppNotIdleException suit en général UN premier test en échec : cherche ce premier.
Corrige la CAUSE RACINE. Une autre session du porteur corrige aussi dev en direct : commence par "git log --oneline -40 origin/dev -- apps/android" et arrête-toi si c'est déjà corrigé. Trouve le lot qui a changé le comportement (git log -p) ; décide qui a tort, la production ou le témoin, avec iOS (apps/ios + packages/MeeshySDK) comme référence.
Clone privé (ne JAMAIS toucher /home/user/meeshy, même pas un fetch ; supprime le clone à la fin) :
D=${args.run}/lots/green-${g.key}
rm -rf $D && git clone -q --shared /home/user/meeshy $D && cd $D && git remote set-url origin https://github.com/isopen-io/meeshy && git fetch -q origin dev && git checkout -q -b claude/android-fix-dev-${g.key} origin/dev
Règles : ne jamais désactiver, @Ignore, supprimer ni affaiblir un test, ni relâcher une garde ; pas de sleep ; pas de tâche en fond. La compilation Android locale est impossible : relis ton diff.
Commit en français terminé par :
${ATTR}
Pousse, ouvre la PR vers dev (mcp__github__create_pull_request ; corps : test, cause, correctif ; se termine par "🤖 Generated with [Claude Code](https://claude.com/claude-code)" puis l'URL de session du pied de commit), puis rm -rf $D. Ne fusionne pas, aucun abonnement, aucune tâche planifiée, aucun identifiant de modèle. Déjà corrigé sur dev : aucune PR.
Rends {pr, sha, fixed[], notFixed[], note}.`
}
const results = await parallel(args.groups.map((g) => () => agent(prompt(g), { label: `green:${g.key}`, phase: 'Fix', schema: R, model: 'sonnet' })))
return results.map((r, i) => ({ group: args.groups[i].key, ...(r || { note: 'no result' }) }))
