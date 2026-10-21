export const meta = {
  name: 'meeshy-media-entreprise',
  description:
    'Chantier « média de grade entreprise » (2026-10-20) : lecture, ajout, édition, appels, filtres partenaires, cadres et boutique, web/coque, passerelle — quatre chaînes en parallèle (ios-lecture, ios-creation, web, serveur), lots TDD depuis origin/dev, revue-correction opus, PR vers dev fusionnée au vert, resynchronisation à chaque tour — opus cadre, relit, arbitre ; sonnet développe ; haiku fait le mécanique',
  whenToUse:
    "Lancer un ou plusieurs tours du chantier média (milestones #164, MB, MC, MD, ME, MF, MG). Args : { lots (obligatoire : la liste de lots.mjs), numeros {cle: issue}, decisions {cle: issue}, date, attribution, tours, par_tour, sauter, chaines, worktrees, base }.",
  phases: [
    { title: 'Synchroniser', detail: 'fetch origin/dev, worktrees des chaînes, shared rebâti, rouge préalable de dev, relevé des sujets tenus ailleurs', model: 'opus' },
    { title: 'Fusionner', detail: 'les PR des tours précédents : vertes ⇒ fusion ; rouges causées par le lot ⇒ correction opus ; préexistantes ⇒ fusion et commentaire', model: 'opus' },
    { title: 'Cadrer', detail: 'chaque lot candidat vérifié contre l arbre VIVANT : à faire, déjà livré, en PR, tenu ailleurs ; fichiers cibles, hors budget, collisions', model: 'opus' },
    { title: 'Développer', detail: 'par chaîne, lot après lot : spécification + TDD sur lot/<clé>-<issue> depuis origin/dev, squelette poussé tôt', model: 'sonnet' },
    { title: 'Revue', detail: 'opus relit le diff du lot, CORRIGE lui-même, rejoue les gates', model: 'opus' },
    { title: 'Livrer', detail: 'gates complets, merge de dev, commit Closes #n (« run test » pour iOS), PR vers dev, commentaire sur l issue', model: 'sonnet' },
    { title: 'Bilan', detail: 'haiku consigne le tour sur les issues et rend le bilan', model: 'haiku' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------
const A = args && typeof args === 'object' ? args : {}
if (!Array.isArray(A.lots) || !A.lots.length) throw new Error('args.lots manquant : passer la liste de lots.mjs')
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const DATE = typeof A.date === 'string' ? A.date : '(date non fournie — la lire avec `date -I`)'
const ATTRIBUTION = typeof A.attribution === 'string' && A.attribution ? A.attribution : 'Co-Authored-By: Claude <noreply@anthropic.com>'
const TOURS = Number.isInteger(A.tours) && A.tours > 0 ? A.tours : 9
const PAR_TOUR = Number.isInteger(A.par_tour) && A.par_tour > 0 ? A.par_tour : 3
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
const NUMEROS = A.numeros && typeof A.numeros === 'object' ? { ...A.numeros } : {}
const DECISIONS = A.decisions && typeof A.decisions === 'object' ? A.decisions : {}
const CHAINES = Array.isArray(A.chaines) && A.chaines.length ? A.chaines : ['serveur', 'ios-lecture', 'ios-creation', 'web']
const WT = Object.assign({
  serveur: '/home/user/meeshy',
  'ios-lecture': '/home/user/meeshy-wt-ios-lecture',
  'ios-creation': '/home/user/meeshy-wt-ios-creation',
  web: '/home/user/meeshy-wt-web',
}, A.worktrees && typeof A.worktrees === 'object' ? A.worktrees : {})
const SCRATCH = '/tmp/claude-0/-home-user-meeshy/5f0b46d3-b482-5034-807f-3c4bc3a1f3df/scratchpad/chantier'
const SWIFT_ENV = 'export PATH=/opt/swift/usr/bin:$PATH USER=root LOGNAME=root'
const XCODEGEN = '/opt/XcodeGen/.build/release/xcodegen'
const REPO_GH = 'isopen-io/meeshy'

const MODELE = {
  cadrer: 'opus', relire: 'opus', corrigerCI: 'opus', arbitrer: 'opus',
  developper: 'sonnet', lourd: 'opus', petit: 'haiku', livrer: 'sonnet', mecanique: 'haiku',
}

const LOTS = A.lots.filter((l) => !SAUTER.has(l.cle))
const LOT_PAR_CLE = new Map(LOTS.map((l) => [l.cle, l]))
const CHAINE_NOM = { 'ios-lecture': 'iOS — lecture', 'ios-creation': 'iOS — création, appels, filtres', web: 'web et coque Android', serveur: 'passerelle, shared, translator, infra' }

// ---------------------------------------------------------------------------
// SOCLE
// ---------------------------------------------------------------------------
const socle = (chaine) => `
TU TRAVAILLES SUR LE CHANTIER « MÉDIA DE GRADE ENTREPRISE » DE MEESHY (analyse du 2026-10-20), chaîne
${(CHAINE_NOM[chaine] || chaine).toUpperCase()}, dans le répertoire ${WT[chaine]}. Date : ${DATE}.

TON RÉPERTOIRE DE TRAVAIL EST ${WT[chaine]} — le shell RÉINITIALISE le cwd entre deux appels Bash : PRÉFIXE
CHAQUE commande, SANS EXCEPTION, par \`cd ${WT[chaine]} && \`. Les autres répertoires (${CHAINES.filter((c) => c !== chaine).map((c) => WT[c]).join(', ')})
appartiennent à d'autres chaînes qui y écrivent EN MÊME TEMPS : n'y lis rien, n'y écris rien. Première commande
de ta mission, littéralement : \`cd ${WT[chaine]} && git branch --show-current && git rev-parse --short HEAD\`.
INTERDITS ABSOLUS : créer, supprimer ou déplacer un worktree (\`git worktree add/remove/prune\`) ; cloner dans /tmp ;
pousser sur \`${BASE}\` ; \`git push --force\` ; \`git rebase\` ; \`gh pr merge\` sous toute forme SAUF pour l'agent de
FUSION qui fusionne UNE PR au VERT par \`gh pr merge <n> --merge\` (jamais \`--auto\`) ; \`git stash\` ; \`git checkout -- .\`
sur un arbre que tu n'as pas sali ; désactiver, sauter ou mettre en quarantaine un témoin ; contourner un gate ;
toucher la production (serveur, compose de prod déployé, données) ; écrire un secret dans le dépôt.

CE DÉPÔT TOURNE DANS UN CONTENEUR LINUX SANS XCODE. Pour le Swift : syntaxe vérifiée par \`${SWIFT_ENV} && swiftc -parse <fichier>\`
sur CHAQUE fichier .swift touché ; la compilation et les tests passent par la CI macOS de la PR (\`.github/workflows/ios.yml\`,
le sujet du commit de TÊTE doit contenir « run test », sinon la CI ne fait que compiler ; \`sdk-tests.yml\` joue
packages/MeeshySDK). Un symbole retiré ou renommé se cherche par grep dans apps/ios ET packages/MeeshySDK (swiftc -parse
ne voit pas une référence orpheline). Si tu AJOUTES ou RETIRES un fichier sous apps/ios (source ou test) :
\`cd ${WT[chaine]}/apps/ios && ${SWIFT_ENV} && ${XCODEGEN} generate\` puis COMMITTE Meeshy.xcodeproj/project.pbxproj, et
joue \`bash scripts/check_test_registration.sh && bash scripts/check_pbxproj_consistency.sh && bash scripts/check_pbxproj_quoting.sh\`.
Un conflit sur project.pbxproj se résout en reprenant celui de origin/${BASE} puis en régénérant. Les tests du SDK
(packages/MeeshySDK/Tests, SPM) n'ont pas besoin du pbxproj : préfère y poser les lois pures. Toute MESURE
(Instruments, énergie, fps) est impossible ici : écris « argumenté, non mesuré » et laisse le scénario dans l'issue.

SOURCES DE VÉRITÉ, dans cet ordre : (1) le CODE RÉEL (services/gateway/src/routes/** préfixé /api/v1, réponse
{ success, data, error (chaîne plate), pagination } ; packages/shared/types/socketio-events/** à tirets) — cite fichier:ligne ;
(2) apps/ios et packages/MeeshySDK sont la référence de disposition pour apps/web ; (3) decisions.md de chaque
dossier ; (4) CLAUDE.md (injecté) : TDD, TypeScript strict sans any, immutabilité, budget 1000-1200 lignes (un fichier
déjà hors budget : extraire d'abord, ajouter ensuite — et un fichier entre 941 et 1000 lignes ne reçoit rien non plus),
UNE source de vérité, Prisme (7 langues : fr, en, es, pt, it, de, ar), Instant App, rétrocompatibilité (#9223 : un
ancien client marche contre le nouveau serveur et l'inverse ; Prisma est en MongoDB : un champ nouveau est OPTIONNEL
ou a un @default, jamais de \`db push\`), SDK Purity (packages/MeeshySDK = briques à paramètres opaques, la politique
« quand » reste app-side) ; (5) tasks/lessons/ (\`ls tasks/lessons | grep <mot>\`).

RÈGLES DE FORME : commits en français qui disent le RÉSULTAT (\`feat(ios): …\`, \`fix(gateway): …\`, \`perf(web): …\`,
\`feat(shared): …\`), corps bref, \`Refs #n\` sur les étapes, \`Closes #n\` à la livraison (jamais \`Closes #0\`), et en fin
de message EXACTEMENT :
${ATTRIBUTION}
Code nommé en ANGLAIS, prose et textes utilisateur en français puis les 7 langues. Aucun artefact généré committé
(dist/, .cache/, node_modules/, Build/). Dossier de travail hors dépôt : ${SCRATCH}/<clé>/ (spécification, journaux).

TON RENDU STRUCTURÉ est du JSON validé : chaque champ texte est COURT (\`rapport\` ≤ 3 000 caractères, chaque sortie de
gate ≤ 800, la fin utile), le détail va dans ${SCRATCH}/<clé>/rapport.md que tu CITES. Aucun caractère de contrôle brut.
`

const GATES = {
  serveur: (wt) => `GATES SERVEUR (${wt}) :
- prérequis : \`cd ${wt}/packages/shared && npx prisma generate --generator client && bun run build\` si schema.prisma ou shared ont bougé.
- rapides, à chaque étape : \`cd ${wt}/services/gateway && bunx tsc --noEmit\` (≈ 1 min) et \`bunx jest --config=jest.config.json <fichiers du périmètre>\`.
- shared : \`cd ${wt}/packages/shared && bun run test && bun run build\`.
- translator : \`cd ${wt}/services/translator && python -m pytest <tests du périmètre> -q\` (si l'environnement python manque, dis-le ; la CI jugera).
- avant la PR : \`cd ${wt}/services/gateway && bun run test 2>&1 | tail -40\` (complet, ≈ 15 min) — rends la sortie tronquée.
  Un rouge PRÉEXISTANT se prouve par ${SCRATCH}/rouge-prealable.json (même suite rouge à la tête de ${BASE}) et se DIT dans la PR.`,
  web: (wt) => `GATES WEB (${wt}) :
- si packages/shared a bougé : \`cd ${wt}/packages/shared && bun run build\` d'abord (sinon des imports manquent dans shared/dist).
- rapides : \`cd ${wt}/apps/web && bun run type-check\` (≈ 1 min — bun test n'applique AUCUN typage) et \`bun test <fichiers du périmètre>\`.
- avant la PR : \`cd ${wt}/apps/web && bun test 2>&1 | tail -6\` (≈ 6 min ; référence à la tête de ${BASE} : 1 témoin rouge connu,
  « un témoin dépassé ne rougit plus les fichiers suivants », consigné dans ${SCRATCH}/rouge-prealable.json) puis
  \`bun run gate 2>&1 | tail -40\` (composite, long). Corriger, jamais contourner.`,
  'ios-lecture': (wt) => `GATES iOS (${wt}) :
- syntaxe : \`cd ${wt} && ${SWIFT_ENV} && for f in $(git diff --name-only origin/${BASE}...HEAD -- '*.swift'); do swiftc -parse "$f" || echo "PARSE KO $f"; done\`.
- symboles : chaque type/fonction retiré ou renommé ⇒ \`grep -rn <symbole> apps/ios packages/MeeshySDK\` vide (hors son fichier).
- budget : \`wc -l\` sur chaque fichier touché ; > 1000 lignes ⇒ extraire AVANT d'ajouter ; aucun fichier ne franchit 1200.
- projet : si un fichier apparaît/disparaît sous apps/ios : xcodegen (voir socle) + les trois scripts check_*.sh.
- gardes de source existantes : lis les tests qui citent tes fichiers (\`grep -rln "<NomDuFichier>" apps/ios/MeeshyTests packages/MeeshySDK/Tests\`) et respecte ce qu'elles exigent.
- la compilation et les tests sont rendus par la CI de la PR (sujet « run test »). Tu ne peux rien mesurer.`,
  'ios-creation': null,
}
GATES['ios-creation'] = GATES['ios-lecture']

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const SYNCHRO = {
  type: 'object', additionalProperties: false, required: ['pret', 'etat'],
  properties: {
    pret: { type: 'boolean', description: 'false SEULEMENT si origin est injoignable, si un worktree ne peut pas être créé, ou si un conflit demande un arbitrage' },
    etat: { type: 'string' }, sha_dev: { type: 'string' },
    ci_dev: { type: 'string', description: 'verdict CI à la tête de dev par workflow : ios.yml, sdk-tests.yml, ci.yml (vert / rouge : jobs / en cours)' },
    rouge_prealable: { type: 'string', description: 'résumé de ce qui est rouge AVANT le tour (jobs, suites), écrit aussi dans rouge-prealable.json' },
    tenus_ailleurs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quoi', 'preuve'], properties: { quoi: { type: 'string' }, preuve: { type: 'string' }, lots_a_eviter: { type: 'array', items: { type: 'string' } } } } },
    prs_du_chantier: { type: 'array', description: 'PR ouvertes dont la branche commence par lot/', items: { type: 'object', additionalProperties: false, required: ['numero', 'branche'], properties: { numero: { type: 'number' }, branche: { type: 'string' }, cle: { type: 'string' }, etat_checks: { type: 'string' } } } },
  },
}
const FUSION = {
  type: 'object', additionalProperties: false, required: ['fusionnee', 'rapport'],
  properties: { fusionnee: { type: 'boolean' }, sha: { type: 'string' }, checks: { type: 'string' }, corrige: { type: 'boolean', description: 'true si une correction a été poussée pour un rouge causé par le lot' }, abandon: { type: 'string', description: 'vide, ou la raison pour laquelle la PR reste ouverte (rouge non corrigé après 2 essais, conflit à arbitrer)' }, rapport: { type: 'string' } },
}
const CADRAGE = {
  type: 'object', additionalProperties: false, required: ['lots'],
  properties: {
    etat: { type: 'string' },
    lots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cle', 'verdict', 'preuve'], properties: {
      cle: { type: 'string' }, verdict: { type: 'string', enum: ['a-faire', 'deja-livre', 'tenu-ailleurs', 'en-pr', 'bloque'] },
      pr_numero: { type: 'number' }, preuve: { type: 'string' }, existe_deja: { type: 'string' },
      fichiers_cibles: { type: 'array', items: { type: 'string' } }, hors_budget: { type: 'array', items: { type: 'string' }, description: 'fichiers cibles > 940 lignes : extraire AVANT d ajouter' },
      taille: { type: 'string', enum: ['petit', 'developper', 'lourd'] }, note: { type: 'string' } } } },
    collisions: { type: 'array', items: { type: 'string' } },
  },
}
const FAIT = {
  type: 'object', additionalProperties: false, required: ['branche', 'pousse', 'rapport', 'temoins', 'gates_rapides'],
  properties: {
    branche: { type: 'string' }, pousse: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, fichiers: { type: 'array', items: { type: 'string' } },
    temoins: { type: 'array', items: { type: 'string' }, description: 'un par ligne du critère : fichier, cas, rouge PUIS vert' },
    gates_rapides: { type: 'string' }, rapport: { type: 'string' }, blocage: { type: 'string' },
    dimensions_mures: { type: 'array', items: { type: 'string' } }, dimensions_restantes: { type: 'array', items: { type: 'string' } },
    non_mesure: { type: 'string', description: 'ce que ce lot affirme sans mesure (iOS surtout) et le scénario laissé dans l issue' },
  },
}
const DEFAUT = { type: 'object', additionalProperties: false, required: ['gravite', 'constat', 'preuve', 'correctif'], properties: { gravite: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] }, constat: { type: 'string' }, preuve: { type: 'string' }, correctif: { type: 'string' } } }
const REVUE = {
  type: 'object', additionalProperties: false, required: ['verdict', 'defauts_trouves', 'corriges', 'restants', 'rapport'],
  properties: { verdict: { type: 'string', enum: ['conforme', 'a-corriger', 'a-refaire'] }, defauts_trouves: { type: 'array', items: DEFAUT }, corriges: { type: 'number' }, restants: { type: 'array', items: DEFAUT }, rapport: { type: 'string' }, gates_rejoues: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } } },
}
const LIVRAISON = {
  type: 'object', additionalProperties: false, required: ['pousse', 'rapport'],
  properties: { pousse: { type: 'boolean' }, pr_numero: { type: 'number' }, pr_url: { type: 'string' }, gates: { type: 'string' }, rouge_preexistant: { type: 'string' }, issue_commentee: { type: 'boolean' }, rapport: { type: 'string' } },
}
const BILAN = { type: 'object', additionalProperties: false, required: ['rapport'], properties: { rapport: { type: 'string' }, commentaires_poses: { type: 'number' } } }

