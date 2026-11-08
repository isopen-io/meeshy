export const meta = {
  name: 'meeshy-cercles-et-sang',
  description:
    "Chantier « Cercles de proximité et mode Sang » (milestone #215) de bout en bout et SANS S'ARRÊTER : à chaque tour, recensement des issues OUVERTES du milestone contre dev vivant (déjà livré → fermé avec preuve ; décision sans défaut, action du porteur, recette appareil → mises de côté et listées), puis quatre chaînes en parallèle (serveur = shared + gateway, ios = iOS + MeeshySDK, web, android ; iOS référence de web et Android) : dev refusionné à chaque étape, branche poussée tôt, TDD rouge→vert, revue-correction opus, audit adversarial des lots sensibles, preuve (workflow_dispatch android.yml / ios.yml, gates complets web et serveur), corrections, PR vers dev FUSIONNÉE au vert, issue fermée avec sa preuve ; validation d'intégration de dev après chaque tour (chaque régression devient une issue du milestone, donc un lot du tour suivant) ; conformité ; bilan sur l'issue chapeau — opus recense, relit, valide ; sonnet développe et prouve ; haiku fait le mécanique",
  whenToUse:
    "Reprendre ou poursuivre le chantier des cercles (#13925, milestone #215) depuis n'importe quelle session. Args : { attribution (OBLIGATOIRE : les lignes Co-Authored-By et Claude-Session de la session qui lance), date, run ('/home/user/meeshy-cercles-run' : les quatre worktrees de chaîne), repo ('/home/user/meeshy'), base ('dev'), maxTours (20), maxIdle (2), parChaine (2 lots par chaîne et par tour), essais (2), prioritaires ([16623]), seulement [numéros d'issue], sauter [numéros], fusionner (true), conformite (true), valider (true) }.",
  phases: [
    { title: 'Synchroniser', detail: 'fetch dev, quatre worktrees de chaîne recalés, shared rebâti, relevé des branches vivantes d autres sessions', model: 'sonnet' },
    { title: 'Recenser', detail: 'chaque issue ouverte du milestone #215 jugée contre dev vivant : à faire (sous-lots par plateforme, dépendances, inventaire), déjà livrée, décision, action du porteur, recette', model: 'opus' },
    { title: 'Clore', detail: 'fermeture avec preuve des issues déjà livrées', model: 'haiku' },
    { title: 'Developper', detail: 'sync dev, branche poussée tôt, témoin rouge, vert, gates locaux', model: 'sonnet' },
    { title: 'Relire', detail: 'revue-correction contre l issue, la spec et les règles du dépôt ; refuse toute recréation de l existant', model: 'opus' },
    { title: 'Auditer', detail: 'auditeur-adversarial sur les lots sensibles' },
    { title: 'Prouver', detail: 'sync dev, workflow_dispatch android.yml / ios.yml, ou gates complets web / serveur', model: 'sonnet' },
    { title: 'Corriger', detail: 'cause racine des rouges, au plus « essais » tours', model: 'sonnet' },
    { title: 'Livrer', detail: 'sync dev, PR vers dev, fusion au vert, issue fermée avec preuve quand tous ses sous-lots sont fusionnés', model: 'sonnet' },
    { title: 'Valider', detail: 'intégration de dev après les fusions du tour ; chaque régression devient une issue du milestone', model: 'opus' },
    { title: 'Conformite', detail: 'conformite-juridique : AIPD, conservation, consentements, politique de confidentialité (#13942)', model: 'opus' },
    { title: 'Bilan', detail: 'compte rendu daté sur l issue chapeau #13925', model: 'haiku' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------
const A = args && typeof args === 'object' ? args : (typeof args === 'string' ? JSON.parse(args) : {})
const texte = (v, d) => (typeof v === 'string' && v.trim() ? v.trim() : d)
const entier = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const GH = 'isopen-io/meeshy'
const MILESTONE = 215
const CHAPEAU = 13925
const REPO = texte(A.repo, '/home/user/meeshy')
const RUN = texte(A.run, '/home/user/meeshy-cercles-run')
const BASE = texte(A.base, 'dev')
const DATE = texte(A.date, '(lire `date -I`)')
const ATTR = texte(A.attribution, '')
const MAX_TOURS = entier(A.maxTours, 20)
const MAX_IDLE = entier(A.maxIdle, 2)
const PAR_CHAINE = Math.max(1, entier(A.parChaine, 2))
const ESSAIS = entier(A.essais, 2)
const FUSIONNER = A.fusionner !== false
const VALIDER = A.valider !== false
const CONFORMITE = A.conformite !== false
const PRIORITAIRES = Array.isArray(A.prioritaires) ? A.prioritaires : [16623]
const SEULEMENT = new Set(Array.isArray(A.seulement) ? A.seulement : [])
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
const CHAINES = ['serveur', 'ios', 'web', 'android']
const WT = Object.fromEntries(CHAINES.map((c) => [c, `${RUN}/${c}`]))
const SPEC = `${REPO}/docs/superpowers/specs/2026-10-31-cercles-et-mode-sang-design.md`
const XLSX = `${REPO}/docs/specs/cercles/Meeshy_niveaux_features_regles.xlsx`
const GARDES_ANDROID = `${REPO}/.claude/workflows/meeshy-dev-vert-android.gardes/run.sh`
if (!ATTR) throw new Error("attribution obligatoire : les lignes Co-Authored-By et Claude-Session de la session qui lance")

// ---------------------------------------------------------------------------
// SOCLE — ce que chaque agent doit savoir (CLAUDE.md est injecté : on ne nomme que ce qui manque)
// ---------------------------------------------------------------------------
const DECISIONS = `DÉCISIONS DU PORTEUR QUI FONT FOI (au-dessus de toute décision par défaut d'une issue) :
- 2026-10-31 : niveaux Public < Communauté < Connaissance < Ami < Proche < Sang (Atome réservé) ; niveau effectif = minimum des deux sens ;
  cran par cran, sur demande acceptée ; Connaissance automatique (≥ 10 interactions par sens sur UNE semaine glissante, dont ≥ 1 message,
  ≥ 1 réaction, ≥ 1 vue de post et ≥ 1 audio ; l'audio E2EE se compte par le messageType déclaré) ; Proche = 4 semaines actives d'affilée,
  Sang = 12 ; Ami : présence binaire, Proche : détaillée ; aucune compatibilité ascendante (mise à jour forcée, plancher de version) ;
  mineurs : l'âge déclaré fait foi, Sang / position / Bring ouverts à tous derrière un consentement refusable avec un dépliant ;
  Bring : son forcé pour l'urgence extrême, ouvert dès Ami, quotas par jour (Ami 1, Proche 3, Sang 30, Atome illimité), disponible par
  défaut et bloquable par personne, Critical Alerts demandé ; talkie avec ET sans PushToTalk, le son se lit dès sa réception (relais
  fragment par fragment) ; « jusqu'à l'arrivée » = Live Activity iOS / Live Update Android ; la carte des posts sert aux positions.
- 2026-11-07 puis 2026-11-08 (#16623) : entre deux comptes de l'ÉQUIPE (MODERATOR, ADMIN, BIGBOSS — les deux rôles lus, fail-closed),
  TOUTES les features de cercle sont disponibles, DIRECTEMENT, sans lien ni continuité : outils, audiences de contenu, notifications et
  relais d'entourage. Seuls restent fermés : acquaintance.auto (un rôle ne crée aucun lien), le blocage, soi-même, NOBODY, le
  consentement et le bouclier des mineurs déclarés. Face à un utilisateur ordinaire, rien ne change.`

const SOCLE = (chaine) => `
CHANTIER « CERCLES DE PROXIMITÉ ET MODE SANG » de Meeshy — milestone #${MILESTONE}, issue chapeau #${CHAPEAU}. Date : ${DATE}.
Dépôt ${GH}, base ${BASE}. ${chaine ? `Ton worktree : ${WT[chaine]} (chaîne ${chaine}) — le shell réinitialise le cwd : préfixe CHAQUE commande par \`cd ${WT[chaine]} && \`.` : `Clone de lecture : ${REPO} (n'y écris pas, sa branche appartient à la session).`}
Session CLOUD : pas d'Xcode, pas de SDK Android (dl.google.com refusé), staging injoignable (proxy). La recette sur appareil
(S8, iPhone, simulateur) n'est pas de ton ressort : tu la PRÉPARES (étapes précises), tu ne la simules jamais.
Spec : ${SPEC} (fait foi) ; source : ${XLSX} (python3 -I + openpyxl).

${DECISIONS}

RÉUTILISER ET METTRE À JOUR L'EXISTANT : créer un module, un modèle, une route, un événement ou un écran exige une justification écrite
dans l'issue. Une jumelle divergente est un défaut bloquant. Tout accès passe par resolveRelationAccess
(packages/shared/utils/relation-access.ts) ou ses miroirs ; ce qui part À CÔTÉ d'un champ gardé est gardé aussi.

SYNCHRONISATION AVEC ${BASE} (obligatoire, pour ne jamais perdre le fil) :
- au DÉBUT de ton étape, AVANT CHAQUE push, et toutes les ~10 minutes d'un travail long : git fetch origin && git merge --no-edit origin/${BASE} ;
- conflit : garde les deux intentions (lis le commit de ${BASE} qui l'a causé), rejoue les gates locaux, commit ; si ${BASE} a déjà livré
  ce que fait ton lot, dis-le au lieu de dupliquer ;
- jamais de rebase d'une branche poussée, jamais de force-push, jamais de push sur ${BASE} ni main.

INTERDITS : git worktree add/remove/prune (seul l'agent de synchronisation gère les worktrees ; le hook refuse le 5e), cloner dans /tmp,
gh pr merge --auto ou la route ccr/auto_merge (sans protection de branche, ils fusionnent sur-le-champ), désactiver ou affaiblir un
témoin, @Ignore / skip, relâcher un seuil.

GIT : git add <chemins> puis git diff --cached relu, jamais git commit -a ; commits en français qui disent le RÉSULTAT, « Refs #n »
aux étapes, terminés par EXACTEMENT :
${ATTR}
Push : git push -u origin <branche>, réessayé 4 fois (2, 4, 8, 16 s) sur erreur réseau seulement. Aucun nom de modèle ailleurs.

GITHUB par l'API REST (\`gh api repos/${GH}/…\` ; GraphQL, \`gh pr create/view/list\`, \`gh project\` et la pagination automatique
\`--paginate\` sont refusés ici : paginer à la main avec &page=N). Ouvrir une PR : \`gh api -X POST repos/${GH}/pulls -f base=${BASE}
-f head=<branche> -f title='…' -F body=@<fichier>\`. Fusionner : \`gh api -X PUT repos/${GH}/pulls/<n>/merge -f merge_method=merge\`.
Commenter : \`gh api -X POST repos/${GH}/issues/<n>/comments -F body=@<fichier>\`. Tout commentaire finit par « --- » puis
« _Generated by [Claude Code](https://claude.ai/code)_ » ; tout corps de PR par « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ».

CI (celle des PR est GELÉE — un job « skipped » sur une PR ne prouve rien) :
- Android : \`gh api -X POST repos/${GH}/actions/workflows/android.yml/dispatches -f ref=<branche>\`, puis le run de la branche
  (\`gh api "repos/${GH}/actions/runs?branch=<branche>&event=workflow_dispatch&per_page=5"\`), job « Android (assemble + unit tests) »
  (~30 min). Avant tout push Android : \`bash ${GARDES_ANDROID}\` (sortie 0 et « GARDES PROPRES »).
- iOS : dispatch d'ios.yml sur la branche (le lancement manuel force la suite complète), verdict « Verdict iOS (tests) ». Avant push :
  les gardes texte d'ios.yml exécutables sous Linux et apps/ios/scripts/check_cohesion_budget.sh.
- Web : preuve LOCALE — depuis apps/web, \`bun test\` COMPLET (jamais un fichier seul : les cliquets globaux ne tournent qu'en suite
  complète) + \`bun run type-check\` ; prérequis : packages/shared \`npx prisma generate --generator client && bun run build\`.
- Serveur : packages/shared \`bun run type-check && bun test\` ; services/gateway \`bunx tsc --noEmit\` puis \`bun run test:coverage\` COMPLET.
- Attendre un run : jamais de sleep au premier plan ; une boucle de surveillance en ARRIÈRE-PLAN (Bash run_in_background, l'état du run
  toutes les 90 s, sortie au verdict) dont tu attends la notification. Les journaux : \`gh api repos/${GH}/actions/jobs/<id>/logs\`.
- Un rouge PRÉEXISTANT (aucun test rouge ne touche le diff, et le même rouge existe sur origin/${BASE}) se prouve et se dit ; il ne
  bloque pas le lot (pour MeeshyTests, #14056 recense les rouges hérités).

RENDU STRUCTURÉ : JSON validé, champs texte COURTS (≤ 2 500 caractères, sorties de gate ≤ 600), aucun caractère de contrôle.
`

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const SYNCHRO = {
  type: 'object', additionalProperties: false, required: ['pret', 'etat'],
  properties: {
    pret: { type: 'boolean' },
    etat: { type: 'string' },
    sha_dev: { type: 'string' },
    ci_dev: { type: 'string' },
    tenus_ailleurs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['branche', 'issues'], properties: { branche: { type: 'string' }, issues: { type: 'array', items: { type: 'integer' } }, preuve: { type: 'string' } } } },
  },
}
const SOUS_LOT = {
  type: 'object', additionalProperties: false, required: ['chaine', 'critere'],
  properties: {
    chaine: { type: 'string', enum: CHAINES },
    critere: { type: 'string', description: 'ce que CETTE plateforme doit livrer, observable' },
    inventaire: { type: 'string', description: 'à étendre / à modifier / à ne pas toucher, fichier:ligne' },
  },
}
const RECENSEMENT = {
  type: 'object', additionalProperties: false, required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['n', 'verdict', 'preuve'],
        properties: {
          n: { type: 'integer' },
          titre: { type: 'string' },
          verdict: { type: 'string', enum: ['a-faire', 'deja-livre', 'decision-sans-defaut', 'action-porteur', 'recette-appareil', 'tenu-ailleurs', 'conformite', 'chapeau'] },
          preuve: { type: 'string', description: 'fichier:ligne, commit, PR, ou la question ouverte' },
          sensible: { type: 'boolean', description: 'accès, crypto, auth, mineurs, position, migration de données, protocole' },
          depend: { type: 'array', items: { type: 'integer' }, description: 'issues de ce milestone qui doivent être fusionnées avant' },
          sous_lots: { type: 'array', items: SOUS_LOT, description: 'ordonnés : serveur, puis ios, puis web et android' },
          defaut_applique: { type: 'string', description: 'la décision par défaut appliquée, s il y en a une' },
        },
      },
    },
    rapport: { type: 'string' },
  },
}
const CLOTURE = { type: 'object', additionalProperties: false, required: ['fermees'], properties: { fermees: { type: 'array', items: { type: 'integer' } }, rapport: { type: 'string' } } }
const DEV = {
  type: 'object', additionalProperties: false, required: ['branche', 'sha', 'temoins', 'gatesLocaux', 'recette', 'bloque'],
  properties: {
    branche: { type: 'string' }, sha: { type: 'string' },
    temoins: { type: 'array', items: { type: 'string' } },
    rougeAvant: { type: 'string' }, gatesLocaux: { type: 'string' },
    crees: { type: 'array', items: { type: 'string' }, description: 'chaque création, avec pourquoi l existant ne suffisait pas' },
    contrat: { type: 'string', description: 'serveur : types, routes et événements que les clients consomment (fichier:ligne)' },
    recette: { type: 'array', items: { type: 'string' } },
    bloque: { type: 'string', description: 'vide si rien ne bloque' },
  },
}
const REVUE = {
  type: 'object', additionalProperties: false, required: ['sha', 'corrections', 'sensible', 'critereAtteint', 'reste'],
  properties: { sha: { type: 'string' }, corrections: { type: 'array', items: { type: 'string' } }, sensible: { type: 'boolean' }, critereAtteint: { type: 'boolean' }, reste: { type: 'array', items: { type: 'string' } } },
}
const AUDIT = { type: 'object', additionalProperties: false, required: ['verdict', 'constats'], properties: { verdict: { type: 'string', enum: ['acceptable', 'bloquant'] }, constats: { type: 'array', items: { type: 'string' } }, sha: { type: 'string' } } }
const PREUVE = {
  type: 'object', additionalProperties: false, required: ['sha', 'vert', 'run', 'echecs'],
  properties: { sha: { type: 'string' }, vert: { type: 'boolean' }, run: { type: 'string' }, echecs: { type: 'array', items: { type: 'string' } }, preexistants: { type: 'array', items: { type: 'string' } } },
}
const LIVRAISON = {
  type: 'object', additionalProperties: false, required: ['pr', 'fusionnee', 'issueFermee'],
  properties: { pr: { type: 'integer' }, url: { type: 'string' }, fusionnee: { type: 'boolean' }, sha: { type: 'string' }, issueFermee: { type: 'boolean' }, suivis: { type: 'array', items: { type: 'integer' } }, rapport: { type: 'string' } },
}
const VALIDATION = {
  type: 'object', additionalProperties: false, required: ['vert', 'regressions'],
  properties: { sha_dev: { type: 'string' }, vert: { type: 'boolean' }, regressions: { type: 'array', items: { type: 'integer' }, description: 'issues ouvertes dans le milestone pour chaque régression causée par un lot du chantier' }, rapport: { type: 'string' } },
}

