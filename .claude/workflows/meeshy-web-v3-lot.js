export const meta = {
  name: 'meeshy-web-v3-lot',
  description: 'Avancer la v3 web d un lot : cadrer, ouvrir les issues, implementer, revue croisee sonnet puis opus, gates, pousser sur dev',
  whenToUse: "Reveille par la routine planifiee « Meeshy web v3 », ou lance a la main pour avancer d'un lot.",
  phases: [
    { title: 'Cadrer', detail: "lire l'ordre calcule, mesurer ce qui est fait, choisir le lot suivant" },
    { title: 'Ouvrir', detail: 'une issue GitHub par ecran, AVANT la premiere ligne de code' },
    { title: 'Implementer', detail: 'un ecran a la fois, en TDD' },
    { title: 'Revue', detail: 'sonnet cherche les defauts, opus attaque la conception' },
    { title: 'Gates', detail: 'tsc, lint, tests, ordre, conformite visuelle, budget' },
    { title: 'Livrer', detail: 'commit, push sur dev, fermeture des issues avec preuve' },
  ],
}

const REPO = '/home/user/meeshy'
const D = `${REPO}/docs/product/MeeshyWebV3Design`

const SOCLE = `
TU TRAVAILLES SUR LA V3 WEB DE MEESHY, dans le monorepo ${REPO}, sur la branche dev.

LIS CECI AVANT TOUT — ce sont les sources de verite, dans cet ordre :
1. ${D}/conception-web-v3.md   la conception ARRETEE : stack, architecture, regle de placement,
                               deploiement, contrat de donnees, cycle de vie invite, reseau degrade,
                               budgets, machine de verification, routine, questions ouvertes.
                               Son ANNEXE porte chaque chiffre avec la commande qui le rejoue.
2. ${D}/ordre.md               l'ordre d'implementation. Il est CALCULE, jamais ecrit a la main.
3. ${D}/matrice.json           la matrice (44 lignes) : lot, priorite, route, audience,
                               depend_de, critere_de_fin, dimensions visees, corps d'issue.
4. ${D}/cible/<vue_id>.png     la capture CIBLE de chaque ecran. C'est la reference visuelle.
5. ${REPO}/CLAUDE.md           TDD non negociable, TypeScript strict sans 'any', immuabilite,
                               budget 800-1100 lignes par fichier, UNE source de verite,
                               Instant App Principles, Prisme Linguistique, treize dimensions.

REGLES DE LA V3, non negociables :
- La v3 vit dans apps/web-v3. apps/web reste VIF et sert le trafic : on n'y touche que si la
  conception le dit explicitement. Aucune suppression dans apps/web hors du lot L8.
- Role PREMIER (P0) : rediriger les liens, lire integralement story/reel/post/humeur, participer
  en ANONYME. Il prime sur tout. Il doit marcher SANS COMPTE et sans JS lourd, sur un telephone
  en 3G.
- Icones : le sprite des 72 glyphes Phosphor (packages/icons). JAMAIS la fonte @phosphor-icons/web,
  JAMAIS lucide-react.
- HTML SEMANTIQUE reel : <header>/<nav>/<main>/<button>/<a>/<dialog>/<details>, pas des <div onClick>.
  La planche n'a QUE des div cliquables — c'est une planche, pas une reference sur ce point.
- Responsive des la base, et .dark / .light / .system sans flash au chargement.
- Conformite = DISPOSITION, HIERARCHIE, ETATS et GESTES. Polices, couleurs et rayons viennent du
  design system Meeshy : l'ecart typographique avec la planche est ASSUME.

CE QUI EST INTERDIT :
- inventer un chiffre de poids ou de version : si tu ne l'as pas mesure, ecris "a mesurer" ;
- ajouter a un fichier deja hors budget (800-1100 lignes) : on extrait d'abord ;
- ecrire une seconde source de verite (jumelle) pour une donnee qui en a deja une ;
- toucher a l'ordre a la main : il se recalcule par ${D}/ordre-des-ecrans.js.
`

phase('Cadrer')
log('Lecture de l ordre calcule et mesure de ce qui est deja fait')

