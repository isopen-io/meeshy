export const meta = {
  name: 'android-parity-reprise',
  description: 'Reprise de la parité Android ↔ iOS : solde le lot SQLCipher, trie les rouges de dev, prépare la fusion des PR de pistes ouvertes',
  whenToUse: 'Première action d\'une session qui reprend le chantier de parité Android (lire .claude/workflows/android-parity/REPRISE.md). args {run}.',
  phases: [
    { title: 'SQLCipher', detail: 'contre-audit, correction si bloquant, PR neuve et fusion si la CI de la branche le permet' },
    { title: 'Dev', detail: 'tri des tests rouges du dernier run android.yml de dev arrivé au bout' },
    { title: 'PR', detail: 'classement des PR de pistes ouvertes : à fusionner, sensibles, autres sessions' },
  ],
}

const RUN = args.run
const BRANCH = 'claude/android-persist-sqlcipher-base-chiffree'
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EP6Bfac7sFfP8RkuHTATHN'
const RULES = `Règles : ne JAMAIS modifier /home/user/meeshy (pas même un fetch) — clone privé sous ${RUN}/lots, supprimé à la fin ; ne jamais désactiver, supprimer ni affaiblir un test ; pas de sleep ; pas de tâche en fond ; aucun abonnement aux PR ni tâche planifiée ; aucun identifiant de modèle nulle part. Outils GitHub : les mcp__github__* se chargent par ToolSearch. Un journal de CI se lit par mcp__github__get_job_logs (return_content true, tail_lines 3000) : le blob direct est refusé par le proxy.`

const AUDIT = { type: 'object', properties: { head: { type: 'string' }, blocking: { type: 'boolean' }, findings: { type: 'array', items: { type: 'string' } }, followups: { type: 'array', items: { type: 'string' } } }, required: ['head', 'blocking', 'findings'] }
const FIXED = { type: 'object', properties: { head: { type: 'string' }, ciDispatched: { type: 'boolean' }, summary: { type: 'string' } }, required: ['head', 'summary'] }
const CI = { type: 'object', properties: { state: { type: 'string', enum: ['merged', 'waiting-ci', 'red-from-lot', 'no-run'] }, pr: { type: 'number' }, runId: { type: 'number' }, note: { type: 'string' } }, required: ['state', 'note'] }
const TRIAGE = { type: 'object', properties: { runId: { type: 'number' }, jobId: { type: 'number' }, sha: { type: 'string' }, green: { type: 'boolean' }, groups: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, tests: { type: 'string' } }, required: ['key', 'tests'] } }, alreadyFixed: { type: 'array', items: { type: 'string' } } }, required: ['green', 'groups'] }
const PRS = { type: 'object', properties: { lanes: { type: 'array', items: { type: 'array', items: { type: 'object', properties: { pr: { type: 'number' }, key: { type: 'string' } }, required: ['pr', 'key'] } } }, sensitive: { type: 'array', items: { type: 'object', properties: { pr: { type: 'number' }, key: { type: 'string' }, why: { type: 'string' } }, required: ['pr', 'key', 'why'] } }, others: { type: 'array', items: { type: 'number' } } }, required: ['lanes', 'sensitive', 'others'] }

function auditPrompt() {
  return `Tu es l'auditeur adversarial de Meeshy : lis d'abord .claude/agents/auditeur-adversarial.md (dans un clone privé) et adopte sa posture — tu cherches à casser, pas à approuver.
Audite la tête de la branche ${BRANCH} (isopen-io/meeshy) contre origin/dev : chiffrement au repos de la base Room Android par SQLCipher, issue #15880, PR #15908 FERMÉE sur un premier audit BLOQUANT dont les quatre points et les suivis sont dans les commentaires de la PR (lis-les). La tête 7b6fcdc064 annonçait : SQLCipher 4.6.1 (alignement 16 Ko), prepare() dans DatabaseOpener (corruption en clair → recreate, autre panne → base en mémoire sans toucher au fichier), DatabaseKeyProvider qui n'écrase jamais une clé illisible, sauvetage d'une base chiffrée par SQLCipher avec la clé (SalvageOpener), relais onCorruption, repli en mémoire seulement, ATTACH à paramètres liés, IOException d'en-tête → UNAVAILABLE. Limites qu'il avouait : une clé malformée met l'app en mémoire à chaque lancement ; l'outbox écrite pendant un lancement en mémoire est perdue à la fin du process (perte silencieuse de messages envoyés hors ligne ?) ; la copie en quarantaine n'est pas relue ; aucun test n'exerce le vrai moteur.
Vérifie que les quatre bloquants sont fermés et cherche ce qui casse encore (compilation de la sous-classe net.zetetic SQLiteOpenHelper contre androidx.sqlite 2.4.0, flux de première migration avec une outbox non vide, salvageKey face à une clé régénérée, régression des témoins).
${RULES}
Ne poste rien, ne pousse rien. Rends {head, blocking, findings[], followups[]}.`
}
function fixPrompt(audit) {
  return `Tu es l'ingénieur cryptographie de Meeshy : lis d'abord .claude/agents/crypto-e2ee.md (clone privé) et applique-le. Corrige sur la branche ${BRANCH}, SANS ouvrir de PR, les constats bloquants de ce contre-audit :
${audit.findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}
Clone : D=${RUN}/lots/fix-sqlcipher ; rm -rf $D && git clone -q https://github.com/isopen-io/meeshy $D && cd $D && git fetch -q origin dev ${BRANCH} && git checkout -q -B ${BRANCH} origin/${BRANCH} && git merge -q origin/dev (jamais de rebase ni de force-push). TDD : témoins d'abord.
${RULES}
Commits en français terminés par :
${ATTR}
Pousse, puis déclenche la CI : mcp__github__actions_run_trigger method run_workflow, workflow_id android.yml, ref ${BRANCH}. Rends {head, ciDispatched, summary}.`
}
function ciPrompt(audit) {
  return `Branche ${BRANCH} (isopen-io/meeshy), tête ${audit.head}, contre-audit NON BLOQUANT. Suivis relevés : ${(audit.followups || []).join(' ; ') || 'aucun'}.
1. Trouve le run android.yml (event workflow_dispatch, branche ${BRANCH}) sur la tête ${audit.head} : mcp__github__actions_list method list_workflow_runs. Aucun run → déclenche-le (actions_run_trigger, run_workflow, android.yml, ref ${BRANCH}) et rends state "no-run". Pas encore terminé → rends "waiting-ci".
2. Terminé : compare ses tests en échec à ceux du dernier run android.yml de dev arrivé au bout (pas cancelled). Échecs identiques à dev et hors des fichiers du lot (ou vert) → ouvre une PR NEUVE vers dev (titre : « Messages, conversations et file d'envoi sont chiffrés au repos et illisibles sans la clé de l'appareil » ; corps : ce que ça change, les audits successifs et ce qu'ils ont fermé, les limites et suivis restants, la preuve CI ; « Closes #15880 » ; se termine par "🤖 Generated with [Claude Code](https://claude.com/claude-code)", une ligne vide, puis l'URL de session du pied de commit ci-dessous), puis FUSIONNE-la aussitôt (mcp__github__merge_pull_request, merge_method merge) et commente #15880 (preuve, dimensions mûres, suivis ouverts en issues — ouvre une issue par suivi non soldé, label android). Rends "merged". Échec propre au lot → rends "red-from-lot" avec les tests.
Pied de commit de la session : ${ATTR}
${RULES}`
}

