export const meta = {
  name: 'meeshy-dev-vert-android',
  description:
    "Rend dev vert sur Android et le garde vert (#15991) : fusionne chaque PR ouverte vers dev (simulation sur la tête de dev + gardes locales, audit adversarial des lots sensibles, brouillons activés), prouve par workflow_dispatch d'android.yml (CI des PR gelée), extrait les échecs, corrige ceux que dev n'a pas déjà réparés par une PR fusionnée aussitôt, et boucle jusqu'au vert — sonnet fusionne, prouve et extrait ; opus corrige ; auditeur-adversarial juge les lots sensibles",
  whenToUse:
    "Reprendre « fusionne les PR ouvertes dans dev et rends dev vert » (#15991). Args, tous optionnels : { branche (branche de travail de la session, sinon la branche courante), attribution (lignes Co-Authored-By + Claude-Session de la session), tours (6), brouillons (true : activer et traiter les PR en brouillon dont la branche est inactive depuis 20 min), sauterPR [numéros], issue (15991), base ('dev') }.",
  phases: [
    { title: 'Préparer', detail: 'branche de travail alignée sur dev, gardes locales sur la tête de dev, dernier verdict android.yml', model: 'sonnet' },
    { title: 'Fusionner', detail: 'PR ouvertes une à une : simulation + gardes, fusion au SHA attendu, correctif de garde aussitôt', model: 'sonnet' },
    { title: 'Auditer', detail: 'auditeur-adversarial sur les lots de crypto, auth, accès, migration, protocole' },
    { title: 'Prouver', detail: 'workflow_dispatch android.yml au SHA de la tête de dev, attente du verdict', model: 'sonnet' },
    { title: 'Extraire', detail: 'erreurs de compilation et témoins en échec depuis le journal du job', model: 'sonnet' },
    { title: 'Corriger', detail: 'cause racine des rouges que dev ne répare pas déjà, PR fusionnée aussitôt', model: 'opus' },
    { title: 'Bilan', detail: 'preuve dans #15991, clôture au vert', model: 'sonnet' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------
const A = args && typeof args === 'object' ? args : {}
const REPO = '/home/user/meeshy'
const GH = 'isopen-io/meeshy'
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const ISSUE = Number.isInteger(A.issue) ? A.issue : 15991
const TOURS = Number.isInteger(A.tours) && A.tours > 0 ? A.tours : 6
const BROUILLONS = A.brouillons !== false
const SAUTER_PR = new Set(Array.isArray(A.sauterPR) ? A.sauterPR : [])
const BRANCHE_DEMANDEE = typeof A.branche === 'string' && A.branche ? A.branche : ''
const ATTR = typeof A.attribution === 'string' && A.attribution
  ? A.attribution
  : 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const SESSION_URL = (ATTR.match(/Claude-Session: (\S+)/) || [])[1] || ''
const GARDES = `bash ${REPO}/.claude/workflows/meeshy-dev-vert-android.gardes/run.sh`
const MODELE = { mecanique: 'sonnet', corriger: 'opus' }

// ---------------------------------------------------------------------------
// SOCLE COMMUN — ce que chaque agent doit savoir, appris en le payant
// ---------------------------------------------------------------------------
const SOCLE = `
DÉPÔT ${GH}, clone ${REPO}, base ${BASE} (branche par défaut). Issue de suivi #${ISSUE}.

CI ANDROID
- La CI des PR est GELÉE (vars.PR_CI_GEL) : un job « skipped » sur une PR ne prouve RIEN. La seule preuve est un
  workflow_dispatch d'android.yml sur une branche dont la tête EST la tête de ${BASE} (ou la contient), job
  « Android (assemble + unit tests) » : assembleDebug (~12 min) puis testDebugUnitTest (~16 min), sans --continue,
  délai du job 60 min. Les jobs « Chaînes Android générées à jour », « Routes Android générées à jour » et
  « Jetons de design générés à jour » sont rapides et comptent aussi.
- Les conteneurs n'atteignent pas dl.google.com : AUCUN Gradle Android en local (jvm-check échoue aussi, libsignal 403).
  D'où les gardes locales : ${GARDES} (sortie 0 et « GARDES PROPRES » = propre). Elles couvrent le manifeste des chaînes
  écrites à la main (i18n/manifest/<module>.d/*.json), le cliquet des imports d'icônes Material directs, les noms de
  témoins illégaux sur la JVM, les imports de membres, les commentaires non fermés, l'import getValue/setValue des
  délégués Compose, « in » sur ConcurrentHashMap (KT-18053), return dans un corps d'expression, les conflits JVM
  get/set, les redéclarations, les apostrophes non échappées des ressources, le cliquet des routes (TO_PORT_CEILING),
  les \`when\` sur OutboxKind sans else, les chaînes et routes générées, le schéma Room.
- Suivi d'un run : curl -sS "https://api.github.com/repos/${GH}/actions/runs/<id>/jobs?per_page=50" fonctionne SANS
  jeton. Les URL de journaux et d'artefacts (productionresultssa2.blob.core.windows.net) sont REFUSÉES (403) par le
  proxy : le journal ne se lit que par mcp__github__get_job_logs (return_content, tail_lines ≤ 5000 utiles), et
  l'artefact android-test-reports ne se télécharge pas. L'étape « Summarise failing tests » imprime une ligne
  « ##[error]<classe>.<méthode> — <message> » par témoin en échec, triée par chemin, puis « N failing test case(s). »
  Un journal de plus de 5000 lignes perd sa tête (sortie Gradle, « e: » de compilation) : cherche alors les « e: »
  et « What went wrong » avec un tail plus petit sur le job, ou dans l'étape Assemble.
- Attendre : jamais de sleep au premier plan. Lance une boucle de surveillance en ARRIÈRE-PLAN (Bash
  run_in_background, boucle curl toutes les 90 s qui sort au verdict) et attends sa notification.

RECETTES ROBOLECTRIC (vérifiées sur la CI de ce dépôt)
- Les touchers n'atteignent pas les fenêtres ModalBottomSheet/Dialog : performSemanticsAction(SemanticsActions.OnClick).
- clearAndSetSemantics efface le texte des enfants : asserter stateDescription / contentDescription du nœud.
- minimumInteractiveComponentSize donne une cible de 48 dp : assertTouchHeightIsEqualTo, pas la hauteur de mise en page.
- La densité mdpi par défaut casse une logique au pixel : @Config(sdk = [34], qualifiers = "xxhdpi").
- mainClock.autoAdvance = false avant setContent évite d'attendre des images qui ne viennent pas (animation infinie).
- Un mockk relaxed rend Object pour un StateFlow générique : le stubber explicitement (every { x } returns MutableStateFlow(...)).
- import androidx.compose.runtime.getValue (et setValue pour un var) pour tout délégué « by ».

FUITE COMPOSE (garde ComposeMainDispatcherGuard, #15815, sur sdk-ui et feature:chat)
- Symptôme : des centaines de témoins tombent avec « AndroidUiDispatcher.Main n'exécute plus rien ». Aucun n'est en
  faute : le coupable est le témoin qui a PRÉCÉDÉ le premier échec dans le même bac à sable Robolectric.
- Un bac à sable par configuration de SDK : les classes d'un autre @Config(sdk = …) ne sont pas touchées.
- Dans un bac à sable, les classes passent dans l'ordre ALPHABÉTIQUE du nom qualifié (constaté au run 41788563384) ;
  dans une classe, les méthodes suivent MethodSorters.DEFAULT : String.hashCode() Java du nom de méthode (le nom
  Kotlin entre backticks), puis le nom. Calcule cet ordre, liste les classes Robolectric du module, retire celles en
  échec : le dernier témoin passé avant le premier échec est le coupable.
- Remède : vider la boucle principale. Témoin SANS règle Compose : @After { shadowOf(Looper.getMainLooper()).idle() }.
  Témoin AVEC createComposeRule : une règle d'ordre 0, extérieure (try { base.evaluate() } finally { idle() }), et
  la règle Compose en order = 1 — un @After passerait avant le démontage de l'activité (exemple : MeeshCoinTest).

RÈGLES DU DÉPÔT
- Jamais de force-push, jamais de push direct sur ${BASE}. Travail sur la branche de la session, fusion par PR.
- Un lot de cryptographie, d'authentification, de contrôle d'accès, de migration de données (dont une migration Room)
  ou de protocole passe par l'agent auditeur-adversarial AVANT fusion.
- Règle d'asymétrie : deux lots sur un même fichier, celui qui n'a rien écrit cède. Ne pousse JAMAIS sur la branche
  d'une PR que tu n'as pas ouverte : un défaut qu'elle apporte se corrige APRÈS sa fusion, depuis la branche de la session.
- Commit : message en français qui dit le résultat, terminé par les lignes
${ATTR}
- PR : titres de section du gabarit (📝 Pull Request Description / 🎯 Type of Change / 🔗 Related Issues /
  🎨 Changes Made / 🧪 Testing), corps terminé par « 🤖 Generated with [Claude Code](https://claude.com/claude-code) »
  ${SESSION_URL ? `puis la ligne ${SESSION_URL}` : ''}. Aucun identifiant de modèle dans un commit, une PR ou un code.
- Aucun commentaire GitHub hors du bilan de #${ISSUE} ; tout commentaire finit par la ligne
  « _Generated by [Claude Code](https://claude.ai/code)_ » après un séparateur ---.
- Outils GitHub : ToolSearch « select:mcp__github__list_pull_requests,mcp__github__pull_request_read,mcp__github__merge_pull_request,mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__actions_list,mcp__github__actions_get,mcp__github__actions_run_trigger,mcp__github__get_job_logs,mcp__github__issue_write,mcp__github__add_issue_comment ».
- Push : git push -u origin <branche>, réessayé 4 fois (2, 4, 8, 16 s) sur erreur réseau seulement.
`

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const PREPARE = {
  type: 'object',
  properties: {
    branche: { type: 'string' },
    devSha: { type: 'string' },
    gardesPropres: { type: 'boolean' },
    gardesSortie: { type: 'string' },
    dernierRun: { type: 'string', description: 'id, SHA et conclusion du dernier android.yml connu sur la branche' },
  },
  required: ['branche', 'devSha', 'gardesPropres'],
}
const PR_ITEM = {
  type: 'object',
  properties: {
    number: { type: 'integer' },
    headSha: { type: 'string' },
    raison: { type: 'string' },
  },
  required: ['number', 'raison'],
}
const FUSION = {
  type: 'object',
  properties: {
    fusionnees: { type: 'array', items: { type: 'integer' } },
    sensibles: { type: 'array', items: PR_ITEM, description: 'lots sensibles non encore audités à ce SHA de tête' },
    conflits: { type: 'array', items: PR_ITEM },
    ignorees: { type: 'array', items: PR_ITEM },
    correctifs: { type: 'array', items: { type: 'integer' }, description: 'PR de correctif ouvertes et fusionnées' },
    devSha: { type: 'string' },
  },
  required: ['fusionnees', 'sensibles', 'conflits', 'ignorees', 'correctifs', 'devSha'],
}
const VERDICT_AUDIT = {
  type: 'object',
  properties: {
    number: { type: 'integer' },
    verdict: { type: 'string', enum: ['fusionnable', 'bloquant'] },
    constats: { type: 'array', items: { type: 'string' } },
  },
  required: ['number', 'verdict', 'constats'],
}
const PREUVE = {
  type: 'object',
  properties: {
    runId: { type: 'string' },
    sha: { type: 'string' },
    conclusion: { type: 'string', description: 'success, failure, cancelled, timed_out' },
    jobId: { type: 'string' },
    jobsEnEchec: { type: 'array', items: { type: 'string' }, description: 'nom du job et de l’étape en échec' },
  },
  required: ['runId', 'sha', 'conclusion'],
}
const ECHECS = {
  type: 'object',
  properties: {
    compilation: { type: 'array', items: { type: 'string' }, description: 'fichier:ligne: message' },
    temoins: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          classe: { type: 'string' },
          methode: { type: 'string' },
          message: { type: 'string' },
          cadre: { type: 'string', description: 'premier cadre me.meeshy de la pile' },
        },
        required: ['classe', 'methode', 'message'],
      },
    },
    total: { type: 'integer' },
    tronque: { type: 'boolean' },
    autres: { type: 'array', items: { type: 'string' }, description: 'jobs de génération, schéma Room, délai dépassé' },
  },
  required: ['compilation', 'temoins', 'total', 'tronque', 'autres'],
}
const CORRECTION = {
  type: 'object',
  properties: {
    corrige: { type: 'array', items: { type: 'string' } },
    dejaSurDev: { type: 'array', items: { type: 'string' } },
    restant: { type: 'array', items: { type: 'string' }, description: 'cause et raison pour laquelle elle n’est pas corrigée' },
    prs: { type: 'array', items: { type: 'integer' } },
  },
  required: ['corrige', 'dejaSurDev', 'restant', 'prs'],
}