const CADRAGE = {
  type: 'object',
  additionalProperties: false,
  required: ['lot', 'ecrans', 'etat', 'pret'],
  properties: {
    lot: { type: 'string', description: "l'id du lot a traiter, ex L-0.5" },
    lot_titre: { type: 'string' },
    ecrans: {
      type: 'array',
      description: 'les ecrans de CE lot qui restent a faire, dans l ordre calcule',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['vue_id', 'titre_issue', 'route', 'priorite', 'critere_de_fin'],
        properties: {
          vue_id: { type: 'string' },
          titre_issue: { type: 'string' },
          route: { type: 'string' },
          priorite: { type: 'string' },
          critere_de_fin: { type: 'string' },
          corps_issue: { type: 'string' },
        },
      },
    },
    taches_infra: {
      type: 'array',
      description: "pour un lot sans ecran (L-0.5, L0, L8), les taches d'infrastructure a faire",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titre', 'critere_de_fin'],
        properties: { titre: { type: 'string' }, critere_de_fin: { type: 'string' }, detail: { type: 'string' } },
      },
    },
    etat: { type: 'string', description: 'ce qui existe deja, mesure (fichiers, routes, gates qui passent)' },
    pret: { type: 'boolean', description: 'false si un prerequis manque et qu il faut s arreter' },
    blocage: { type: 'string', description: 'si pret=false, ce qui bloque et ce qu il faut du porteur' },
  },
}

const cadrage = await agent(`${SOCLE}

TA MISSION — CADRER le prochain lot. Tu ne modifies AUCUN fichier de production.

1. Lis ${D}/ordre.md et ${D}/matrice.json.
2. MESURE ce qui existe deja : \`ls apps/web-v3\` (le paquet existe-t-il ?), quelles routes sont
   presentes sous apps/web-v3/app/, quels paquets packages/design-tokens et packages/icons
   existent, si \`node ${D}/ordre-des-ecrans.js\` passe, et l'etat de git (\`git log --oneline -15\`,
   \`git status --short\`).
3. Regarde les issues GitHub deja ouvertes pour la v3 (outils mcp__github__, label "web",
   et l'issue epopee #4371) pour ne pas re-ouvrir ce qui existe.
4. CHOISIS LE PREMIER LOT NON TERMINE, dans l'ordre des lots de matrice.json
   (L-0.5, L0, L1, L2, L3, L4, L5, L6, L7, L8). Un lot est termine quand tous ses ecrans
   et toutes ses taches d'infra sont livres ET que ses gates passent.
5. Rends les ecrans de CE lot qui restent, dans l'ordre calcule, PLAFONNES A 4 —
   un lot d'agent est une tranche de travail, pas le lot entier.
   Pour un lot d'infrastructure (aucun ecran), rends plutot taches_infra, plafonnees a 5,
   deduites de \`resultat_attendu\` du lot dans matrice.json et des sections correspondantes
   de la conception.
6. Si un prerequis manque et qu'aucun travail utile n'est possible sans une decision du porteur,
   pose pret=false et dis exactement ce qu'il faut. Ne devine pas.

Sois FACTUEL : 'etat' cite des commandes et leurs sorties, pas des impressions.`,
  { label: 'cadrer:lot', phase: 'Cadrer', schema: CADRAGE, model: 'sonnet', effort: 'high' })

if (!cadrage) return { arret: 'le cadrage n a rien rendu' }
if (!cadrage.pret) {
  log(`ARRET — ${cadrage.blocage}`)
  return { arret: 'prerequis manquant', blocage: cadrage.blocage, etat: cadrage.etat }
}

const travaux = (cadrage.ecrans && cadrage.ecrans.length)
  ? cadrage.ecrans.map(e => ({ cle: e.vue_id, titre: e.titre_issue, critere: e.critere_de_fin, ecran: e }))
  : (cadrage.taches_infra || []).map((t, i) => ({ cle: `infra-${i + 1}`, titre: t.titre, critere: t.critere_de_fin, infra: t }))

if (!travaux.length) {
  log(`Lot ${cadrage.lot} : rien a faire — tout est livre.`)
  return { arret: 'lot deja termine', lot: cadrage.lot, etat: cadrage.etat }
}

log(`Lot ${cadrage.lot} — ${cadrage.lot_titre || ''} : ${travaux.length} travaux`)