// ---------------------------------------------------------------------------
// ÉTAPES D'UN SOUS-LOT
// ---------------------------------------------------------------------------
const nomLot = (l) => `#${l.n}@${l.chaine}`
const brancheDe = (l) => `claude/cercles-${l.n}-${l.chaine}`

const developper = (l, contrats) => agent(`${SOCLE(l.chaine)}
SOUS-LOT ${nomLot(l)} — ${l.titre || ''}
1. Lis l'issue #${l.n} (corps ET commentaires : le dernier mot du porteur fait foi). Ce que CETTE plateforme livre :
   ${l.critere}
   Inventaire du recensement : ${l.inventaire || '(à relever)'}
   ${l.defaut ? `Décision par défaut appliquée : ${l.defaut}` : ''}
   ${contrats ? `Contrats amont fusionnés ce tour (à consommer, pas à refaire) :\n${contrats}` : ''}
2. Cadre contre l'arbre VIVANT (git fetch ; origin/${BASE}) : chaque chemin, symbole, route et événement cités existent-ils tels quels ?
   Déjà livré sur ${BASE} ⇒ bloque = « déjà livré : <preuve> » et arrête. Une branche vivante d'une autre session écrit ces chemins
   (git log origin --since=3.hours --all -- <chemins>) ⇒ bloque = « cédé à <branche> ».
3. Branche ${brancheDe(l)} : reprise si origin l'a (git checkout -B … origin/… && git merge origin/${BASE}), sinon depuis origin/${BASE}.
   Pousse dans les 15 minutes (le témoin rouge suffit) : c'est la réservation du lot.
4. TDD : témoin(s) de COMPORTEMENT rouge(s) d'abord (factories, API publique), commit et push du rouge seul ; le minimum pour le vert ;
   refactor s'il apporte. Fichier ≤ 1200 lignes (rien n'est ajouté à un fichier hors budget : extraire d'abord), fonction ≤ 80, pas de
   any, immuabilité, une source de vérité, sept langues, Instant App (cache d'abord, optimistic update, jamais de spinner sur cache non
   vide), accessibilité (VoiceOver / TalkBack / lecteur d'écran)${l.chaine === 'web' || l.chaine === 'android' ? ", ISO de l'écran iOS (cite les fichiers Swift lus)" : ''}${l.chaine === 'ios' ? ', protocole avant service, injection par init, aucun @ObservedObject sur singleton global dans une feuille' : ''}.
   ${l.chaine === 'serveur' ? 'Rends `contrat` : ce que les clients consommeront (fichier:ligne).' : 'Ne touche ni services/gateway ni packages/shared : une capacité serveur manquante est un BLOCAGE, pas un contournement.'}
5. Gates locaux de la plateforme, sync ${BASE}, commit, push. Rédige les étapes de recette APPAREIL (comptes, gestes, ce qu'on doit VOIR) ; ne les exécute pas.`,
  { label: `dev ${nomLot(l)}`, phase: 'Developper', model: 'sonnet', effort: 'medium', schema: DEV })

