export const meta = {
  name: 'meeshy-android-media-sota',
  description:
    'Chantier « Android lit, monte et envoie images, vidéos et sons à l état de l art » (#14566, audit du 2026-11-02) sur une machine qui a le SDK Android, un appareil réel et gh avec le scope project : pilotage (milestone dédié, champs du projet), validation et PR de la branche source, puis vagues de lots TDD en worktrees, gates Gradle complets en local, revue-correction opus, audit adversarial des lots sensibles, MESURE sur appareil, PR vers dev fusionnée au vert — opus cadre, relit, mesure et arbitre ; sonnet développe ; haiku fait le mécanique',
  whenToUse:
    "Reprendre le chantier média Android là où les conteneurs sans SDK l ont laissé. Args : { repo (obligatoire, chemin absolu du clone), lots (obligatoire : le tableau .claude/workflows/meeshy-android-media-sota.lots.json → lots), reports (le tableau reports du même fichier), branche_source ('claude/festive-cray-07fl4p'), base ('dev'), date, attribution, appareils (numéros de série adb, ex. ['R58M…' (S8), '3A…' (Pixel)]), vagues (ex. [2,3]), sauter (clés), cadrer_reports (clés de reports à cadrer et développer en plus), milestone { titre, echeance 'AAAA-MM-JJ' }, pilotage (true par défaut), valider_source (true par défaut), mesurer (true par défaut si appareils), par_vague (2) }.",
  phases: [
    { title: 'Pilotage', detail: 'milestone dédié, issues rattachées, projet « Meeshy — pilotage » : Status, Priorité, Horizon', model: 'haiku' },
    { title: 'Synchroniser', detail: 'fetch, rouge préalable de dev (assembleDebug + testDebugUnitTest), appareils adb, lots déjà sur la branche source', model: 'opus' },
    { title: 'Valider la source', detail: 'la branche des conteneurs compile, ses tests passent, ses lots tiennent leur critère ; PR vers dev', model: 'opus' },
    { title: 'Cadrer', detail: 'chaque lot de la vague vérifié contre l arbre VIVANT ; plan des reports choisis ; fichiers disjoints', model: 'opus' },
    { title: 'Développer', detail: 'worktree par lot depuis origin/dev, TDD :core:model puis câblage, gates Gradle locaux', model: 'sonnet' },
    { title: 'Revue', detail: 'opus relit le diff et corrige lui-même, rejoue les gates', model: 'opus' },
    { title: 'Audit', detail: 'auditeur-adversarial sur les lots sensibles (client HTTP, cache, métadonnées, médias protégés)' },
    { title: 'Mesurer', detail: 'sur appareil réel : première image, images perdues, mémoire, énergie, durée d export — avant/après', model: 'opus' },
    { title: 'Livrer', detail: 'PR vers dev (Closes #n), fusion automatique au vert, commentaire de clôture avec preuves et dimensions', model: 'sonnet' },
    { title: 'Bilan', detail: 'haiku consigne la vague sur le parapluie et rend le bilan', model: 'haiku' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------
const A = args && typeof args === 'object' ? args : {}
if (typeof A.repo !== 'string' || !A.repo) throw new Error('args.repo manquant : chemin absolu du clone isopen-io/meeshy')
if (!Array.isArray(A.lots) || !A.lots.length) throw new Error('args.lots manquant : passer lots de .claude/workflows/meeshy-android-media-sota.lots.json')
const REPO = A.repo.replace(/\/$/, '')
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const SOURCE = typeof A.branche_source === 'string' && A.branche_source ? A.branche_source : 'claude/festive-cray-07fl4p'
const DATE = typeof A.date === 'string' ? A.date : '(date non fournie — la lire avec `date -I`)'
const ATTRIBUTION = typeof A.attribution === 'string' && A.attribution ? A.attribution : 'Co-Authored-By: Claude <noreply@anthropic.com>'
const APPAREILS = Array.isArray(A.appareils) ? A.appareils : []
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
const PAR_VAGUE = Number.isInteger(A.par_vague) && A.par_vague > 0 ? Math.min(A.par_vague, 4) : 2
const PILOTAGE = A.pilotage !== false
const VALIDER_SOURCE = A.valider_source !== false
const MESURER = A.mesurer !== false && APPAREILS.length > 0
const REPORTS = Array.isArray(A.reports) ? A.reports : []
const CADRER_REPORTS = new Set(Array.isArray(A.cadrer_reports) ? A.cadrer_reports : [])
const MILESTONE = Object.assign({ titre: 'Android lit, monte et envoie ses médias à l\'état de l\'art — mesuré sur appareil', echeance: '2026-12-20' }, A.milestone || {})
const PARAPLUIE = Number.isInteger(A.parapluie) ? A.parapluie : 14566
const MESURES_ISSUE = Number.isInteger(A.issue_mesures) ? A.issue_mesures : 14583
const REPO_GH = 'isopen-io/meeshy'
const WT_ROOT = REPO.replace(/\/[^/]+$/, '')
const SCRATCH = `${WT_ROOT}/meeshy-android-media-sota-notes`
const MODELE = { pilotage: 'haiku', cadrer: 'opus', developper: 'sonnet', lourd: 'opus', relire: 'opus', mesurer: 'opus', livrer: 'sonnet', bilan: 'haiku' }

const reportsCadres = REPORTS.filter((r) => CADRER_REPORTS.has(r.key)).map((r) => ({ ...r, wave: r.wave || 99, depends_on: r.depends_on || [], aCadrer: true }))
const TOUS = [...A.lots, ...reportsCadres].filter((l) => !SAUTER.has(l.key))
const VAGUES = Array.isArray(A.vagues) && A.vagues.length
  ? A.vagues
  : [...new Set(TOUS.filter((l) => l.etat !== 'livré').map((l) => l.wave))].sort((a, b) => a - b)
const wt = (l) => `${WT_ROOT}/v2_meeshy-lot-${l.key}`
const br = (l) => `lot/${l.key}-${l.issue}`

// ---------------------------------------------------------------------------
// SOCLE COMMUN
// ---------------------------------------------------------------------------
const socle = (l) => `
CHANTIER « Android lit, monte et envoie images, vidéos et sons à l'état de l'art » — parapluie #${PARAPLUIE} (${REPO_GH}),
audit SOTA + code du 2026-11-02. Date : ${DATE}. Application NATIVE Kotlin \`apps/android\` (Compose, Hilt, Media3, Coil).
${l ? `TON LOT : \`${l.key}\` — issue #${l.issue} — « ${l.title} ». Lis l'issue (\`gh issue view ${l.issue} --repo ${REPO_GH} --comments\`) : contexte, preuve fichier:ligne, critère de fin, plan TDD, fichiers, risques.
RÉPERTOIRE : ${wt(l)} (worktree, branche ${br(l)}). PRÉFIXE CHAQUE commande par \`cd ${wt(l)} && \` — le shell réinitialise le cwd.
D'autres lots écrivent en même temps dans ${WT_ROOT}/v2_meeshy-lot-* : n'y écris rien.` : `RÉPERTOIRE : ${REPO}. PRÉFIXE CHAQUE commande par \`cd ${REPO} && \`.`}

CETTE MACHINE A CE QUE LES CONTENEURS N'AVAIENT PAS : le SDK Android (\`./gradlew\` complet), ${APPAREILS.length ? `des appareils adb (${APPAREILS.join(', ')})` : 'aucun appareil déclaré'}, et \`gh\` avec les scopes \`project,read:project\`.
Donc AUCUN « ça devrait compiler » : chaque lot se prouve par les gates Gradle LOCAUX, identiques à la CI android.yml :
  - boucle TDD : \`cd <wt>/apps/android && ./meeshy.sh jvm-check --tests '<FQN>'\` (:core:model, Kotlin pur) ou \`./gradlew :<module>:testDebugUnitTest --tests '<FQN>'\` ;
  - avant revue et avant PR : \`cd <wt>/apps/android && ./meeshy.sh check 2>&1 | tail -40\` (= assembleDebug + testDebugUnitTest, ≈ 15-25 min).
  Un rouge PRÉEXISTANT se prouve par ${SCRATCH}/rouge-prealable.json (même tâche rouge à la tête de origin/${BASE}) et se DIT dans la PR.
Sources des bibliothèques : lis les sources du tag exact (\`git clone --depth 1 --branch <tag> https://github.com/androidx/media\`) ou le code décompilé du cache Gradle ; jamais de signature de mémoire.

INTERDITS : pousser sur \`${BASE}\` ou \`main\` ; \`git push --force\` ; \`git rebase\` d'une branche poussée ; \`git stash\` ; plus de 4 worktrees ouverts
(hook \`.claude/hooks/worktree-limit.sh\`) ; désactiver, sauter ou affaiblir un témoin ; affaiblir une garde (politique d'URL média anti-SSRF,
retrait GPS/EXIF/atomes MP4, E2EE, médias protégés jamais en cache disque, purge de fin de session ADR-027 de apps/android/decisions.md) ;
toucher la production ; écrire un secret dans le dépôt ; une migration ou une purge de données de production.

TOUT EST DISTANT : chaque commit est poussé aussitôt (\`git push\` sur la branche du lot) ; aucun travail ne reste seulement en local.
RÈGLES (CLAUDE.md, injecté) : aucune feature sans issue ; TDD (témoin ROUGE constaté avant le code) ; la décision dans une loi PURE de
:core:model, l'écran mince ; UNE source de vérité (chercher la loi jumelle avant d'en écrire une) ; budget 1200 lignes par fichier, un
fichier > 1000 lignes ne reçoit rien sans extraction ; iso iOS (apps/ios + packages/MeeshySDK font référence) ; cache d'abord, jamais de
spinner sur un cache non vide ; une lenteur est un BUG ; treize dimensions — un lot dit lesquelles il rend mûres et ouvre une issue par
dimension qui ne l'est pas (même milestone).
COMMITS : français, le RÉSULTAT (\`feat(android/media): …\`, \`perf(android/…): …\`, \`fix(android/…): …\`), \`Refs #n\` aux étapes,
\`Closes #n\` dans le corps de la PR, et EXACTEMENT en fin de message :
${ATTRIBUTION}
Notes hors dépôt : ${SCRATCH}/<clé>/ (spécification, journaux de gates, mesures). TON RENDU est du JSON validé : champs texte COURTS
(\`rapport\` ≤ 3 000 caractères, chaque sortie de gate ≤ 800, la fin utile) ; le détail va dans ${SCRATCH}/<clé>/rapport.md que tu cites.
`

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const PILOTAGE_SCHEMA = { type: 'object', properties: {
  milestone: { type: 'integer' }, issues_rattachees: { type: 'array', items: { type: 'integer' } },
  projet: { type: 'string' }, echecs: { type: 'array', items: { type: 'string' } },
}, required: ['milestone', 'issues_rattachees', 'projet', 'echecs'] }

const SYNCHRO_SCHEMA = { type: 'object', properties: {
  dev_head: { type: 'string' }, source_head: { type: 'string' },
  rouge_prealable: { type: 'array', items: { type: 'string' } },
  appareils: { type: 'array', items: { type: 'string' } },
  lots_sur_source: { type: 'array', items: { type: 'string' }, description: 'clés des lots dont les commits sont sur la branche source et pas encore dans dev' },
  lots_deja_dans_dev: { type: 'array', items: { type: 'string' } },
  rouge_du_chantier: { type: 'array', items: { type: 'string' }, description: 'tâches ou tests rouges sur origin/dev dont la cause est un fichier d un lot du chantier (git blame / git log du fichier)' },
  rapport: { type: 'string' },
}, required: ['dev_head', 'source_head', 'rouge_prealable', 'appareils', 'lots_sur_source', 'lots_deja_dans_dev', 'rouge_du_chantier', 'rapport'] }

const SOURCE_SCHEMA = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['pr-ouverte', 'deja-fusionnee', 'rien-a-valider', 'bloque'] },
  pr: { type: 'integer' }, check_tail: { type: 'string' },
  corrections: { type: 'array', items: { type: 'string' } },
  lots_valides: { type: 'array', items: { type: 'string' } },
  lots_a_reprendre: { type: 'array', items: { type: 'string' } },
  rapport: { type: 'string' },
}, required: ['verdict', 'pr', 'check_tail', 'corrections', 'lots_valides', 'lots_a_reprendre', 'rapport'] }