phase('Ouvrir')
log('Une issue par travail, AVANT la premiere ligne de code (regle du CLAUDE.md)')

const ISSUES = {
  type: 'object', additionalProperties: false, required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['cle', 'numero'],
        properties: { cle: { type: 'string' }, numero: { type: 'number' }, url: { type: 'string' }, deja_ouverte: { type: 'boolean' } },
      },
    },
  },
}

const ouverture = await agent(`${SOCLE}

TA MISSION — OUVRIR une issue GitHub par travail ci-dessous, dans isopen-io/meeshy,
AVANT que la moindre ligne de code soit ecrite. C'est la regle d'ouverture du CLAUDE.md :
« une tache sans issue n'existe pas ».

D'ABORD, VERIFIE QUE TU PEUX. Charge les outils avec
ToolSearch({query: "select:mcp__github__issue_write,mcp__github__search_issues", max_results: 3}).
L'API REST directe est FERMEE (403) — n'essaie ni curl ni gh.

SI LES OUTILS mcp__github__ NE REPONDENT PAS (une session reveillee par une routine peut
n'avoir aucun connecteur), ne saute PAS la regle en silence et n'invente aucun numero :
1. ecris ou complete ${D}/issues-a-ouvrir.md — une entree par travail, au format exact
   d'une issue (titre semantique, Contexte, Preuve attendue, Critere de fin, source,
   « sous-issue de #4371 », label web), datee, et sans doublon avec ce qui y figure deja ;
2. rends chaque travail avec numero: 0 et deja_ouverte: false ;
3. dis-le en toutes lettres dans ton rendu.
Le travail continue — mais la phase Livrer saura qu'aucune issue n'est a fermer, et le
rapport final le dira au porteur, qui les ouvrira depuis une session connectee.

Pour CHAQUE travail :
- cherche d'abord une issue existante qui le couvre (mcp__github__search_issues) ; si elle existe,
  rends son numero avec deja_ouverte=true et n'en cree pas une seconde ;
- sinon cree-la, en sous-issue de l'epopee #4371 (parametre parent_issue_number: 4371),
  avec le label "web" ET le milestone 74 (parametre milestone: 74) — c'est
  « La v3 web sert le role premier », l'unique milestone de cette epopee ;
  une issue sans milestone n'est pas planifiee (CLAUDE.md) ;
- titre : celui fourni, tel quel — il est SEMANTIQUE (il nomme le resultat attendu) ;
- corps : Contexte (ce qui est casse ou absent aujourd'hui, avec une preuve fichier:ligne),
  Preuve attendue (la commande ou la mesure qui prouvera la fin), Critere de fin (celui fourni,
  in extenso), et la source : le lot, la ligne de matrice.json, la capture cible si l'ecran en a une.
- termine TOUJOURS le corps par une ligne vide, puis --- , puis
  _Generated by [Claude Code](https://claude.ai/code)_

LES TRAVAUX (lot ${cadrage.lot}) :
${travaux.map(t => `- cle=${t.cle} | titre=${t.titre} | critere=${t.critere}${t.ecran ? ` | route=${t.ecran.route} | priorite=${t.ecran.priorite} | cible=${D}/cible/${t.cle}.png` : ''}${t.infra && t.infra.detail ? ` | detail=${t.infra.detail}` : ''}`).join('\n')}`,
  { label: 'ouvrir:issues', phase: 'Ouvrir', schema: ISSUES, model: 'sonnet' })

const numero = new Map(((ouverture && ouverture.issues) || []).map(i => [i.cle, i.numero]))
log(`${numero.size}/${travaux.length} issues connues`)

phase('Implementer')

const REVUE = {
  type: 'object', additionalProperties: false, required: ['verdict', 'defauts'],
  properties: {
    verdict: { type: 'string', enum: ['conforme', 'a-corriger', 'a-refaire'] },
    defauts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['gravite', 'constat', 'preuve', 'correctif'],
        properties: {
          gravite: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] },
          constat: { type: 'string' }, preuve: { type: 'string' }, correctif: { type: 'string' },
        },
      },
    },
    dimensions_mures: { type: 'array', items: { type: 'string' } },
    dimensions_restantes: { type: 'array', items: { type: 'string' } },
  },
}