// ---------------------------------------------------------------------------
// PRÉPARER
// ---------------------------------------------------------------------------
phase('Préparer')
const prep = await agent(`${SOCLE}
TÂCHE — préparer la branche de travail.
1. cd ${REPO}. Branche de travail : ${BRANCHE_DEMANDEE ? `« ${BRANCHE_DEMANDEE} »` : 'la branche courante (git branch --show-current)'} ;
   si c'est ${BASE} ou main, ARRÊTE et rends branche = "" avec la raison dans gardesSortie.
2. git fetch origin ${BASE} <branche> (4 essais). Crée la branche si besoin depuis origin/${BASE}. Aligne-la sur
   origin/${BASE} : fast-forward si possible, sinon git merge --no-edit origin/${BASE} (jamais de reset destructif
   d'un travail non poussé, jamais de force-push). Pousse.
3. Lance ${GARDES} sur la tête obtenue et rends la fin de sa sortie.
4. Dernier verdict : actions_list list_workflow_runs resource_id android.yml, branch <branche>, perPage 5 → id, SHA,
   conclusion du plus récent.
5. Lis le corps de #${ISSUE} (§ « État à la reprise ») pour le contexte.`, { label: 'préparer', phase: 'Préparer', schema: PREPARE, model: MODELE.mecanique })