const CADRAGE_SCHEMA = { type: 'object', properties: {
  lots: { type: 'array', items: { type: 'object', properties: {
    key: { type: 'string' }, decision: { type: 'string', enum: ['a-faire', 'deja-livre', 'tenu-ailleurs', 'reporte'] },
    raison: { type: 'string' }, files_owned: { type: 'array', items: { type: 'string' } },
    hors_budget: { type: 'array', items: { type: 'string' } }, plan: { type: 'string' },
  }, required: ['key', 'decision', 'raison', 'files_owned', 'hors_budget', 'plan'] } },
  collisions: { type: 'array', items: { type: 'string' } },
}, required: ['lots', 'collisions'] }

const DEV_SCHEMA = { type: 'object', properties: {
  key: { type: 'string' }, head: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } },
  files_changed: { type: 'array', items: { type: 'string' } }, tests_added: { type: 'array', items: { type: 'string' } },
  red_observed: { type: 'string' }, check_tail: { type: 'string' },
  criteria_met: { type: 'array', items: { type: 'string' } }, criteria_not_met: { type: 'array', items: { type: 'string' } },
  rapport: { type: 'string' },
}, required: ['key', 'head', 'commits', 'files_changed', 'tests_added', 'red_observed', 'check_tail', 'criteria_met', 'criteria_not_met', 'rapport'] }