// Les travaux se font UN A UN : ils partagent le socle (jetons, sprite, layout, lib/realtime)
// et deux agents qui l'editent en parallele produiraient une jumelle, exactement ce que la
// regle de placement interdit. La REVUE, elle, se croise.
const resultats = []
for (const t of travaux) {
  const num = numero.get(t.cle)
  const cible = t.ecran ? `\nLa capture CIBLE de cet ecran est ${D}/cible/${t.cle}.png — REGARDE-LA (outil Read) avant d'ecrire quoi que ce soit. Elle fait foi sur la disposition, la hierarchie, les etats et les gestes.` : ''

  const fait = await agent(`${SOCLE}

TA MISSION — LIVRER ce travail, en TDD, en entier.

TRAVAIL : ${t.titre}
${t.ecran ? `Ecran : ${t.cle} · route ${t.ecran.route} · ${t.ecran.priorite} · audience ${t.ecran.audience || 'voir matrice'}` : `Tache d'infrastructure : ${t.cle}`}
CRITERE DE FIN (il est OBSERVABLE — c'est lui qui dit quand tu as fini) :
${t.critere}
${t.infra && t.infra.detail ? `\nDETAIL : ${t.infra.detail}` : ''}${cible}
${num ? `\nISSUE : #${num}. Ton commit final la fermera (Closes #${num}).` : ''}

METHODE, dans cet ordre :
1. RELIS la section de ${D}/conception-web-v3.md qui couvre ce travail. Elle est detaillee :
   suis-la plutot que d'improviser. Si elle te semble fausse, DIS-LE dans ton rapport — ne
   diverge pas en silence.
2. TDD : ecris le test qui echoue AVANT le code. Teste le COMPORTEMENT par l'API publique,
   jamais l'implementation.
3. Ecris le minimum qui fait passer. TypeScript strict, aucun 'any', donnees immuables,
   pas de commentaire qui paraphrase le code.
4. Fais tourner les verifications que tu peux localement et CORRIGE avant de rendre.
5. Ne commit PAS : la phase Livrer s'en charge apres la revue.

Rends un rapport texte : ce que tu as fait, les fichiers touches, les commandes lancees et leur
sortie, ce que tu n'as PAS fait et pourquoi, et toute contradiction trouvee dans la conception.`,
    { label: `livrer:${t.cle}`, phase: 'Implementer', model: 'opus', effort: 'high' })

  phase('Revue')

  const revueS = await agent(`${SOCLE}

Tu RELIS le travail qui vient d'etre fait, et ta consigne est de LE PRENDRE EN DEFAUT.
Tu ne le reecris pas : tu constates, tu prouves, tu proposes le correctif.

Cherche, dans cet ordre, en LISANT les fichiers (git diff, git status) :
- le critere de fin est-il REELLEMENT atteint ? Rejoue la commande qu'il nomme.
- du 'any', un type assertion non justifie, une donnee mutee ;
- un fichier hors budget (800-1100 lignes) auquel on a ajoute ;
- une JUMELLE : une seconde source de verite pour une donnee qui en avait deja une
  (couleur en dur au lieu d'un jeton, resolution de langue reecrite au lieu de
  resolvePrismTranslation(), second client socket, seconde table de couleurs) ;
- des <div onClick> la ou un <button>/<a>/<dialog>/<details> etait le bon element ;
- un test qui teste l'implementation au lieu du comportement, ou qui ne peut pas echouer ;
- une icone servie autrement que par le sprite ;
- un import de lucide-react ou de @phosphor-icons/web.

TRAVAIL : ${t.titre}
CRITERE DE FIN : ${t.critere}

RAPPORT DE L'IMPLEMENTEUR :
${fait || '(aucun rapport rendu)'}`,
    { label: `revue-1:${t.cle}`, phase: 'Revue', schema: REVUE, model: 'sonnet', effort: 'high' })

  const revueO = await agent(`${SOCLE}

Tu es un ingenieur staff HOSTILE a ce travail. Un premier relecteur a deja cherche les defauts
de surface (ci-dessous) — toi, tu attaques la CONCEPTION et ce qui a ete OUBLIE.

Les questions a poser, sans complaisance :
- Le role PREMIER survit-il ? Cet ecran marche-t-il SANS COMPTE, SANS JS lourd, sur un telephone
  en 3G ? Combien d'octets et de requetes avant le premier pixel utile ?
- Les ETATS manquants : vide, chargement, erreur, hors-ligne, permission refusee, contenu expire.
  Lequel n'est pas dessine ? La planche en montre certains — les a-t-on tous ?
- Le PRISME LINGUISTIQUE : le bon rang est-il elu ? QUI affiche ce qui est elu ? Que transporte-t-on
  A COTE de ce qu'on affiche ? Et ce qu'on sert a-t-il le DROIT d'etre la (contenu protege,
  ephemere, vue unique) ? Ces quatre questions viennent des cycles 121 a 124 du CLAUDE.md.
- L'ACCESSIBILITE : navigable au clavier ? annonce par un lecteur d'ecran ? contrastes AA en clair
  ET en sombre ? cibles 44 px ? Le mode CLAIR a-t-il ete regarde, ou seulement le sombre ?
- Un CONTROLE INERTE : un bouton, un onglet, une puce qui ne change rien quand on clique.
  C'est le defaut le plus frequent de ce depot — cherche-le activement.
- La REGLE DE PLACEMENT du § 3 de la conception : ce fichier est-il au bon endroit ? Un second
  lecteur trancherait-il pareil ?
- Ce que le travail a laisse DERRIERE lui : un champ ajoute en amont et pas relaye, un appelant
  non migre, une jumelle non supprimee.

TRAVAIL : ${t.titre}
CRITERE DE FIN : ${t.critere}

CE QUE LE PREMIER RELECTEUR A TROUVE :
${JSON.stringify(revueS || {}).slice(0, 12000)}

RAPPORT DE L'IMPLEMENTEUR :
${fait || '(aucun rapport rendu)'}`,
    { label: `revue-2:${t.cle}`, phase: 'Revue', schema: REVUE, model: 'opus', effort: 'high' })

  const aCorriger = [...((revueS && revueS.defauts) || []), ...((revueO && revueO.defauts) || [])]
    .filter(d => d.gravite !== 'mineur')

  let correction = null
  if (aCorriger.length) {
    phase('Implementer')
    log(`${t.cle} : ${aCorriger.length} defauts non mineurs a corriger`)
    correction = await agent(`${SOCLE}

TA MISSION — CORRIGER les defauts que la revue croisee a trouves sur « ${t.titre} ».

Tu corriges CHACUN, ou tu dis explicitement pourquoi un constat est FAUX — avec ta preuve.
Un relecteur peut se tromper : ne corrige pas un defaut qui n'existe pas, refute-le.
Chaque correction garde son test.

LES DEFAUTS :
${aCorriger.map((d, i) => `${i + 1}. [${d.gravite}] ${d.constat}\n   preuve: ${d.preuve}\n   correctif propose: ${d.correctif}`).join('\n\n')}

Rends : ce que tu as corrige, ce que tu as refute et pourquoi, les commandes rejouees.`,
      { label: `corriger:${t.cle}`, phase: 'Implementer', model: 'opus', effort: 'high' })
  }

  resultats.push({ cle: t.cle, titre: t.titre, issue: num, fait, revueS, revueO, correction, defauts_traites: aCorriger.length })
}

phase('Gates')
log('tsc, lint, tests, ordre, conformite visuelle, budget — arret au premier rouge')

const GATES = {
  type: 'object', additionalProperties: false, required: ['gates', 'tous_verts'],
  properties: {
    gates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['nom', 'commande', 'resultat'],
        properties: {
          nom: { type: 'string' }, commande: { type: 'string' },
          resultat: { type: 'string', enum: ['vert', 'rouge', 'non-applicable'] },
          sortie: { type: 'string' }, pourquoi_non_applicable: { type: 'string' },
        },
      },
    },
    tous_verts: { type: 'boolean' },
    ce_qui_bloque: { type: 'string' },
  },
}