phase('SQLCipher')
let audit = await agent(auditPrompt(), { label: 'sqlcipher:audit', phase: 'SQLCipher', schema: AUDIT, model: 'opus' })
let rounds = 0
while (audit && audit.blocking && rounds < 2) {
  rounds++
  await agent(fixPrompt(audit), { label: `sqlcipher:fix${rounds}`, phase: 'SQLCipher', schema: FIXED, model: 'opus' })
  audit = await agent(auditPrompt(), { label: `sqlcipher:audit${rounds + 1}`, phase: 'SQLCipher', schema: AUDIT, model: 'opus' })
}
const sqlcipher = audit && !audit.blocking
  ? await agent(ciPrompt(audit), { label: 'sqlcipher:ci', phase: 'SQLCipher', schema: CI, model: 'sonnet' })
  : { state: 'blocked', note: (audit && audit.findings || []).join(' | ') }

phase('Dev')
const triage = await agent(`Dépôt isopen-io/meeshy, workflow android.yml, branche dev. Trouve le dernier run arrivé au bout (status completed, conclusion différente de cancelled ; les fusions en rafale en annulent beaucoup). Vert → {green: true, groups: []}. Rouge → liste ses jobs (actions_list list_workflow_jobs), lis le journal du job « Android (assemble + unit tests) », relève les erreurs de compilation et les tests en échec (classe > méthode, première ligne d'exception). Une autre session corrige dev en direct (Refs #15867) : lis git log origin/dev -- apps/android (clone privé, ou mcp__github__list_commits) et retire ce qui est déjà corrigé APRÈS le sha du run (mets-le dans alreadyFixed). Regroupe le reste par cause probable (au plus 8 groupes, un fichier de test ou une cause par groupe), key en kebab-case. ${RULES} Rends {runId, jobId, sha, green, groups[{key, tests}], alreadyFixed[]}.`, { label: 'dev:triage', phase: 'Dev', schema: TRIAGE, model: 'sonnet' })

phase('PR')
const prs = await agent(`Liste les PR OUVERTES de isopen-io/meeshy vers dev dont la branche commence par claude/android- (mcp__github__list_pull_requests). Pour chacune : key = la branche sans le préfixe claude/android-. Classe :
- others : PR d'une autre session — le pied du corps cite une session autre que celle-ci : ${ATTR.split('\n')[1]} — ou brouillon d'une autre session ; n'y touche pas ;
- sensitive : lot d'authentification, sécurité, cryptographie, E2EE, migration de données ou de schéma Room, consentement, contrôle d'accès, contenu protégé (vue unique, éphémère, flouté) — FERME-la aussitôt avec un commentaire (« fermée le temps de l'audit adversarial ; une PR neuve la remplacera si l'audit ne bloque pas et que la CI de la branche est verte », terminé par la ligne « --- » puis « _Generated by [Claude Code](https://claude.ai/code)_ ») : sinon une vague de fusion du porteur l'emporte avant l'audit ;
- lanes : le reste, réparti en au plus 4 files équilibrées.
${RULES} Rends {lanes, sensitive[{pr, key, why}], others[]}.`, { label: 'pr:classify', phase: 'PR', schema: PRS, model: 'sonnet' })

return { sqlcipher, triage, prs }