const REVUE_SCHEMA = { type: 'object', properties: {
  key: { type: 'string' }, verdict: { type: 'string', enum: ['ok', 'corrigé', 'bloqué'] }, head: { type: 'string' },
  fixes: { type: 'array', items: { type: 'string' } }, residual_risks: { type: 'array', items: { type: 'string' } },
  check_tail: { type: 'string' }, rapport: { type: 'string' },
}, required: ['key', 'verdict', 'head', 'fixes', 'residual_risks', 'check_tail', 'rapport'] }

const AUDIT_SCHEMA = { type: 'object', properties: {
  key: { type: 'string' }, verdict: { type: 'string', enum: ['aucun-bloquant', 'bloquants'] },
  blocking: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'evidence', 'fix'] } },
  non_blocking: { type: 'array', items: { type: 'string' } },
}, required: ['key', 'verdict', 'blocking', 'non_blocking'] }

const MESURE_SCHEMA = { type: 'object', properties: {
  key: { type: 'string' },
  mesures: { type: 'array', items: { type: 'object', properties: {
    appareil: { type: 'string' }, scenario: { type: 'string' }, metrique: { type: 'string' },
    avant: { type: 'string' }, apres: { type: 'string' }, outil: { type: 'string' },
  }, required: ['appareil', 'scenario', 'metrique', 'avant', 'apres', 'outil'] } },
  regressions: { type: 'array', items: { type: 'string' } },
  non_mesure: { type: 'array', items: { type: 'string' } },
  rapport: { type: 'string' },
}, required: ['key', 'mesures', 'regressions', 'non_mesure', 'rapport'] }