// ---------------------------------------------------------------------------
// OUTILS
// ---------------------------------------------------------------------------
const court = (v, n) => JSON.stringify(v === undefined ? null : v, null, 1).slice(0, n)
const issueDe = (cle) => NUMEROS[cle] || (LOT_PAR_CLE.get(cle) && LOT_PAR_CLE.get(cle).issue) || 0
const brancheDe = (l) => `lot/${l.cle.toLowerCase()}-${issueDe(l.cle) || 'sans-issue'}`
const decisionTexte = (l) => l.decision ? `DÉCISION PRODUIT ${l.decision}${DECISIONS[l.decision] ? ` (#${DECISIONS[l.decision]})` : ''} : ${l.defaut ? `le lot part sur le DÉFAUT retenu, réversible — « ${l.defaut} » — et la PR le dit ; si le porteur a répondu sur l'issue (\`gh issue view\`), son verdict remplace le défaut` : 'le lot ATTEND le verdict'}` : ''
const ligneDeLot = (l) => `- ${l.cle} [${l.chaine}, ${l.taille}${issueDe(l.cle) ? `, issue #${issueDe(l.cle)}` : ''}, milestone ${l.ms}] ${l.titre}\n  critère : ${l.critere}${l.existe ? `\n  existe déjà (relevé du 2026-10-20) : ${l.existe}` : ''}${l.fichiers && l.fichiers.length ? `\n  fichiers cibles : ${l.fichiers.join(', ')}` : ''}${l.depend && l.depend.length ? `\n  dépend de : ${l.depend.map((d) => `${d}${issueDe(d) ? ` (#${issueDe(d)})` : ''}`).join(', ')}` : ''}${l.decision ? `\n  ${decisionTexte(l)}` : ''}`
const livresDejaOuEnDev = new Set() // clés dont la PR est fusionnée (connues au fil des tours)

const resultats = []
let restants = LOTS.filter((l) => !(l.decision && !l.defaut))
const attendentDecision = LOTS.filter((l) => l.decision && !l.defaut).map((l) => l.cle)
if (attendentDecision.length) log(`lots en attente d'une décision du porteur (non lancés) : ${attendentDecision.join(', ')}`)

for (let tour = 1; tour <= TOURS; tour += 1) {
  if (!restants.length) { log(`=== TOUR ${tour} — plus aucun lot, fin ===`); break }
  log(`=== TOUR ${tour}/${TOURS} — ${restants.length} lots restants ===`)

  // -------------------------------------------------------------------------
  phase('Synchroniser')
  // -------------------------------------------------------------------------
  const synchro = await agent(`${socle('serveur')}

TA MISSION — PRÉPARER LES RÉPERTOIRES DES QUATRE CHAÎNES ET RELEVER L'ÉTAT DE ${BASE}. Tu ne modifies aucun fichier de production.
Tu es le seul agent autorisé à créer un worktree, et seulement ceux-ci (le hook refuse au-delà de 3 en plus du clone principal) :
${CHAINES.filter((c) => WT[c] !== WT.serveur).map((c) => `- ${c} → ${WT[c]}`).join('\n')}

1. \`cd ${WT.serveur} && git fetch origin ${BASE}\` (4 essais : 2 s, 4 s, 8 s, 16 s). \`git log --oneline -1 origin/${BASE}\` → sha_dev.
2. Pour chaque worktree ci-dessus : s'il n'existe pas, \`cd ${WT.serveur} && git worktree add <chemin> origin/${BASE} --detach\` ;
   s'il existe : \`cd <chemin> && git status --short | head\` — un arbre SALE est le reste d'un tour interrompu : COMMITE-LE sur la
   branche courante (\`git add -A apps packages services infrastructure && git commit -m "wip(<chaîne>): reprise — état laissé par un tour interrompu"\`
   avec l'attribution) et POUSSE-LE si la branche est une branche lot/* ; jamais de stash. Puis \`git fetch origin ${BASE}\`.
   Ne change pas la branche d'un worktree (les lots s'en chargent).
3. Dans CHAQUE répertoire (le clone principal et les worktrees) : \`ls node_modules/.bun | head -1\` sinon \`bun install --ignore-scripts\` ;
   puis \`cd packages/shared && npx prisma generate --generator client && bun run build\` (shared/dist périmé = suites rouges pour rien).
4. ROUGE PRÉALABLE : \`gh run list --branch ${BASE} --limit 12 --json headSha,name,status,conclusion,workflowName\` ; pour chaque
   workflow rouge à la tête (ios.yml, sdk-tests.yml, ci.yml, docker.yml…), \`gh run view <id> --log-failed | grep -E "error:|FAIL|✗|failed" | head -40\`
   et consigne (workflow, job, suite/fichier, extrait) dans ${SCRATCH}/rouge-prealable.json (crée le dossier). Ajoute le rouge web connu
   (\`bun test\` : « un témoin dépassé ne rougit plus les fichiers suivants »). Ce fichier est la référence des agents de livraison.
5. RELEVÉ : \`gh pr list --state open --limit 60 --json number,title,headRefName,files,statusCheckRollup\` ; \`git branch -r --sort=-committerdate | head -40\`
   avec \`git log -1 --format='%ci %s' <branche>\` sur celles de moins de 72 h. Une PR ou branche vivante qui touche média / lecteur /
   cache / compression / upload / WebRTC / cadres / packs / lens TIENT son sujet : rends-la dans tenus_ailleurs avec les clés de lots à
   éviter parmi : ${restants.map((l) => l.cle).join(', ')}. EXCEPTION : les branches lot/<clé>-<n> et leurs PR sont CE chantier :
   rends-les dans prs_du_chantier (numéro, branche, clé, état des checks), jamais dans tenus_ailleurs.
Sois FACTUEL : etat cite les commandes et leurs sorties.`,
    { label: `synchroniser:tour-${tour}`, phase: 'Synchroniser', schema: SYNCHRO, model: MODELE.cadrer, effort: 'medium' })

  if (!synchro || synchro.pret === false) { log(`ARRÊT — synchronisation impossible : ${synchro ? synchro.etat : '(aucun rapport)'}`); resultats.push({ tour, arret: 'synchronisation', etat: synchro && synchro.etat }); break }
  const TENUS = Array.isArray(synchro.tenus_ailleurs) ? synchro.tenus_ailleurs : []
  const CLES_TENUES = new Set(TENUS.flatMap((t) => Array.isArray(t.lots_a_eviter) ? t.lots_a_eviter : []))
  const PRS = Array.isArray(synchro.prs_du_chantier) ? synchro.prs_du_chantier : []
  log(`${BASE} à ${synchro.sha_dev || '?'} — CI : ${(synchro.ci_dev || '?').slice(0, 160)} — ${PRS.length} PR du chantier ouvertes — ${CLES_TENUES.size} lots tenus ailleurs`)
  const RELEVE = TENUS.length ? `CE QUE D'AUTRES SESSIONS TIENNENT — n'y touche pas :\n${TENUS.map((t) => `- ${t.quoi} (preuve : ${t.preuve})`).join('\n')}\n` : 'Aucun sujet relevé comme tenu par une autre session.\n'

  // -------------------------------------------------------------------------
  phase('Fusionner')
  // -------------------------------------------------------------------------
  const cleDePr = (pr) => pr.cle || ((pr.branche || '').match(/^lot\/([a-z]+\d+)-/) || [])[1]
  const fusions = PRS.length ? await parallel(PRS.map((pr) => async () => {
    const cle = (cleDePr(pr) || '').toUpperCase()
    const l = LOT_PAR_CLE.get(cle)
    const chaine = l ? l.chaine : 'serveur'
    const f = await agent(`${socle(chaine)}

${GATES[chaine](WT[chaine])}

TA MISSION — FUSIONNER LA PR #${pr.numero} (${pr.branche}${l ? `, lot ${cle} : ${l.titre}` : ''}) DANS \`${BASE}\`, AU VERT DE SES CHECKS, ET SEULEMENT ALORS.
Tu es l'agent de FUSION : seul autorisé à \`gh pr merge\`, et uniquement \`gh pr merge <n> --merge\` (jamais --auto, jamais --squash).
1. \`cd ${WT[chaine]} && gh pr view ${pr.numero} --json state,mergeStateStatus,headRefName,statusCheckRollup,commits\` — la PR doit être OPEN vers ${BASE}.
   DIRTY/BEHIND ⇒ \`git fetch origin && git checkout ${pr.branche} && git merge origin/${BASE}\` (jamais rebase), résous en gardant les deux
   apports (project.pbxproj : reprends celui de origin/${BASE} et régénère par xcodegen), rejoue les gates rapides, pousse.
2. État des checks SANS attendre plus de 20 min au total (\`gh pr checks ${pr.numero}\` toutes les 2 min au plus) :
   - en cours depuis moins de 40 min ⇒ rends fusionnee=false, abandon="checks en cours" (le tour suivant reprendra) ;
   - TOUT VERT (pour une PR iOS : le sujet du commit de tête contient « run test », sinon pose un commit VIDE \`test(ios): … — run test (Refs #n)\`
     et reviens au point 2) ⇒ \`gh pr merge ${pr.numero} --merge\` puis \`gh pr view ${pr.numero} --json mergedAt,mergeCommit\` ;
   - UN ROUGE ⇒ \`gh run view <id> --log-failed | tail -120\` : rouge PRÉEXISTANT (même job/suite dans ${SCRATCH}/rouge-prealable.json)
     ⇒ fusionne et DIS-LE dans un commentaire de la PR ; rouge CAUSÉ par le lot ⇒ corrige-le en TDD sur la branche (pour iOS :
     lis l'erreur de compilation fichier:ligne du log xcodebuild, corrige, \`swiftc -parse\`, grep des symboles), pousse avec « run test »,
     rends fusionnee=false, corrige=true (le tour suivant jugera) ; après 2 corrections infructueuses sur la même PR, rends abandon
     avec la cause et commente la PR.
3. Si fusionnée : commentaire de clôture sur l'issue du lot si \`Closes\` manquait (\`gh issue close <n> --comment "<preuve>"\`).
Rends fusionnee, sha, checks (tronqué), corrige, abandon, rapport.`,
      { label: `fusionner:${cle || pr.numero}`, phase: 'Fusionner', schema: FUSION, model: MODELE.corrigerCI, effort: 'medium' })
    if (f && f.fusionnee && cle) livresDejaOuEnDev.add(cle)
    if (f) log(`PR #${pr.numero}${cle ? ` (${cle})` : ''} : ${f.fusionnee ? `fusionnée ${f.sha || ''}` : f.corrige ? 'corrigée, en attente de CI' : `non fusionnée${f.abandon ? ` — ${f.abandon.slice(0, 120)}` : ''}`}`)
    return { pr: pr.numero, cle, fusion: f }
  })) : []

  // -------------------------------------------------------------------------
  phase('Cadrer')
  // -------------------------------------------------------------------------
  // Un lot est candidat si ses dépendances sont fusionnées dans dev, ou portées par une PR/branche du chantier (le lot fusionnera la branche amont).
  const enPrCles = new Set(PRS.map((p) => (cleDePr(p) || '').toUpperCase()))
  const candidatsParChaine = {}
  for (const c of CHAINES) {
    const deLaChaine = restants.filter((l) => l.chaine === c && !CLES_TENUES.has(l.cle) && !enPrCles.has(l.cle))
    const prets = deLaChaine.filter((l) => (l.depend || []).every((d) => !LOT_PAR_CLE.has(d) || livresDejaOuEnDev.has(d) || enPrCles.has(d) || !restants.some((x) => x.cle === d)))
    candidatsParChaine[c] = prets.slice(0, PAR_TOUR)
  }
  const candidats = CHAINES.flatMap((c) => candidatsParChaine[c])
  if (!candidats.length) {
    log(`tour ${tour} : aucun lot candidat (dépendances en attente de fusion : ${PRS.map((p) => `#${p.numero}`).join(', ') || 'aucune PR'}) — fin du tour`)
    resultats.push({ tour, synchro: { sha_dev: synchro.sha_dev, ci_dev: synchro.ci_dev }, fusions, rien_a_faire: true })
    if (!PRS.length) break
    continue
  }

  const cadrage = await agent(`${socle('serveur')}

TA MISSION — VÉRIFIER CHAQUE LOT CANDIDAT CONTRE L'ARBRE VIVANT (origin/${BASE} = ${synchro.sha_dev || '?'}). Le relevé date du
2026-10-20 ; ${BASE} bouge de plusieurs centaines de commits par semaine. Pour CHAQUE lot, dans le répertoire de sa chaîne
(${CHAINES.map((c) => `${c} → ${WT[c]}`).join(', ')}) — lecture seule :
0. PR du chantier ? \`gh pr list --state all --search "head:lot/<clé minuscule>-" --json number,state,headRefName\` : OPEN ⇒ en-pr (pr_numero) ;
   MERGED ⇒ deja-livre.
1. Rejoue les greps qui fondent « existe déjà » et lis les fichiers cibles : DÉJÀ LIVRÉ (le critère est tenu : prouve-le, cite le commit
   \`git log -S<symbole> --oneline origin/${BASE} | head -3\`), TENU AILLEURS (une PR/branche du relevé y écrit), BLOQUÉ (une dépendance amont
   n'est ni dans ${BASE} ni sur une branche), ou À FAIRE.
2. fichiers_cibles RÉELS (les chemins du relevé ont pu bouger : \`git ls-files | grep <basename>\`) et hors_budget (\`wc -l\` > 940).
3. taille : petit (haiku : un relais délimité, un réglage, une garde, sans route nouvelle ni temps réel), developper (sonnet), lourd (opus).
4. collisions : deux lots candidats d'une même chaîne sur un même fichier ⇒ dis lequel passe avant ; deux chaînes sur un même fichier
   (packages/shared/types, schema.prisma) ⇒ lequel cède ce tour.

${RELEVE}
LES LOTS CANDIDATS :
${candidats.map(ligneDeLot).join('\n')}

Sois FACTUEL : chaque verdict porte sa preuve (fichier:ligne, commande, sortie).`,
    { label: `cadrer:tour-${tour}`, phase: 'Cadrer', schema: CADRAGE, model: MODELE.cadrer, effort: 'high' })

  const verdicts = new Map((cadrage && cadrage.lots ? cadrage.lots : []).map((v) => [v.cle, v]))
  const aFaire = candidats.filter((l) => { const v = verdicts.get(l.cle); return !v || v.verdict === 'a-faire' })
  const dejaLivres = candidats.filter((l) => verdicts.get(l.cle) && verdicts.get(l.cle).verdict === 'deja-livre')
  const tenus = candidats.filter((l) => verdicts.get(l.cle) && verdicts.get(l.cle).verdict === 'tenu-ailleurs')
  const bloques = candidats.filter((l) => verdicts.get(l.cle) && verdicts.get(l.cle).verdict === 'bloque')
  dejaLivres.forEach((l) => livresDejaOuEnDev.add(l.cle))
  log(`cadrage : ${aFaire.length} à faire (${aFaire.map((l) => l.cle).join(', ') || '—'}), ${dejaLivres.length} déjà livrés, ${tenus.length} tenus ailleurs, ${bloques.length} bloqués`)
  if (cadrage && cadrage.collisions && cadrage.collisions.length) log(`collisions : ${cadrage.collisions.join(' ; ')}`)

  // -------------------------------------------------------------------------
  // LES CHAÎNES EN PARALLÈLE ; dans une chaîne, les lots l'un après l'autre.
  // -------------------------------------------------------------------------
  const developperLot = async (l) => {
    const wt = WT[l.chaine]
    const num = issueDe(l.cle)
    const v = verdicts.get(l.cle) || {}
    const taille = v.taille || l.taille || 'developper'
    const branche = brancheDe(l)
    const modeleDev = taille === 'petit' ? MODELE.petit : taille === 'lourd' ? MODELE.lourd : MODELE.developper
    const dependances = (l.depend || []).filter((d) => LOT_PAR_CLE.has(d)).map((d) => `${d}${issueDe(d) ? ` (#${issueDe(d)})` : ''}${livresDejaOuEnDev.has(d) ? ' [dans dev]' : enPrCles.has(d) ? ' [en PR : fusionne sa branche]' : ''}`)

    const fait = await agent(`${socle(l.chaine)}

${GATES[l.chaine](wt)}

TA MISSION — LIVRER LE LOT ${l.cle} EN TDD, SUR SA BRANCHE, SQUELETTE POUSSÉ TÔT.

LE LOT : ${l.titre}${num ? ` (issue #${num})` : ''}
CRITÈRE DE FIN : ${l.critere}
${l.existe ? `EXISTE DÉJÀ (relevé du 2026-10-20) : ${l.existe}` : ''}
${v.existe_deja ? `EXISTE DÉJÀ (cadrage sur l'arbre vivant) : ${v.existe_deja}` : ''}
${v.fichiers_cibles && v.fichiers_cibles.length ? `FICHIERS CIBLES (cadrage) : ${v.fichiers_cibles.join(', ')}` : l.fichiers && l.fichiers.length ? `FICHIERS CIBLES (relevé) : ${l.fichiers.join(', ')}` : ''}
${v.hors_budget && v.hors_budget.length ? `HORS BUDGET (> 940 lignes — extraire par responsabilité AVANT d'ajouter, dans son propre commit) : ${v.hors_budget.join(', ')}` : ''}
${v.note ? `NOTE DU CADRAGE : ${v.note}` : ''}
${l.decision ? decisionTexte(l) : ''}
${dependances.length ? `DÉPEND DE : ${dependances.join(', ')} — si le lot amont n'est pas dans origin/${BASE}, \`git fetch origin\` puis \`git merge origin/<sa branche lot/…>\` dans ta branche (jamais rebase) ; la PR portera les deux et GitHub résoudra à la fusion de l'amont.` : ''}
${RELEVE}
ÉTAPES :
1. \`cd ${wt} && git fetch origin\` ; si \`origin/${branche}\` existe (tour interrompu) : \`git checkout -B ${branche} origin/${branche} && git merge origin/${BASE}\`
   et lis ce qu'elle porte (\`git log --oneline origin/${BASE}..HEAD\`, \`git diff --stat origin/${BASE}...HEAD\`) ; sinon \`git checkout -B ${branche} origin/${BASE}\`.
   \`git status --short\` doit être vide. Si shared a bougé : rebâtis dist. Commente l'issue #${num || 'n'} : « Lot démarré (tour ${tour}), branche ${branche} » (ligne vide, ---, _Generated by [Claude Code](https://claude.ai/code)_).
2. SPÉCIFIE d'abord, dans ${SCRATCH}/${l.cle}/spec.md (hors dépôt) : les sites réels cités fichier:ligne, la référence iOS lue (pour le web), les
   témoins à écrire (UN par ligne du critère), le découpage. Une question produit se tranche par la décision citée ou par le défaut le plus
   simple, et se DIT dans le rapport ; elle n'arrête pas le lot. Si le lot est manifestement trop gros pour une PR (> 1 000 lignes de diff
   ou plus d'un jour), livre une PREMIÈRE tranche cohérente (\`Refs #n\`) et dis en blocage ce qui reste : le tour suivant reprendra la branche.
3. RED : écris le(s) témoin(s), joue-le(s) (web/serveur) ou, pour iOS, écris-le(s) et constate par lecture qu'il(s) échouerai(en)t sans le code
   (dis-le) ; commite ce squelette et POUSSE-LE (\`git push -u origin ${branche}\`) dans les quinze minutes.
4. GREEN : le code MINIMAL, immutable, sans any, dans le budget. Fichiers par responsabilité. REFACTOR si ça ajoute de la valeur.
5. Gates rapides VERTS (ci-dessus). Prisme : tout texte utilisateur nouveau dans les SEPT langues. Pousse à chaque étape verte.
6. Rends : branche, commits, fichiers, témoins (rouge PUIS vert), gates rapides (sorties tronquées), dimensions mûres/restantes, non_mesure, blocage.

INTERDITS : ouvrir une PR (l'agent de livraison le fait) ; \`gh pr merge\` ; toucher services/gateway depuis une chaîne iOS ou web (une
capacité manquante ⇒ blocage, pas un contournement ; un BOGUE PROUVÉ du gateway ⇒ témoin rouge d'abord, correctif minimal, son propre
commit, dit dans le rapport) ; inventer un champ ou un événement ; désactiver un témoin ; contourner un gate ; pousser sur ${BASE}.`,
      { label: `developper:${l.cle}`, phase: 'Développer', schema: FAIT, model: modeleDev, effort: taille === 'petit' ? 'medium' : 'high' })
    if (!fait) return { cle: l.cle, issue: num, arret: 'développement sans rapport' }
    log(`${l.cle} : développé sur ${fait.branche || branche} — ${fait.pousse ? 'poussé' : 'NON poussé'}${fait.blocage ? ` — blocage : ${fait.blocage.slice(0, 160)}` : ''}`)
    if (!fait.pousse) return { cle: l.cle, issue: num, fait, arret: 'blocage' }

    const revue = await agent(`${socle(l.chaine)}

${GATES[l.chaine](wt)}

TA MISSION — RELIRE LE LOT ${l.cle} SUR SA BRANCHE ET LE CORRIGER TOI-MÊME. Tout défaut bloquant ou majeur, tu le répares, tu rejoues
les gates, tu commites (\`Refs #${num || 'n'}\`), tu pousses. Ne rends « restants » que ce qui demande un arbitrage du porteur.

LE LOT : ${l.titre}${num ? ` (issue #${num})` : ''}
CRITÈRE DE FIN : ${l.critere}
BRANCHE : ${fait.branche || branche} — \`cd ${wt} && git checkout ${fait.branche || branche} && git diff --stat origin/${BASE}...HEAD\`
RAPPORT DU DÉVELOPPEUR : ${court(fait, 4000)}

RELIS, dans cet ordre :
1. LE CRITÈRE, ligne à ligne : chaque ligne a-t-elle son témoin ? un témoin qui lit la SOURCE au lieu du COMPORTEMENT ne compte pas.
2. LE PÉRIMÈTRE : le diff ne touche que les fichiers cibles et leurs témoins ; aucun fichier > 1000 lignes n'a grossi ; aucun artefact.
3. RÉTROCOMPAT (#9223) : un ancien client contre ce serveur, un ancien serveur contre ce client — champs optionnels seulement, événement
   nouveau ignoré par un ancien lecteur, format de cache compatible ; Prisma MongoDB : jamais un champ requis sans @default.
4. « QU'EST-CE QUI PART À CÔTÉ ? » : session audio, observateurs retirés, tâches annulées, mémoire rendue, vue unique/éphémère jamais
   mis en cache (#9478), position jamais envoyée (géo-créneau), aucune donnée nominative dans une métrique.
5. CHAÎNE ${l.chaine} : ${l.chaine.startsWith('ios') ? "pas de @ObservedObject sur un singleton dans une feuille ; protocole avant service, injection par init ; rien de lourd sous @MainActor (Data(contentsOf:), décodage) ; loi pure dans MeeshySDK testée en SPM ; chaque symbole retiré grep-é ; CADisplayLink avec plage ; pbxproj régénéré si un fichier app est apparu ; swiftc -parse vert sur tous les .swift touchés ; sujet « run test » viendra à la livraison" : l.chaine === 'web' ? "bun run type-check vert ; 7 catalogues de langues ; aucun any ; lois pures dans lib/, composants minces ; check-*.mjs ajouté et câblé dans gate pour toute garde nouvelle ; référence iOS citée (D-1) ; repli Safari documenté" : "route/événement nouveau cité fichier:ligne et documenté dans services/gateway/decisions.md ; prisma generate rejoué ; témoin de sérialisation « ancien client » ; aucune route /metrics routée par Traefik ; fail-closed sur les permissions ; bun.lock modifié seulement avec une dépendance déclarée"}.
6. LA DÉCISION : ${l.decision ? decisionTexte(l) : 'aucune décision produit liée'}.
7. LES GATES : rejoue les gates rapides ET lance les gates complets de la plateforme ; rends les SORTIES tronquées.
Rends verdict (après tes corrections), défauts trouvés, corrigés, restants, commits.`,
      { label: `revue:${l.cle}`, phase: 'Revue', schema: REVUE, model: MODELE.relire, effort: taille === 'lourd' ? 'xhigh' : 'high' })
    if (revue) log(`${l.cle} : revue ${revue.verdict} — ${revue.defauts_trouves.length} défauts, ${revue.corriges} corrigés, ${revue.restants.length} restants`)
    const restantsRevue = revue && revue.restants ? revue.restants.filter((d) => d.gravite !== 'mineur') : []

    const livraison = await agent(`${socle(l.chaine)}

${GATES[l.chaine](wt)}

TA MISSION — LIVRER LE LOT ${l.cle} PAR UNE PR VERS \`${BASE}\`. Rien ne part sur ${BASE} directement ; tu ne fusionnes pas (l'agent de fusion du tour suivant le fera au vert).

LE LOT : ${l.titre}${num ? ` (issue #${num})` : ''}
BRANCHE : ${fait.branche || branche} — \`cd ${wt} && git checkout ${fait.branche || branche}\`
VERDICT DE LA REVUE : ${revue ? revue.verdict : '(aucune)'} — ${restantsRevue.length} défauts non mineurs restants.
${restantsRevue.length ? `RESTANTS (ils voyagent avec le lot et se DISENT dans la PR) :\n${court(restantsRevue, 2000)}` : ''}
${fait.non_mesure ? `NON MESURÉ (à dire dans la PR et l'issue) : ${fait.non_mesure}` : ''}

1. \`git fetch origin ${BASE}\` ; si ${BASE} a avancé, \`git merge origin/${BASE}\` (jamais rebase), résous en gardant les DEUX apports
   (project.pbxproj : reprends celui de origin/${BASE} et régénère), rebâtis shared si touché.
2. GATES COMPLETS de la plateforme (ci-dessus). Rouge CAUSÉ par le lot ⇒ corrige (TDD) ; rouge PRÉEXISTANT (même suite dans
   ${SCRATCH}/rouge-prealable.json) ⇒ dis-le dans la PR, il n'arrête pas la livraison.
3. \`git status --short\` : aucun artefact. Commit final : \`Closes #${num || 'n'}\` si le verdict n'est pas « a-refaire » et si le lot est complet
   (sinon \`Refs\` et dis pourquoi : tranche partielle, décision attendue).${l.chaine.startsWith('ios') ? ` Le SUJET du commit de TÊTE contient « run test » :
   si la tête est un commit de fusion de ${BASE}, pose \`git commit --allow-empty -m "test(ios): <ce que la suite juge> — run test (Refs #${num || 'n'})"\`.` : ''}
   \`git push -u origin ${fait.branche || branche}\` (4 essais ; rejet non fast-forward ⇒ fetch + merge, puis re-vérifie le sujet de la tête).
4. LA PR : \`gh pr list --head ${fait.branche || branche} --state open\` ; si absente, \`gh pr create --base ${BASE} --title "<titre du lot>" --body "<corps>"\`
   — corps : ce qui était absent, ce qui est livré fichier par fichier, routes/événements consommés (fichier:ligne), témoins, gates et
   chiffres, rouge préexistant, non mesuré, décision et défaut retenu, \`Closes #${num || 'n'}\`, dimensions mûres et restantes, puis une ligne
   vide et « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ».
5. Commentaire sur l'issue #${num || 'n'} : la PR, les preuves, ce qui n'est pas mesuré et le scénario Instruments laissé au porteur,
   dimensions MÛRES / RESTANTES ; une issue par dimension non mûre (même milestone) si elle n'existe pas. Ligne vide, ---, _Generated by [Claude Code](https://claude.ai/code)_
6. Rends pousse, pr_numero, pr_url, gates (tronqué), rouge_preexistant, rapport.`,
      { label: `livrer:${l.cle}`, phase: 'Livrer', schema: LIVRAISON, model: MODELE.livrer, effort: 'medium' })
    if (livraison) log(`${l.cle} : ${livraison.pousse ? 'livré' : 'NON livré'}${livraison.pr_numero ? ` — PR #${livraison.pr_numero}` : ''}`)
    return { cle: l.cle, issue: num, branche: fait.branche || branche, fait: { pousse: fait.pousse, temoins: fait.temoins, non_mesure: fait.non_mesure, blocage: fait.blocage, dimensions_mures: fait.dimensions_mures, dimensions_restantes: fait.dimensions_restantes }, revue: revue && { verdict: revue.verdict, trouves: revue.defauts_trouves.length, corriges: revue.corriges, restants: restantsRevue }, livraison }
  }

  const ordonne = (lots) => {
    const reste = [...lots]; const ordre = []; const places = new Set(); let garde = 0
    while (reste.length && garde < 100) {
      garde += 1
      const i = reste.findIndex((l) => (l.depend || []).every((d) => places.has(d) || !lots.some((x) => x.cle === d)))
      const l = i >= 0 ? reste.splice(i, 1)[0] : reste.shift()
      ordre.push(l); places.add(l.cle)
    }
    return ordre
  }
  const chaines = CHAINES.map((c) => ordonne(aFaire.filter((l) => l.chaine === c))).filter((lots) => lots.length)
  log(`chaînes : ${chaines.map((lots) => `${lots[0].chaine} (${lots.map((l) => l.cle).join(' → ')})`).join(' ‖ ') || '—'}`)

  const parChaine = chaines.length ? await parallel(chaines.map((lots) => async () => {
    const faits = []
    for (const l of lots) {
      try { faits.push(await developperLot(l)) } catch (e) {
        log(`${l.cle} : ÉCHEC d'un agent (${String(e && e.message ? e.message : e).slice(0, 160)}) — le lot repart au tour suivant`)
        faits.push({ cle: l.cle, issue: issueDe(l.cle), arret: 'échec agent' })
      }
    }
    return faits
  })) : []
  const livres = parChaine.filter(Boolean).flat()
  log(`tour ${tour} : ${livres.filter((r) => r.livraison && r.livraison.pousse).length}/${aFaire.length} lots en PR`)

  // -------------------------------------------------------------------------
  phase('Bilan')
  // -------------------------------------------------------------------------
  const bilan = await agent(`${socle('serveur')}

TA MISSION — CONSIGNER LE TOUR ${tour}, mécaniquement. Dépôt GitHub ${REPO_GH}.
1. Pour chaque lot ci-dessous SANS PR (arrêt, blocage, échec) : un commentaire sur son issue qui dit l'état et ce qui manque (court, factuel).
2. Pour chaque lot « déjà livré » constaté au cadrage : ferme l'issue avec la preuve du cadrage (\`gh issue close <n> --comment\`).
3. Pour chaque PR fusionnée ce tour dont l'issue est encore ouverte : ferme-la avec le sha.
4. Écris ${SCRATCH}/tour-${tour}.md : tableau clé · issue · PR · état · non mesuré.
Termine chaque commentaire par une ligne vide, ---, puis _Generated by [Claude Code](https://claude.ai/code)_. Rends le rapport.

LOTS DU TOUR : ${court(livres.map((r) => ({ cle: r.cle, issue: r.issue, pr: r.livraison && r.livraison.pr_numero, arret: r.arret, blocage: r.fait && r.fait.blocage, non_mesure: r.fait && r.fait.non_mesure })), 5000)}
DÉJÀ LIVRÉS : ${court(dejaLivres.map((l) => ({ cle: l.cle, issue: issueDe(l.cle), preuve: (verdicts.get(l.cle) || {}).preuve })), 3000)}
FUSIONS : ${court(fusions.filter(Boolean).map((f) => ({ pr: f.pr, cle: f.cle, fusionnee: f.fusion && f.fusion.fusionnee, sha: f.fusion && f.fusion.sha })), 2000)}`,
    { label: `bilan:tour-${tour}`, phase: 'Bilan', schema: BILAN, model: MODELE.mecanique, effort: 'low' })

  resultats.push({ tour, synchro: { sha_dev: synchro.sha_dev, ci_dev: synchro.ci_dev, rouge_prealable: synchro.rouge_prealable, tenus: TENUS.length }, fusions: fusions.filter(Boolean).map((f) => ({ pr: f.pr, cle: f.cle, fusionnee: !!(f.fusion && f.fusion.fusionnee), abandon: f.fusion && f.fusion.abandon })), cadrage: { a_faire: aFaire.map((l) => l.cle), deja_livres: dejaLivres.map((l) => l.cle), tenus: tenus.map((l) => l.cle), bloques: bloques.map((l) => l.cle), collisions: cadrage && cadrage.collisions }, lots: livres, bilan: bilan && bilan.rapport })

  // Le tour suivant : tout ce qui n'est pas fusionné (les PR ouvertes se fusionnent au tour suivant), moins les déjà livrés.
  const fusionnees = new Set(fusions.filter((f) => f && f.fusion && f.fusion.fusionnee).map((f) => f.cle))
  restants = restants.filter((l) => !dejaLivres.some((d) => d.cle === l.cle) && !fusionnees.has(l.cle))
}

return { tours: resultats, lots_restants: restants.map((l) => l.cle), en_attente_de_decision: attendentDecision }