const relire = (l, d) => agent(`${SOCLE(l.chaine)}
REVUE-CORRECTION de ${nomLot(l)}, branche ${d.branche} (tête ${d.sha}). Tu n'approuves pas : tu cherches ce qui casse, et tu CORRIGES
toi-même (témoin d'abord pour tout défaut de comportement), gates locaux, sync ${BASE}, commit, push.
Sync ${BASE}, puis git diff origin/${BASE}...HEAD. Dans l'ordre :
1. Recréation : chaque fichier, modèle, route, événement ou écran NOUVEAU — l'existant le couvrait-il ? Jumelle divergente ⇒ fusionne-la dans l'existant.
2. Le critère (issue #${l.n} + « ${l.critere} ») cas par cas ; un témoin par cas, qui interroge le COMPORTEMENT et aurait rougi sans le correctif.
3. La loi : tout accès par resolveRelationAccess ; minimum des deux sens ; blocage ⇒ rien ; consentement ; équipe (#16623, décision du 2026-11-08) ;
   « qu'est-ce qui part À CÔTÉ ? » (champ voisin, include, sélection, tri, compteur, erreur différenciée) ; « qui AFFICHE ce qui est résolu ? ».
4. Rétrocompatibilité serveur (le plancher de version force la mise à jour des clients, mais rien n'est retiré du serveur au MVP).
5. Forme : budget, sept langues, iso iOS, Instant App, accessibilité, concurrence, cycle de vie, états manquants (hors ligne, échec, reprise).
sensible = vrai si le lot touche l'accès, la crypto, l'auth, les mineurs, la position, une migration de données ou un protocole.`,
  { label: `revue ${nomLot(l)}`, phase: 'Relire', model: 'opus', effort: 'high', schema: REVUE })