const LIVRAISON_SCHEMA = { type: 'object', properties: {
  key: { type: 'string' }, pr: { type: 'integer' }, etat: { type: 'string', enum: ['fusionnee', 'auto-merge-armee', 'ouverte-rouge', 'non-livree'] },
  dimensions_mures: { type: 'array', items: { type: 'integer' } }, issues_ouvertes: { type: 'array', items: { type: 'integer' } },
  rapport: { type: 'string' },
}, required: ['key', 'pr', 'etat', 'dimensions_mures', 'issues_ouvertes', 'rapport'] }

const BILAN_SCHEMA = { type: 'object', properties: { commentaire: { type: 'string' }, resume: { type: 'string' } }, required: ['commentaire', 'resume'] }

// ---------------------------------------------------------------------------
// MESURE SUR APPAREIL — partagée par la branche source et les vagues
// ---------------------------------------------------------------------------
const mesurerPrompt = (l, branche, avant) => `${socle(l)}
MISSION — MESURER SUR APPAREIL RÉEL, AVANT / APRÈS (appareils : ${APPAREILS.join(', ')}). C'est ce qu'aucun conteneur n'a pu faire.
1. Construis deux APK debuggables (ou mieux : variante \`benchmark\` si le module existe) : AVANT = ${avant || `origin/${BASE}`}, APRÈS = ${branche}.
2. Dérive le scénario du critère de fin de l'issue #${l.issue} et de l'issue des mesures #${MESURES_ISSUE}. Outils, selon ce que le lot promet :
   - première image / démarrage : \`adb shell am start -W\`, marqueurs logcat du dépôt (ReelSwitchMeter…), trace Perfetto (\`adb shell perfetto -c - --txt\`) ;
   - images perdues : \`adb shell dumpsys gfxinfo me.meeshy.app reset\` puis le geste rejoué (\`adb shell input swipe …\` × 30) puis \`dumpsys gfxinfo … framestats\` (p50/p90/p95/p99, janky %) ;
   - mémoire : \`adb shell dumpsys meminfo me.meeshy.app\` (PSS total, Graphics, Native) après le scénario et après avoir quitté l'écran ;
   - décodeurs : \`adb shell dumpsys media.player\` / \`dumpsys media.codec\` (codecs matériels vivants, c2.*/OMX.* logiciels) ;
   - énergie : \`adb shell dumpsys batterystats --reset\`, scénario de 10 min, \`dumpsys batterystats me.meeshy.app\` ;
   - poids / durée d'export : taille du fichier produit, durée mesurée par les journaux.
   Trois répétitions par mesure ; rends la médiane. Un appareil absent → non_mesure, jamais un chiffre inventé.
3. Toute régression (après pire qu'avant au-delà du bruit) → regressions : elle bloque la livraison du lot.
Écris les chiffres dans ${SCRATCH}/${l.key}/mesures.md.`

// ---------------------------------------------------------------------------
// 1. PILOTAGE — ce que les conteneurs ne pouvaient pas faire (GraphQL refusé, aucun outil de milestone)
// ---------------------------------------------------------------------------
const toutesIssues = [PARAPLUIE, ...A.lots.map((l) => l.issue), ...REPORTS.map((r) => r.issue)].filter((n, i, a) => Number.isInteger(n) && a.indexOf(n) === i)
let pilotage = null
if (PILOTAGE) {
  phase('Pilotage')
  pilotage = await agent(`${socle(null)}
MISSION — PILOTAGE GITHUB (mécanique, aucune ligne de code).
1. \`gh auth status\` doit montrer les scopes project et read:project ; sinon \`gh auth refresh -s project,read:project\` et, si c'est impossible, rends l'échec.
2. Milestone : cherche \`gh api repos/${REPO_GH}/milestones?state=open --paginate --jq '.[]|"\\(.number) \\(.title)"'\` un milestone au titre « ${MILESTONE.titre} » ; sinon crée-le :
   \`gh api repos/${REPO_GH}/milestones -f title='${MILESTONE.titre.replace(/'/g, "'\\''")}' -f due_on='${MILESTONE.echeance}T00:00:00Z' -f description='Chantier #${PARAPLUIE} : lecture, montage, image et audio Android à l état de l art, chaque gain mesuré sur Galaxy S8 et Pixel récent.'\`.
3. Rattache-y ces issues (\`gh issue edit <n> --repo ${REPO_GH} --milestone '<titre>'\`) : ${toutesIssues.join(', ')}.
   (Elles étaient provisoirement dans le milestone #17 « Android en beta fermée sur le Play Store ».)
4. Projet « Meeshy — pilotage » (org isopen-io, projet 1) : \`gh project field-list 1 --owner isopen-io --format json\` ; ajoute chaque issue
   (\`gh project item-add 1 --owner isopen-io --url https://github.com/${REPO_GH}/issues/<n>\`), puis pose les champs par \`gh project item-edit\` :
   Status = In Progress pour le parapluie et les lots des vagues ${VAGUES.join(', ')} ; Todo pour les autres ; Priorité selon la sévérité de l'issue
   (P0/P1 → la plus haute disponible) ; Horizon, Début (${DATE}) et Échéance (${MILESTONE.echeance}) quand ces champs existent. N'invente aucun champ.
5. Rends le numéro du milestone, les issues rattachées, et chaque échec verbatim.`,
  { label: 'pilotage', phase: 'Pilotage', schema: PILOTAGE_SCHEMA, model: MODELE.pilotage, effort: 'low' })
}