if (!prep || !prep.branche) {
  log(`Arrêt : branche de travail introuvable ou interdite — ${prep ? prep.gardesSortie : 'agent mort'}`)
  return { arret: 'branche', prep }
}
const BR = prep.branche
log(`Branche ${BR}, dev ${prep.devSha.slice(0, 10)}, gardes ${prep.gardesPropres ? 'propres' : 'EN FAUTE'} ; ${prep.dernierRun || ''}`)

// ---------------------------------------------------------------------------
// BOUCLE — fusionner, auditer, prouver, extraire, corriger
// ---------------------------------------------------------------------------
const audits = new Map()
const historique = []
let vert = null
let stagnation = 0

for (let tour = 1; tour <= TOURS && !vert; tour++) {
  log(`Tour ${tour}/${TOURS}`)

  const bloques = [...audits.entries()].filter(([, v]) => v.verdict === 'bloquant').map(([k]) => k)
  const fusion = await agent(`${SOCLE}
TÂCHE — fusionner dans ${BASE} toutes les PR ouvertes qui peuvent l'être, une par une, de la plus ancienne à la plus récente.
Branche de travail : ${BR}. Ignore : ${JSON.stringify([...SAUTER_PR])}. Audits déjà rendus (numéro@SHA) : bloquants ${JSON.stringify(bloques)},
fusionnables ${JSON.stringify([...audits.entries()].filter(([, v]) => v.verdict === 'fusionnable').map(([k]) => k))}.
Pour chaque PR ouverte de base ${BASE} (list_pull_requests state open base ${BASE}) :
a. Brouillon : ${BROUILLONS ? `si le dernier commit de sa branche a plus de 20 minutes, update_pull_request draft false puis traite-la ; sinon ignore-la (« travail vivant »).` : 'ignore-la.'}
b. Sensible (crypto, E2EE, clés, auth, session, jeton, contrôle d'accès, migration de données ou Room, protocole
   socket/API rétrocompatible — lis git diff --stat origin/${BASE}...origin/<branche> et les chemins) : si son
   numéro@SHA de tête n'a pas d'audit FUSIONNABLE ci-dessus, NE LA FUSIONNE PAS et range-la dans « sensibles » ;
   bloquante à ce SHA ⇒ « ignorees » avec la raison.
c. Simulation : git fetch origin ${BASE} <branche> ; git checkout -B sim-merge origin/${BASE} ; git merge --no-edit
   origin/<branche>. Conflit ⇒ git merge --abort, « conflits » (son auteur la reprend). Sinon ${GARDES} sur sim-merge
   ET sur origin/${BASE} seul : une faute présente des deux côtés n'est pas la sienne.
d. Fusion : merge_pull_request merge_method merge, expectedHeadSha = son SHA de tête. « head modified » ou « not
   mergeable » ⇒ relis la PR et réessaie une fois.
e. Si la simulation montrait une faute de garde APPORTÉE par la PR : depuis ${BR} alignée sur la nouvelle tête de
   ${BASE}, corrige-la (cause racine), ${GARDES} propre, commit, push, create_pull_request vers ${BASE}, fusionne-la
   aussitôt ; numéro dans « correctifs ».
f. Une faute présente sur ${BASE} AVANT toute fusion se corrige de même, une seule fois.
Termine sur ${BR} (git checkout ${BR}; git branch -D sim-merge), alignée sur origin/${BASE} et poussée ; rends devSha = tête de origin/${BASE}.`,
    { label: `fusionner:t${tour}`, phase: 'Fusionner', schema: FUSION, model: MODELE.mecanique })

  const sensibles = (fusion ? fusion.sensibles : []).filter(p => !audits.has(`${p.number}@${p.headSha || ''}`))
  const auditees = await parallel(sensibles.map(p => () =>
    agent(`TÂCHE — audit adversarial avant fusion de la PR #${p.number} de ${GH} (tête ${p.headSha || 'à lire'}) vers ${BASE}.
Motif de sensibilité : ${p.raison}. Lis le diff complet (mcp__github__pull_request_read get_diff, ou git diff origin/${BASE}...<branche>
dans ${REPO}). Cherche à casser : fuite de clair ou de clé, repli en clair, contournement d'autorisation, migration
destructive ou non réversible, perte de données, rupture de rétrocompatibilité (ancien client contre nouveau serveur
et l'inverse), identifiants ou secrets en dur. Verdict « bloquant » si UN défaut exploitable ou destructeur est établi,
« fusionnable » sinon ; constats précis avec fichier:ligne. Ne publie RIEN sur GitHub.`,
      { label: `auditer:#${p.number}`, phase: 'Auditer', schema: VERDICT_AUDIT, agentType: 'auditeur-adversarial' })
      .then(v => {
        if (v) audits.set(`${p.number}@${p.headSha || ''}`, v)
        return v
      })))
  const aFusionner = auditees.filter(Boolean).filter(v => v.verdict === 'fusionnable')
  if (aFusionner.length) {
    await agent(`${SOCLE}
TÂCHE — fusionner les PR auditées fusionnables : ${JSON.stringify(aFusionner.map(v => v.number))}, une par une, avec la même
procédure (simulation sur origin/${BASE} + ${GARDES}, merge_pull_request au SHA de tête audité — si la tête a bougé depuis
l'audit, NE FUSIONNE PAS et dis-le). Corrige après fusion toute faute de garde qu'elle apporte, depuis ${BR}, par une PR
fusionnée aussitôt. Rends un résumé d'une ligne par PR.`, { label: `fusionner-audites:t${tour}`, phase: 'Fusionner', model: MODELE.mecanique })
  }

  const preuve = await agent(`${SOCLE}
TÂCHE — prouver la tête de ${BASE} par android.yml.
1. cd ${REPO} ; git fetch origin ${BASE} ${BR} ; aligne ${BR} sur origin/${BASE} (fast-forward, ou merge --no-edit sans
   rien perdre) ; pousse. Note SHA = git rev-parse HEAD.
2. Si un run android.yml non annulé existe déjà sur ${BR} à ce SHA (actions_list list_workflow_runs), réutilise-le.
   Sinon actions_run_trigger run_workflow workflow_id android.yml ref ${BR}, puis retrouve son id par
   curl "https://api.github.com/repos/${GH}/actions/workflows/android.yml/runs?branch=${BR}&per_page=3" (head_sha = SHA).
3. Attends le verdict par une surveillance en arrière-plan (boucle curl des jobs toutes les 90 s, sortie quand le job
   « Android (assemble + unit tests) » est completed ou qu'un job échoue). Ne l'annule jamais.
4. Rends runId, sha, conclusion du job « Android (assemble + unit tests) » (ou du premier job en échec), jobId de ce
   job, et la liste « job › étape » en échec.`, { label: `prouver:t${tour}`, phase: 'Prouver', schema: PREUVE, model: MODELE.mecanique })

  if (!preuve) {
    log('Preuve impossible (agent mort) : arrêt de la boucle')
    break
  }
  historique.push({ tour, fusion, audits: auditees.filter(Boolean), preuve })
  if (preuve.conclusion === 'success') {
    vert = preuve
    break
  }
  log(`Run ${preuve.runId} (${preuve.sha.slice(0, 10)}) : ${preuve.conclusion} — ${(preuve.jobsEnEchec || []).join(' ; ')}`)

  const echecs = await agent(`${SOCLE}
TÂCHE — extraire les échecs du run ${preuve.runId}, job ${preuve.jobId || '(à retrouver par actions_list list_workflow_jobs)'}.
Jobs en échec : ${JSON.stringify(preuve.jobsEnEchec || [])}.
- mcp__github__get_job_logs job_id, return_content true, tail_lines 5000. Sauve le texte dans un fichier du
  scratchpad en UNE seule écriture Python (jamais un fichier par ligne), puis analyse-le avec python3/grep.
- Témoins : lignes « ##[error]<classe>.<méthode> — <message> » ; total = « N failing test case(s). » ; cadre = premier
  « at me.meeshy… » de la pile. Si la garde #15815 apparaît, garde UNE entrée par classe (méthodes jointes) et dis-le
  dans autres : c'est une cascade, pas N défauts.
- Compilation : lignes « e: file://…:ligne:col message » et « What went wrong » ; si le journal est tronqué
  (tronque = true), relis avec un tail_lines plus petit, et lis aussi les jobs de génération.
- Délai dépassé, schéma Room, chaînes ou routes générées : dans autres.`, { label: `extraire:t${tour}`, phase: 'Extraire', schema: ECHECS, model: MODELE.mecanique })

  const correction = await agent(`${SOCLE}
TÂCHE — rendre vert ce que le run ${preuve.runId} (SHA ${preuve.sha}) a rendu rouge, depuis la branche ${BR}.
Échecs : ${JSON.stringify(echecs || { note: 'extraction perdue : relis toi-même le journal du job ' + (preuve.jobId || '') })}.
1. git fetch origin ${BASE} ; git log --oneline ${preuve.sha}..origin/${BASE} : un échec que ${BASE} a DÉJÀ réparé va dans
   dejaSurDev (avec le commit), sans y toucher. Aligne ${BR} sur origin/${BASE}.
2. Regroupe par CAUSE RACINE (une cascade de la garde #15815 = une seule cause : trouve le coupable par la méthode
   d'ordre décrite plus haut, jamais en corrigeant les victimes).
3. Pour chaque cause restante : lis le code et le témoin, comprends pourquoi il échoue sur la CI (pas seulement ce qu'il
   affirme), corrige la cause (code ou témoin selon ce qui est faux, sans affaiblir ce que le témoin prouve, sans
   désactiver ni ignorer un témoin), ${GARDES} propre.
4. Un commit par cause, message qui dit la cause et le run ; push ; create_pull_request vers ${BASE} (titre sémantique,
   corps au gabarit, « Refs #${ISSUE} ») ; merge_pull_request aussitôt au SHA de tête.
5. Ce que tu ne peux pas corriger avec certitude va dans restant, avec ce qu'il faudrait (sonde, mesure, décision).`,
    { label: `corriger:t${tour}`, phase: 'Corriger', schema: CORRECTION, model: MODELE.corriger })
  historique[historique.length - 1].echecs = echecs
  historique[historique.length - 1].correction = correction

  const avance = (fusion && (fusion.fusionnees.length || fusion.correctifs.length)) ||
    aFusionner.length || (correction && (correction.prs.length || correction.dejaSurDev.length))
  stagnation = avance ? 0 : stagnation + 1
  if (stagnation >= 2) {
    log('Deux tours sans fusion ni correctif : arrêt, le reste demande une décision')
    break
  }
}

// ---------------------------------------------------------------------------
// BILAN
// ---------------------------------------------------------------------------
phase('Bilan')
const bilan = await agent(`${SOCLE}
TÂCHE — bilan dans #${ISSUE}.
Historique des tours (JSON) : ${JSON.stringify(historique).slice(0, 60000)}
Verdict final : ${vert ? `VERT — run ${vert.runId} au SHA ${vert.sha}` : 'PAS VERT'}.
1. git fetch origin ${BASE} ; vérifie que le SHA prouvé est bien la tête de origin/${BASE} ou un de ses ancêtres immédiats
   (s'il a bougé depuis, dis-le : la preuve vaut pour ce SHA).
2. add_issue_comment sur #${ISSUE} : PR fusionnées, correctifs, audits (bloquants avec leur raison), run et SHA prouvés,
   ce qui reste (cause, piste) ; finis par le pied de page.
3. ${vert ? `issue_write update state closed state_reason completed sur #${ISSUE}.` : `Laisse #${ISSUE} ouverte.`}
Rends le texte du commentaire.`, { label: 'bilan', phase: 'Bilan', model: MODELE.mecanique })

return { vert: Boolean(vert), preuve: vert, tours: historique.length, bilan }