const gates = await agent(`${SOCLE}

TA MISSION — FAIRE PASSER LES GATES, et CORRIGER ce qui est rouge.

Dans cet ordre, en t'arretant pour corriger des qu'un gate est rouge :
1. \`node ${D}/ordre-des-ecrans.js\`   (rc doit etre 0 ; il regenere ordre.md)
2. type-check strict du paquet touche : \`cd apps/web-v3 && npx tsc --noEmit\`
   (si apps/web-v3 n'existe pas encore, dis non-applicable et passe)
3. lint du paquet touche
4. tests unitaires du paquet touche
5. conformite visuelle : \`node ${D}/compare-rendu.js --base http://127.0.0.1:3300 --vues <les vues de ce lot>\`
   apres avoir demarre le serveur v3 en arriere-plan. Si aucun ecran n'a ete livre dans ce lot,
   non-applicable.
6. budget d'octets : la commande decrite au § 8 de la conception.

REGLES :
- Un gate rouge se CORRIGE, il ne se contourne pas. Ne desactive JAMAIS un test, ne baisse JAMAIS
  un seuil pour passer. Si un seuil est vraiment mal calibre, dis-le dans 'ce_qui_bloque' et
  laisse le gate rouge.
- Un gate qui ne s'applique pas encore (le paquet n'existe pas) est 'non-applicable', pas 'vert'.
  Dis pourquoi. Ne mens jamais sur un gate.
- Rends la SORTIE reelle de chaque commande, tronquee, jamais un resume.

TRAVAUX DE CE LOT : ${travaux.map(t => t.cle).join(', ')}`,
  { label: 'gates', phase: 'Gates', schema: GATES, model: 'sonnet', effort: 'high' })