// ---------------------------------------------------------------------------
// 2. SYNCHRONISER
// ---------------------------------------------------------------------------
phase('Synchroniser')
const synchro = await agent(`${socle(null)}
MISSION — SYNCHRONISER ET ÉTABLIR LE ROUGE PRÉALABLE.
1. \`cd ${REPO} && git fetch origin ${BASE} ${SOURCE}\` ; HEAD de origin/${BASE} et de origin/${SOURCE} (si la branche source n'existe plus, dis-le).
2. Pour chaque lot (${TOUS.map((l) => `${l.key}#${l.issue}`).join(', ')}) : ses commits (\`git log origin/${BASE}..origin/${SOURCE} --grep '#<issue>'\`, et
   \`git log origin/${BASE} --grep '#<issue>'\`) — est-il sur la branche source seulement, déjà dans ${BASE}, ou nulle part ?
3. Rouge préalable : dans un worktree DÉTACHÉ temporaire sur origin/${BASE} (\`git worktree add --detach ${WT_ROOT}/v2_meeshy-dev-ref origin/${BASE}\`),
   \`cd ${WT_ROOT}/v2_meeshy-dev-ref/apps/android && ./meeshy.sh check 2>&1 | tail -60\` ; consigne chaque tâche ou test rouge dans
   ${SCRATCH}/rouge-prealable.json ; pour chaque rouge, dis si sa cause est un fichier d'un lot du chantier déjà fusionné (\`git log -3 --format='%h %s' -- <fichier>\`
   cite #<issue> d'un lot) → rouge_du_chantier, sinon il reste préalable ; puis \`git worktree remove ${WT_ROOT}/v2_meeshy-dev-ref\`.
4. \`adb devices -l\` : liste les appareils joignables parmi ${APPAREILS.join(', ') || '(aucun déclaré)'} avec modèle et version d'Android
   (\`adb -s <s> shell getprop ro.product.model\` / \`ro.build.version.release\`).`,
{ label: 'synchroniser', phase: 'Synchroniser', schema: SYNCHRO_SCHEMA, model: MODELE.cadrer, effort: 'medium' })

// ---------------------------------------------------------------------------
// 3. VALIDER LA BRANCHE SOURCE — le travail des conteneurs n'a été prouvé que par la CI déclenchée à la main
// ---------------------------------------------------------------------------
let source = null
if (VALIDER_SOURCE && synchro && synchro.lots_sur_source.length) {
  phase('Valider la source')
  source = await agent(`${socle(null)}
MISSION — VALIDER ET LIVRER LA BRANCHE SOURCE \`${SOURCE}\` (lots : ${synchro.lots_sur_source.join(', ')}).
Les conteneurs qui l'ont écrite n'avaient pas de compilateur Android : seul :core:model y a été testé en local, le reste par android.yml
déclenché à la main. Ici tu as tout.
1. \`cd ${REPO} && git fetch origin ${SOURCE} ${BASE}\` ; s'il existe déjà une PR \`gh pr list --repo ${REPO_GH} --head ${SOURCE} --state all\`, reprends-la.
2. Worktree \`${WT_ROOT}/v2_meeshy-source\` sur une branche locale qui suit origin/${SOURCE} ; fusionne origin/${BASE} dedans (merge, jamais rebase) et
   résous les conflits en gardant la sémantique des deux côtés.
3. \`cd ${WT_ROOT}/v2_meeshy-source/apps/android && ./meeshy.sh check 2>&1 | tail -60\`. Rouge causé par la branche : corrige-le (cause racine, TDD si
   c'est un comportement), commit \`fix(android/…): …\` ; rouge préalable (rouge-prealable.json) : laisse-le et dis-le.
4. Pour chaque lot de la branche, relis son critère de fin (issue) contre le code : tient / ne tient pas. Ce qui ne tient pas → lots_a_reprendre.
5. Pousse sur origin/${SOURCE} (la branche des conteneurs — jamais ${BASE}), puis ouvre la PR vers ${BASE} si elle n'existe pas :
   titre = le résultat (« Android lit et exporte avec Media3 1.10.1, et ses vocaux en qualité iOS » ou selon les lots), corps : un paragraphe par
   lot avec \`Closes #<issue>\` SEULEMENT pour les lots qui tiennent leur critère, la preuve (\`./meeshy.sh check\` vert, extraits), ce qui reste.
   La PR vers ${BASE} fusionne seule au vert (#9226) : n'appelle pas \`gh pr merge\`. Les lots crypto/auth/migration exigent l'auditeur-adversarial avant
   fusion ; ici seuls les lots sensibles (client HTTP des médias, médias protégés, nettoyeur de métadonnées) le demandent — vérifie qu'il est passé
   (commentaire sur l'issue) ou dis qu'il manque.
6. \`git worktree remove ${WT_ROOT}/v2_meeshy-source\`.`,
  { label: 'valider-source', phase: 'Valider la source', schema: SOURCE_SCHEMA, model: MODELE.relire, effort: 'high' })
  if (MESURER && source && source.lots_valides.length) {
    const lotsSource = TOUS.filter((l) => source.lots_valides.includes(l.key))
    source.mesures = (await parallel(lotsSource.map((l) => () => agent(mesurerPrompt(l, `origin/${SOURCE}`),
      { label: `mesurer:${l.key}`, phase: 'Mesurer', schema: MESURE_SCHEMA, model: MODELE.mesurer, effort: 'high' })))).filter(Boolean)
    const regressions = source.mesures.filter((m) => m.regressions.length)
    if (regressions.length) log(`régressions mesurées sur la branche source : ${regressions.map((m) => m.key).join(', ')} — à commenter sur la PR avant sa fusion`)
  }
}