const auditer = (l, r) => agent(`${SOCLE(l.chaine)}
AUDIT ADVERSARIAL de ${nomLot(l)} (issue #${l.n}), branche ${brancheDe(l)} (tête ${r.sha}), diff contre origin/${BASE}. Casse-le :
un viewer de niveau inférieur obtient-il une donnée d'un niveau supérieur (charge, champ voisin, sélection, tri, compteur, erreur, temps) ?
l'accès à sens unique ? le privilège d'équipe franchi par un rôle de cible inconnu, ou appliqué face à un utilisateur ordinaire ou un
mineur déclaré ? blocage, baisse et refus coupent-ils IMMÉDIATEMENT (sockets, caches, pushes en vol) et restent-ils silencieux ?
consentement contourné ? migration non idempotente ? clair lu dans une conversation E2EE ? quota ou cool-down contourné ? Chaque constat
porte sa preuve (témoin rouge poussé sur la branche, ou fichier:ligne + scénario). Tu ne fusionnes rien. « bloquant » ou « acceptable ».`,
  { label: `audit ${nomLot(l)}`, phase: 'Auditer', agentType: 'auditeur-adversarial', schema: AUDIT })

const corrigerAudit = (l, a) => agent(`${SOCLE(l.chaine)}
CORRECTION EN TDD des constats d'audit de ${nomLot(l)}, branche ${brancheDe(l)} :
${a.constats.map((c) => `- ${c}`).join('\n')}
Pour chacun : le témoin rouge (celui de l'auditeur s'il l'a poussé), le correctif minimal, gates locaux, sync ${BASE}, commit \`fix(…)\`, push.
Un constat qui exige un arbitrage du porteur reste dans « reste ».`,
  { label: `corriger-audit ${nomLot(l)}`, phase: 'Auditer', model: 'opus', effort: 'high', schema: REVUE })