phase('Livrer')

const livraison = await agent(`${SOCLE}

TA MISSION — LIVRER le lot ${cadrage.lot}.

ETAT DES GATES :
${JSON.stringify(gates || {}, null, 1).slice(0, 8000)}

SI UN GATE EST ROUGE : ne pousse RIEN. Commit quand meme le travail sur dev n'est PAS autorise.
Rends un rapport disant ce qui est rouge et ce qu'il faut. C'est tout.

SI TOUS LES GATES SONT VERTS OU NON-APPLICABLES :
1. \`git status --short\` puis \`git diff --stat\` : regarde ce que tu t'appretes a commiter.
   Retire du commit tout artefact genere (rendu/, rapport-conformite.json, .next/, node_modules/).
2. Commit. Le message suit la forme du depot : un titre en francais qui dit le RESULTAT
   (pas la tache), puis un corps qui explique CE QUI ETAIT CASSE et POURQUOI la correction
   prend cette forme. Ferme les issues : une ligne \`Closes #<n>\` par issue livree.
   N'ecris JAMAIS de nom de modele dans un message de commit.
3. \`git push -u origin dev\`. En cas d'echec RESEAU seulement, reessaie 4 fois avec une
   attente croissante (2s, 4s, 8s, 16s). En cas de rejet non-reseau, arrete-toi et dis-le.
4. Pour chaque issue livree DONT TU CONNAIS LE NUMERO (non nul), poste un commentaire de
   cloture : la preuve (commit, gate, mesure), les dimensions MURES et celles qui RESTENT —
   et ouvre une issue par dimension non mure, comme l'exige le CLAUDE.md. Termine chaque
   commentaire par une ligne vide, --- , puis
   _Generated by [Claude Code](https://claude.ai/code)_
   Si les outils mcp__github__ ne repondent pas, ou si un numero vaut 0, n'ecris AUCUN
   « Closes #0 » dans le message de commit : consigne plutot ce qui aurait ete ferme dans
   ${D}/issues-a-ouvrir.md, et DIS dans ton rapport que la tracabilite GitHub de ce lot
   reste a faire par le porteur. Ne presente jamais un lot comme trace s'il ne l'est pas.

TRAVAUX ET LEURS ISSUES :
${resultats.map(r => `- ${r.cle} (#${r.issue || '?'}) : ${r.titre} — ${r.defauts_traites} defauts traites en revue`).join('\n')}`,
  { label: 'livrer:lot', phase: 'Livrer', model: 'opus', effort: 'high' })

return {
  lot: cadrage.lot,
  lot_titre: cadrage.lot_titre,
  travaux: resultats.map(r => ({ cle: r.cle, titre: r.titre, issue: r.issue, defauts_traites: r.defauts_traites })),
  gates,
  livraison,
}