// ---------------------------------------------------------------------------
// 3 bis. LOTS DÉJÀ FUSIONNÉS DANS DEV PAR LES CONTENEURS — réparer ce qu'ils cassent, puis les mesurer
// ---------------------------------------------------------------------------
let reparation = null
const fusionnes = TOUS.filter((l) => synchro && synchro.lots_deja_dans_dev.includes(l.key))
if (synchro && synchro.rouge_du_chantier.length) {
  phase('Valider la source')
  reparation = await agent(`${socle(null)}
MISSION — RÉPARER ${BASE} : ces rouges de origin/${BASE} viennent de lots du chantier déjà fusionnés (sans compilateur Android, prouvés seulement par
la CI) : ${JSON.stringify(synchro.rouge_du_chantier)}.
1. Branche \`fix/android-media-sota-${BASE}\` depuis origin/${BASE} dans le worktree ${WT_ROOT}/v2_meeshy-reparation ; reproduis chaque rouge
   (\`cd ${WT_ROOT}/v2_meeshy-reparation/apps/android && ./gradlew <tâche> 2>&1 | tail -60\`), corrige la CAUSE (jamais un test désactivé), TDD si c'est un comportement.
2. \`./meeshy.sh check\` complet vert ; commits \`fix(android/media): …\` (Refs #<issue du lot>) ; push ; PR vers ${BASE} (fusion automatique au vert, #9226) ;
   commentaire sur chaque issue de lot concernée ; \`git worktree remove ${WT_ROOT}/v2_meeshy-reparation\`.`,
  { label: 'reparer-dev', phase: 'Valider la source', schema: SOURCE_SCHEMA, model: MODELE.relire, effort: 'high' })
}
let mesuresFusionnes = []
if (MESURER && fusionnes.length) {
  mesuresFusionnes = (await parallel(fusionnes.map((l) => () => agent(mesurerPrompt(l, `origin/${BASE}`, `le PREMIER PARENT du commit de fusion qui a amené le lot #${l.issue} dans ${BASE} (\`git log origin/${BASE} --merges --first-parent --grep '#${l.issue}\\|${SOURCE}' -1\`, puis <merge>^1)`),
    { label: `mesurer:${l.key}`, phase: 'Mesurer', schema: MESURE_SCHEMA, model: MODELE.mesurer, effort: 'high' })))).filter(Boolean)
  const reg = mesuresFusionnes.filter((m) => m.regressions.length)
  if (reg.length) log(`régressions mesurées sur des lots déjà fusionnés : ${reg.map((m) => m.key).join(', ')} — une issue chacune, priorité de la feature dégradée`)
}

// ---------------------------------------------------------------------------
// 4. VAGUES — cadrer, développer, relire, auditer, mesurer, livrer
// ---------------------------------------------------------------------------
const dejaFaits = new Set([...(synchro ? synchro.lots_deja_dans_dev : []), ...((source && source.lots_valides) || [])])
const aReprendre = new Set((source && source.lots_a_reprendre) || [])
const bilans = []