const prouver = (l) => agent(`${SOCLE(l.chaine)}
PREUVE de ${nomLot(l)}, branche ${brancheDe(l)}.
1. git fetch ; git checkout ${brancheDe(l)} ; sync ${BASE} (conflit : résous, gates locaux, commit) ; push.
2. ${l.chaine === 'android' ? 'workflow_dispatch android.yml sur la branche, au SHA poussé.' : l.chaine === 'ios' ? 'workflow_dispatch ios.yml sur la branche, au SHA poussé (et sdk-tests.yml si packages/MeeshySDK est touché).' : l.chaine === 'web' ? 'gates LOCAUX complets du web (bun test COMPLET depuis apps/web + type-check). run = « local ».' : 'gates LOCAUX complets du serveur (shared type-check + bun test ; gateway tsc + test:coverage COMPLET). run = « local ».'}
3. Attends le verdict (surveillance en arrière-plan). Rouge : extrais chaque échec (fichier:ligne ou classe.méthode — message) sans rien
   corriger ; range dans preexistants ceux qui sont déjà rouges sur origin/${BASE} et ne touchent pas le diff ; vert = aucun échec du lot.`,
  { label: `preuve ${nomLot(l)}`, phase: 'Prouver', model: 'sonnet', effort: 'low', schema: PREUVE })

const corriger = (l, p, tour) => agent(`${SOCLE(l.chaine)}
CORRECTION (tour ${tour}/${ESSAIS}) de ${nomLot(l)}, branche ${brancheDe(l)}, preuve rouge ${p.run} au SHA ${p.sha} :
${p.echecs.map((e) => `- ${e}`).join('\n')}
Sync ${BASE} d'abord (le rouge est peut-être déjà réparé). Cause racine pour chaque échec du lot ; un préexistant sans lien ne se corrige
pas ici. Gates locaux, sync, commit, push. vert = vrai seulement si tous les échecs du lot sont corrigés localement.`,
  { label: `correction ${nomLot(l)} #${tour}`, phase: 'Corriger', model: 'sonnet', effort: 'medium', schema: PREUVE })