for (const vague of VAGUES) {
  const candidats = TOUS.filter((l) => l.wave === vague && (!dejaFaits.has(l.key) || aReprendre.has(l.key)))
  if (!candidats.length) { log(`vague ${vague} : rien à faire (déjà livré ou sauté)`); continue }

  phase('Cadrer')
  const cadrage = await agent(`${socle(null)}
MISSION — CADRER LA VAGUE ${vague} contre l'arbre VIVANT de origin/${BASE} (fetch d'abord).
Lots : ${JSON.stringify(candidats.map((l) => ({ key: l.key, issue: l.issue, title: l.title, files_owned: l.files_owned || [], aCadrer: !!l.aCadrer, depends_on: l.depends_on })))}
Pour chacun : lis l'issue et le code cité ; décide a-faire / deja-livre (preuve : commit ou fichier:ligne) / tenu-ailleurs (une branche vivante ou
une PR ouverte écrit déjà ces fichiers : \`git branch -r --sort=-committerdate | head -40\`, \`gh pr list --repo ${REPO_GH} --state open --search <mots>\`) /
reporte (dépendance non livrée). Pour un lot marqué aCadrer (un report sans plan), écris le PLAN : loi pure dans :core:model, témoins, câblage,
fichiers exacts. Vérifie que les files_owned des lots a-faire sont DISJOINTS ; sinon, le lot qui n'a rien écrit cède (doctrine #5243) → collisions.
Signale tout fichier > 1000 lignes à toucher (\`wc -l\`) dans hors_budget, avec l'extraction prévue.`,
  { label: `cadrer:vague-${vague}`, phase: 'Cadrer', schema: CADRAGE_SCHEMA, model: MODELE.cadrer, effort: 'high' })

  const decisions = new Map(((cadrage && cadrage.lots) || []).map((d) => [d.key, d]))
  const aFaire = candidats.filter((l) => (decisions.get(l.key) || {}).decision === 'a-faire').slice(0, PAR_VAGUE)
  const ecartes = candidats.filter((l) => !aFaire.includes(l))
  if (ecartes.length) log(`vague ${vague} : écartés ${ecartes.map((l) => `${l.key} (${(decisions.get(l.key) || {}).decision || 'non cadré'})`).join(', ')}`)

  const resultats = await pipeline(
    aFaire,
    (l) => agent(`${socle(l)}
MISSION — DÉVELOPPER LE LOT (plan du cadrage : ${JSON.stringify(decisions.get(l.key))}).
1. \`cd ${REPO} && git fetch origin ${BASE} && git worktree add -b ${br(l)} ${wt(l)} origin/${BASE}\` (si la branche existe déjà, reprends-la).
2. Pousse un squelette dans les quinze minutes (\`git push -u origin ${br(l)}\`) : le témoin rouge ou la spécification — la branche poussée dit QUI.
   Ensuite COMMITTE ET POUSSE APRÈS CHAQUE ÉTAPE (témoin rouge, loi verte, chaque fichier de câblage) : rien ne vit plus de 10 minutes en local, un arrêt de session ne doit rien perdre.
3. TDD : témoins de la loi pure, ROUGE constaté (copie l'extrait), minimum pour le vert, refactor. Puis câblage mince, testé là où c'est possible
   (Robolectric, tests de module). Gates locaux à chaque étape ; \`./meeshy.sh check\` complet vert avant de rendre.
4. Si le lot touche une loi à miroirs (Prisme, présence, accent, actions) : touche les TROIS (web, iOS, Android) ou ouvre l'issue du miroir manquant.`,
    { label: `developper:${l.key}`, phase: 'Développer', schema: DEV_SCHEMA, model: l.modele === 'opus' ? MODELE.lourd : MODELE.developper, effort: 'high' }),
    (dev, l) => dev ? agent(`${socle(l)}
MISSION — REVUE-CORRECTION. Rendu du développeur : ${JSON.stringify(dev)}
Lis TOUT le diff \`git diff origin/${BASE}...HEAD\`. Corrige toi-même : critère de fin point par point, qualité des témoins (comportement, rang
autre que le premier, aucun témoin affaibli), ce qui part À CÔTÉ (en-têtes, URL, métadonnées, cache disque d'un média protégé), loi jumelle
déjà existante, budget de lignes, immuabilité, fuites (listeners, lecteurs non libérés, caches non bornés), fil principal bloqué.
\`./meeshy.sh check\` complet vert, commits \`fix(android/…): revue — …\`, push sur ${br(l)}.`,
    { label: `revue:${l.key}`, phase: 'Revue', schema: REVUE_SCHEMA, model: MODELE.relire, effort: 'high' }).then((revue) => ({ lot: l, dev, revue })) : null,
    (r) => (r && r.lot.sensible) ? agent(`${socle(r.lot)}
MISSION — AUDIT ADVERSARIAL (lecture seule). Diff : \`cd ${wt(r.lot)} && git diff origin/${BASE}...HEAD\`. Cherche ce qui FUIT ou CASSE : jeton envoyé
à un hôte tiers, URL hors politique anti-SSRF, métadonnées de lieu qui survivent, média protégé en cache disque ou lisible avant le geste, purge
de fin de session régressée, garde fail-open, test affaibli. Chaque constat bloquant : fichier:ligne + scénario + correction.`,
    { label: `audit:${r.lot.key}`, phase: 'Audit', schema: AUDIT_SCHEMA, agentType: 'auditeur-adversarial' }).then((audit) => ({ ...r, audit })) : r,
    (r) => (r && r.audit && r.audit.blocking.length) ? agent(`${socle(r.lot)}
MISSION — CORRIGER LES CONSTATS BLOQUANTS de l'audit, en TDD (témoin qui reproduit, rouge, correctif) : ${JSON.stringify(r.audit.blocking)}
\`./meeshy.sh check\` complet vert, commits \`fix(android/…): audit — …\`, push sur ${br(r.lot)}.`,
    { label: `correction:${r.lot.key}`, phase: 'Revue', schema: REVUE_SCHEMA, model: MODELE.relire, effort: 'high' }).then((correction) => ({ ...r, correction })) : r,
    (r) => (r && MESURER) ? agent(mesurerPrompt(r.lot, br(r.lot)),
    { label: `mesurer:${r.lot.key}`, phase: 'Mesurer', schema: MESURE_SCHEMA, model: MODELE.mesurer, effort: 'high' }).then((mesure) => ({ ...r, mesure })) : r,
    (r) => {
      if (!r) return null
      const bloque = (r.revue && r.revue.verdict === 'bloqué') || (r.correction && r.correction.verdict === 'bloqué') || (r.mesure && r.mesure.regressions.length)
      return agent(`${socle(r.lot)}
MISSION — LIVRER. État : ${JSON.stringify({ revue: r.revue && r.revue.verdict, correction: r.correction && r.correction.verdict, audit: r.audit && r.audit.verdict, mesure: r.mesure ? { mesures: r.mesure.mesures, regressions: r.mesure.regressions } : 'non mesuré' })}
${bloque ? `Le lot est BLOQUÉ (revue, audit ou régression mesurée) : n'ouvre PAS de PR vers ${BASE} ; commente l'issue #${r.lot.issue} avec la cause exacte et rends etat non-livree.` : `1. \`cd ${wt(r.lot)} && git fetch origin ${BASE} && git merge origin/${BASE}\` (jamais rebase) puis \`cd apps/android && ./meeshy.sh check 2>&1 | tail -40\` vert.
2. Push, puis PR vers ${BASE} : titre = le résultat de l'issue ; corps = résumé, \`Closes #${r.lot.issue}\`, preuves (gates, extraits de sortie, MESURES avant/après
   par appareil), dimensions mûres et non mûres. La PR vers ${BASE} fusionne seule au vert (#9226) : ne fusionne pas toi-même.
3. Pour chaque dimension visée qui n'est pas mûre : ouvre une issue (même milestone, liée en sous-issue du parapluie #${PARAPLUIE}).
4. Commentaire sur l'issue #${r.lot.issue} : PR, preuves, mesures, ce qui est mûr, ce qui reste, scénario à rejouer.
5. \`git worktree remove ${wt(r.lot)}\` une fois la PR ouverte (la branche reste sur origin).`}`,
      { label: `livrer:${r.lot.key}`, phase: 'Livrer', schema: LIVRAISON_SCHEMA, model: MODELE.livrer, effort: 'medium' }).then((livraison) => ({ ...r, livraison }))
    },
  )

  bilans.push({ vague, cadrage, resultats: resultats.filter(Boolean).map((r) => ({ key: r.lot.key, issue: r.lot.issue, revue: r.revue && r.revue.verdict, audit: r.audit && r.audit.verdict, mesure: r.mesure && r.mesure.mesures, livraison: r.livraison })) })
}

// ---------------------------------------------------------------------------
// 5. BILAN
// ---------------------------------------------------------------------------
phase('Bilan')
const bilan = await agent(`${socle(null)}
MISSION — BILAN. Pilotage : ${JSON.stringify(pilotage)}. Réparation de ${BASE} : ${JSON.stringify(reparation && { verdict: reparation.verdict, pr: reparation.pr })}. Mesures des lots déjà fusionnés : ${JSON.stringify(mesuresFusionnes.map((m) => ({ key: m.key, mesures: m.mesures, regressions: m.regressions })))}. Source : ${JSON.stringify(source && { verdict: source.verdict, pr: source.pr, lots_valides: source.lots_valides, lots_a_reprendre: source.lots_a_reprendre })}.
Vagues : ${JSON.stringify(bilans)}.
Poste UN commentaire sur le parapluie #${PARAPLUIE} (\`gh issue comment ${PARAPLUIE} --repo ${REPO_GH} --body-file <fichier>\`) : tableau lot → PR → état → mesures
clés (avant/après) → dimensions mûres ; ce qui reste, dans l'ordre ; les régressions et blocages avec leur issue. Termine le commentaire par :

---
_Generated by [Claude Code](https://claude.ai/code)_

Mets à jour le Status des issues dans le projet 1 (Done pour les PR fusionnées, In Progress pour les PR ouvertes, inchangé sinon).`,
{ label: 'bilan', phase: 'Bilan', schema: BILAN_SCHEMA, model: MODELE.bilan, effort: 'low' })

return { pilotage, synchro, source, reparation, mesuresFusionnes, vagues: bilans, bilan }