const livrer = (l, d, p, r, freres) => agent(`${SOCLE(l.chaine)}
LIVRAISON de ${nomLot(l)}, branche ${brancheDe(l)}. Preuve : ${p.vert ? `VERTE (${p.run}, SHA ${p.sha})` : `ROUGE (${p.run}) : ${p.echecs.join(' ; ')}`}.
1. Sync ${BASE}, push. PR vers ${BASE} (réutilise celle de la branche si elle existe) : titre = le résultat ; corps = ce qui manquait,
   l'inventaire (étendu / modifié / créé et pourquoi), ce qui est livré fichier par fichier, routes et événements (fichier:ligne), les
   témoins, la preuve${p.preexistants && p.preexistants.length ? `, les rouges préexistants (${p.preexistants.join(' ; ')})` : ''}, « Refs #${l.n} », les
   dimensions mûres et restantes${r.reste.length ? `, une section « Reste » : ${r.reste.join(' ; ')}` : ''}.
2. ${FUSIONNER && p.vert ? `FUSIONNE-LA (la preuve est verte et dev = staging, directive #9226) : \`gh api -X PUT repos/${GH}/pulls/<n>/merge -f merge_method=merge\`, puis vérifie merged=true. Conflit au moment de fusionner : sync ${BASE}, gates, push, et recommence (une fois).` : "NE LA FUSIONNE PAS (preuve rouge ou fusion désarmée) : elle reste prête, l'échec en tête du corps, en gras."}
3. Commentaire sur #${l.n} : la PR, les témoins, la preuve, les dimensions mûres et restantes, et « Recette appareil à faire » :
${d.recette.map((s) => `   - ${s}`).join('\n')}
   Une issue de suivi par dimension non mûre (milestone ${MILESTONE}) si elle n'existe pas — rends leurs numéros.
4. ${freres.length ? `L'issue #${l.n} porte aussi ${freres.join(', ')} : ferme-la (state=closed, state_reason=completed, commentaire de preuve) SEULEMENT si leurs PR (branches claude/cercles-${l.n}-<chaîne>) sont toutes fusionnées et le critère entier tenu.` : `Si ta PR est fusionnée et le critère entier tenu : ferme #${l.n} (state=closed, state_reason=completed) avec la preuve.`}`,
  { label: `livrer ${nomLot(l)}`, phase: 'Livrer', model: 'sonnet', effort: 'low', schema: LIVRAISON })

async function sousLot(lot, contrats, freres) {
  let l = lot
  const d = await developper(l, contrats)
  if (!d) return { ...l, etat: 'perdu', raison: 'développement sans rapport' }
  // Un vrai blocage se dit par sa nature ; une note (« audit à passer », « couverture à rejouer ») n'arrête pas le lot :
  // la revue, l'audit et la preuve qui suivent sont justement ce qu'elle réclame.
  const vraiBlocage = /^\s*(déjà livré|cédé|bloqu|capacité|impossible|décision)/i.test(d.bloque || '') || !d.sha
  if (d.bloque && vraiBlocage) return { ...l, etat: /déjà livré/i.test(d.bloque) ? 'deja-livre' : 'bloque', raison: d.bloque, branche: d.branche }
  if (d.bloque) l = { ...l, critere: `${l.critere}\nNOTES DU DÉVELOPPEUR À SOLDER : ${d.bloque}` }
  let r = await relire(l, d)
  if (!r) return { ...l, etat: 'perdu', raison: 'revue perdue', branche: d.branche }
  if (r.sensible || l.sensible) {
    const a = await auditer(l, r)
    if (!a) return { ...l, etat: 'perdu', raison: 'audit perdu', branche: d.branche }
    if (a.verdict === 'bloquant') {
      const c = await corrigerAudit(l, a)
      if (!c || c.reste.length) return { ...l, etat: 'bloque', raison: `audit : ${(c ? c.reste : a.constats).join(' ; ')}`, branche: d.branche }
      r = { ...r, sha: c.sha, reste: [...r.reste, ...c.reste] }
    }
  }
  let p = await prouver(l)
  for (let tour = 1; p && !p.vert && tour <= ESSAIS; tour += 1) {
    if (!(await corriger(l, p, tour))) break
    p = await prouver(l)
  }
  if (!p) return { ...l, etat: 'perdu', raison: 'preuve perdue', branche: d.branche }
  const v = await livrer(l, d, p, r, freres)
  return { ...l, etat: v && v.fusionnee ? 'fusionne' : p.vert ? 'pr-verte' : 'pr-rouge', branche: d.branche, pr: v && v.pr, contrat: d.contrat, suivis: v && v.suivis, echecs: p.vert ? [] : p.echecs }
}

// ---------------------------------------------------------------------------
// LA BOUCLE — tour après tour, jusqu'à ce qu'il n'y ait plus rien de faisable
// ---------------------------------------------------------------------------
const bilan = { fusionnes: [], fermees: [], bloques: [], decisions: new Set(), porteur: new Set(), recettes: new Set(), regressions: [] }
let idle = 0
let conformiteFaite = false
let aRedecouper = []

for (let tour = 1; tour <= MAX_TOURS; tour += 1) {
  log(`=== TOUR ${tour}/${MAX_TOURS} ===`)

  phase('Synchroniser')
  const synchro = await agent(`${SOCLE(null)}
TA MISSION — PRÉPARER LES QUATRE WORKTREES DE CHAÎNE ET RELEVER CE QUE TIENNENT LES AUTRES SESSIONS. Tu es le SEUL agent qui gère les worktrees.
1. \`git -C ${REPO} fetch origin\` (4 essais réseau). \`git -C ${REPO} worktree list\`.
2. Pour chaque chemin ${CHAINES.map((c) => WT[c]).join(', ')} : absent ⇒ \`git -C ${REPO} worktree add <chemin> origin/${BASE} --detach\`
   (plus de 4 worktrees en plus du clone ⇒ retire d'abord un worktree d'agent fusionné et inactif de CE run, jamais celui d'une autre session ;
   impossible ⇒ pret=false) ; présent ⇒ arbre sale = reste d'un tour interrompu : commite-le sur sa branche (\`wip(<chaîne>): reprise\`,
   attribution exacte) et pousse ; puis \`git -C <chemin> checkout --detach origin/${BASE}\`.
3. Dans chaque worktree : \`ls node_modules/.bun | head -1\` sinon \`bun install --ignore-scripts\` ; serveur et web : packages/shared
   \`npx prisma generate --generator client && bun run build\`.
4. \`git -C ${REPO} log --oneline -1 origin/${BASE}\` et la CI de cette tête (\`gh api "repos/${GH}/actions/runs?branch=${BASE}&per_page=10"\`) → ci_dev.
5. Relevé : branches poussées depuis moins de 3 h (\`git -C ${REPO} for-each-ref --sort=-committerdate refs/remotes/origin --format='%(committerdate:iso) %(refname:short)' | head -60\`)
   et PR ouvertes (\`gh api "repos/${GH}/pulls?state=open&per_page=100"\`) qui touchent les cercles (relation, presence, friend, fanout,
   postAudience, Bring, talkie, now-playing, location, consent, cercles) — SAUF les branches claude/cercles-<n>-<chaîne> de CE workflow :
   rends-les dans tenus_ailleurs avec les numéros d'issue qu'elles servent.`,
    { label: `synchroniser:tour-${tour}`, phase: 'Synchroniser', model: 'sonnet', effort: 'medium', schema: SYNCHRO })
  if (!synchro || !synchro.pret) { log(`ARRÊT — synchronisation impossible : ${synchro ? synchro.etat.slice(0, 300) : '(aucun rapport)'}`); break }
  const tenus = new Set((synchro.tenus_ailleurs || []).flatMap((t) => t.issues || []))
  log(`${BASE} à ${synchro.sha_dev || '?'} — CI : ${(synchro.ci_dev || '?').slice(0, 120)}${tenus.size ? ` — issues tenues ailleurs : ${[...tenus].join(', ')}` : ''}`)

  phase('Recenser')
  const recensement = await agent(`${SOCLE(null)}
TA MISSION — RECENSER LES ISSUES OUVERTES DU MILESTONE #${MILESTONE} CONTRE ${BASE} VIVANT (${synchro.sha_dev || '?'}).
Liste-les : \`gh api "repos/${GH}/issues?milestone=${MILESTONE}&state=open&per_page=100&page=N"\` (N = 1, 2, … jusqu'à une page vide ;
écarte les pull_request). Pour CHACUNE, lis le corps et les commentaires (le dernier mot du porteur fait foi), puis l'arbre vivant :
- a-faire : le critère n'est pas tenu sur ${BASE}. Découpe-le en sous_lots par plateforme (chaîne serveur = packages/shared + services/gateway ;
  ios = apps/ios + packages/MeeshySDK ; web = apps/web ; android = apps/android), dans l'ordre serveur → ios → web/android, chacun avec son
  critère observable et son inventaire (fichier:ligne). depend = les issues de ce milestone dont il consomme le contrat et qui ne sont pas
  sur ${BASE}. sensible si accès, crypto, auth, mineurs, position, migration, protocole.
- deja-livre : le critère est tenu sur ${BASE} — preuve = commit ou PR fusionnée + fichier:ligne + témoin existant.
- decision-sans-defaut : une décision-produit ouverte SANS défaut écrit (label décision-par-défaut absent, aucun défaut dans l'issue ni
  dans la spec § 8) — preuve = la question. Une décision qui a un défaut est a-faire avec defaut_applique.
- action-porteur : seul le porteur peut la faire (portail Apple, store, avis juridique signé, feu vert de production).
- recette-appareil : ne se prouve que sur appareil réel (#13941 et ses pareilles).
- tenu-ailleurs : une branche ou une PR vivante d'une autre session la sert (relevé : ${[...tenus].join(', ') || 'aucune'}).
- conformite : #13942 et les issues de pure analyse juridique.
- chapeau : #${CHAPEAU}.
${SEULEMENT.size ? `Ne retiens comme a-faire que : ${[...SEULEMENT].join(', ')}.` : ''}${SAUTER.size ? ` Écarte : ${[...SAUTER].join(', ')}.` : ''}
Mets en tête les prioritaires : ${PRIORITAIRES.join(', ')}. Sois factuel et COURT par issue (preuve ≤ 300 caractères).${tour > 1 ? `\nUne issue a-faire porte TOUJOURS au moins un sous_lot (sinon elle n'est jamais développée)${aRedecouper.length ? ` — au tour précédent, restées sans sous-lot : ${aRedecouper.map((n) => `#${n}`).join(', ')} : découpe-les` : ''}.` : ''}`,
    { label: `recenser:tour-${tour}`, phase: 'Recenser', model: 'opus', effort: 'high', schema: RECENSEMENT })
  const issues = (recensement && recensement.issues) || []
  issues.filter((i) => i.verdict === 'decision-sans-defaut').forEach((i) => bilan.decisions.add(`#${i.n} ${i.titre || ''}`.trim()))
  issues.filter((i) => i.verdict === 'action-porteur').forEach((i) => bilan.porteur.add(`#${i.n} ${i.titre || ''}`.trim()))
  issues.filter((i) => i.verdict === 'recette-appareil').forEach((i) => bilan.recettes.add(`#${i.n}`))
  const livrees = issues.filter((i) => i.verdict === 'deja-livre')
  const aFaire = issues
    .filter((i) => i.verdict === 'a-faire' && !tenus.has(i.n) && !SAUTER.has(i.n) && (!SEULEMENT.size || SEULEMENT.has(i.n)))
    .sort((a, b) => (PRIORITAIRES.includes(b.n) ? 1 : 0) - (PRIORITAIRES.includes(a.n) ? 1 : 0))
  log(`recensement : ${issues.length} ouvertes — ${aFaire.length} à faire, ${livrees.length} déjà livrées, ${bilan.decisions.size} décisions sans défaut, ${bilan.porteur.size} actions du porteur`)

  if (livrees.length) {
    phase('Clore')
    const c = await agent(`${SOCLE(null)}
TA MISSION — FERMER LES ISSUES DÉJÀ LIVRÉES, avec leur preuve. Pour chacune : relis la preuve (le commit ou la PR est-il bien dans
origin/${BASE} ? \`git -C ${REPO} merge-base --is-ancestor <sha> origin/${BASE}\`) ; si oui, un commentaire de clôture (la preuve, les
dimensions mûres) puis \`gh api -X PATCH repos/${GH}/issues/<n> -f state=closed -f state_reason=completed\` ; sinon laisse-la ouverte.
${livrees.map((i) => `- #${i.n} : ${i.preuve}`).join('\n')}`,
      { label: `clore:tour-${tour}`, phase: 'Clore', model: 'haiku', effort: 'low', schema: CLOTURE })
    if (c) bilan.fermees.push(...c.fermees)
  }

  aRedecouper = aFaire.filter((i) => !(i.sous_lots || []).length).map((i) => i.n)
  if (aRedecouper.length) log(`sans sous-lot, à redécouper au tour suivant : ${aRedecouper.map((n) => `#${n}`).join(', ')}`)
  // Sous-lots du tour : au plus PAR_CHAINE par chaîne, dans l'ordre du recensement (prioritaires d'abord).
  const tous = aFaire.flatMap((i) => (i.sous_lots || []).map((s) => ({ n: i.n, titre: i.titre, sensible: i.sensible, defaut: i.defaut_applique, depend: i.depend || [], chaine: s.chaine, critere: s.critere, inventaire: s.inventaire })))
  const parChaineDuTour = Object.fromEntries(CHAINES.map((c) => [c, tous.filter((l) => l.chaine === c).slice(0, PAR_CHAINE)]))
  const duTour = CHAINES.flatMap((c) => parChaineDuTour[c])
  const reportes = tous.length - duTour.length
  if (!duTour.length) {
    idle += 1
    log(`aucun sous-lot faisable ce tour (inactivité ${idle}/${MAX_IDLE})`)
    if (idle >= MAX_IDLE) break
    continue
  }
  log(`tour ${tour} : ${duTour.length} sous-lots (${CHAINES.map((c) => `${c} : ${parChaineDuTour[c].map((l) => `#${l.n}`).join(' → ') || '—'}`).join(' ‖ ')})${reportes ? ` — ${reportes} reportés au tour suivant` : ''}`)

  // Attente entre chaînes : un client attend le sous-lot serveur de son issue, web/android attendent iOS, chacun attend ses issues amont du tour.
  const fin = {}
  const signal = {}
  duTour.forEach((l) => { fin[nomLot(l)] = new Promise((res) => { signal[nomLot(l)] = res }) })
  const amont = (l) => {
    const memeIssue = l.chaine === 'serveur' ? [] : l.chaine === 'ios' ? [`#${l.n}@serveur`] : [`#${l.n}@serveur`, `#${l.n}@ios`]
    const autres = l.depend.flatMap((d) => [`#${d}@serveur`, `#${d}@${l.chaine}`])
    return [...memeIssue, ...autres].filter((k) => fin[k] && k !== nomLot(l))
  }

  phase('Developper')
  const resultats = (await parallel(CHAINES.map((c) => async () => {
    const faits = []
    for (const l of parChaineDuTour[c]) {
      const deps = amont(l)
      const etats = await Promise.all(deps.map((k) => fin[k]))
      const rates = deps.filter((k, i) => !etats[i] || etats[i].etat !== 'fusionne')
      let r
      if (rates.length) {
        r = { ...l, etat: 'reporte', raison: `amont non fusionné : ${rates.join(', ')}` }
      } else {
        const contrats = etats.filter((e) => e && e.contrat).map((e) => `- ${nomLot(e)} (PR #${e.pr}) : ${e.contrat}`).join('\n')
        const freres = (aFaire.find((i) => i.n === l.n).sous_lots || []).map((s) => `#${l.n}@${s.chaine}`).filter((k) => k !== nomLot(l))
        try { r = await sousLot(l, contrats, freres) } catch (e) { r = { ...l, etat: 'perdu', raison: String(e && e.message ? e.message : e).slice(0, 200) } }
      }
      log(`${nomLot(l)} : ${r.etat}${r.pr ? ` (PR #${r.pr})` : ''}${r.raison ? ` — ${r.raison.slice(0, 140)}` : ''}`)
      signal[nomLot(l)](r)
      faits.push(r)
    }
    return faits
  }))).filter(Boolean).flat()

  const fusionnes = resultats.filter((r) => r.etat === 'fusionne')
  bilan.fusionnes.push(...fusionnes.map((r) => `${nomLot(r)} → PR #${r.pr}`))
  bilan.bloques.push(...resultats.filter((r) => ['bloque', 'pr-rouge', 'perdu'].includes(r.etat)).map((r) => `${nomLot(r)} : ${r.etat}${r.raison ? ` — ${r.raison.slice(0, 160)}` : ''}${r.pr ? ` (PR #${r.pr})` : ''}`))
  idle = fusionnes.length ? 0 : idle + 1
  log(`tour ${tour} : ${fusionnes.length}/${duTour.length} sous-lots fusionnés`)

  if (VALIDER && fusionnes.length) {
    phase('Valider')
    const v = await agent(`${SOCLE('serveur')}
TA MISSION — VALIDER L'INTÉGRATION DE ${BASE} APRÈS LES FUSIONS DU TOUR ${tour} : ${fusionnes.map((r) => `PR #${r.pr} (${nomLot(r)})`).join(', ')}.
Tu ne développes pas : tu MESURES, et chaque régression causée par un lot du chantier devient une issue.
1. \`cd ${WT.serveur} && git fetch origin && git checkout --detach origin/${BASE}\`, shared rebâti ; gates serveur COMPLETS (shared + gateway).
2. Web : \`cd ${WT.web} && git fetch origin && git checkout --detach origin/${BASE}\`, shared rebâti, \`bun test\` COMPLET + type-check dans apps/web.
3. Natif : les runs de la tête de ${BASE} (\`gh api "repos/${GH}/actions/runs?branch=${BASE}&per_page=20"\`) pour android.yml et ios.yml ;
   si aucun ne couvre les fusions du tour, dispatch android.yml et ios.yml sur ${BASE} et attends (surveillance en arrière-plan).
4. Pour chaque rouge : est-il causé par une PR du tour (le test touche-t-il son diff ? était-il vert avant ?) ? Oui ⇒ ouvre une issue
   dans le milestone ${MILESTONE} (titre = le résultat attendu ; corps : le run, l'échec, la PR suspecte, le critère de fin) — elle sera
   recensée au tour suivant. Préexistant ⇒ ne l'ouvre pas, dis-le.
Rends vert, regressions (numéros ouverts), rapport.`,
      { label: `valider:tour-${tour}`, phase: 'Valider', model: 'opus', effort: 'high', schema: VALIDATION })
    if (v) { bilan.regressions.push(...(v.regressions || [])); log(`validation de ${BASE} : ${v.vert ? 'VERTE' : 'ROUGE'}${v.regressions && v.regressions.length ? ` — régressions : ${v.regressions.map((n) => `#${n}`).join(', ')}` : ''}`) }
  }

  if (CONFORMITE && !conformiteFaite && issues.some((i) => i.n === 13942 && i.verdict !== 'deja-livre')) {
    phase('Conformite')
    conformiteFaite = true
    const c = await agent(`${SOCLE('serveur')}
TA MISSION — L'ANALYSE DE CONFORMITÉ DES CERCLES (#13942), préalable à toute production. Une analyse sourcée, pas un avis juridique :
dis ce qui exige un avis signé. Lis d'abord ce qui existe (issues fermées et ouvertes du milestone sur les consentements, l'export, la
purge, la politique de confidentialité, le registre ; docs/conformite/ s'il existe) : complète-le, ne le refais pas.
Branche claude/cercles-13942-conformite depuis origin/${BASE} dans ${WT.serveur}. Écris docs/conformite/2026-11-cercles-et-mode-sang-aipd.md :
AIPD (art. 35) — position continue, historique 30 j, proximité, écoute, talkie hors E2EE, Bring, mineurs (art. 8, AADC), privilège d'équipe ;
base légale par traitement, durées, consentements, politique de confidentialité (diff proposé), exigences des stores (Critical Alerts,
PushToTalk, localisation « Toujours », ACCESS_BACKGROUND_LOCATION, NotificationListenerService). PR vers ${BASE}, fusionnée (c'est un
document), commentaire sur #13942 avec ce qui reste à décider ou à faire signer. Ne ferme #13942 que si rien n'exige d'avis signé.`,
      { label: 'conformite', phase: 'Conformite', model: 'opus', effort: 'high', agentType: 'conformite-juridique' })
    log(`conformité : ${c ? 'rendue' : 'sans rapport'}`)
  }
}

phase('Bilan')
const resume = {
  fusionnes: bilan.fusionnes,
  issues_fermees: [...new Set(bilan.fermees)],
  bloques: bilan.bloques,
  regressions: [...new Set(bilan.regressions)],
  decisions_sans_defaut: [...bilan.decisions],
  actions_porteur: [...bilan.porteur],
  recettes_appareil: [...bilan.recettes],
}
await agent(`${SOCLE(null)}
TA MISSION — POSTER LE BILAN DATÉ DU RUN SUR L'ISSUE CHAPEAU #${CHAPEAU}, mécaniquement, sans rien reformuler d'autre que la mise en forme :
sections « Fusionné » (PR et issues), « Issues fermées », « Bloqué ou rouge » (avec la raison), « Régressions ouvertes », « Décisions
qui attendent le porteur », « Actions du porteur », « Recettes sur appareil à jouer », « Prochaine action » (relancer le workflow
meeshy-cercles-et-sang avec la même attribution : il reprend là où il s'est arrêté). Données :
${JSON.stringify(resume).slice(0, 12000)}`,
  { label: 'bilan', phase: 'Bilan', model: 'haiku', effort: 'low' })

return resume
