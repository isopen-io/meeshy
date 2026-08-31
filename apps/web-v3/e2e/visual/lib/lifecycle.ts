// LA LOI DU GATE DE CYCLE DE VIE DE LA V3 — § 8.5 de docs/product/MeeshyWebV3Design/conception-web-v3.md :
// « 0 requête pendant que l'onglet est `hidden` ; 1 seule requête de battement pour N onglets sur
// 10 min », et la ligne anti-régression du § 6.5 : « `visibilitychange:hidden` seul ⇒ ZÉRO requête
// mutante (assertion sur le journal réseau) ».
//
// Elle vit dans un MODULE et non dans le spec, pour la raison que le § 9.2 donne déjà à la mesure
// de poids réseau et que `lib/a11y.ts` a payée avant elle : ce qui est écrit dans un `.spec.ts`
// n'est vérifiable que par Playwright, donc jamais par le harnais unitaire — et un gate dont le
// verdict n'est gagé par rien est un gate qu'on croit sur parole. `v3-lifecycle.spec.ts` n'est que
// la main qui l'applique au navigateur ; `__tests__/lifecycle-gate.test.ts` la gage sans lui.
//
// CE MODULE N'EST PAS `lib/realtime/lifecycle.ts`. Celui-là — le site UNIQUE des écouteurs DOM de
// l'application (§ 6.2) — arrive avec le lot L0/L2. Celui-ci est l'INSTRUMENT qui le mesurera :
// il ne s'abonne à rien, il lit un journal réseau déjà pris.

// Une entrée de journal réseau : ce que le navigateur a ÉMIS, et QUAND. L'instant retenu est celui
// de l'ÉMISSION, jamais celui de la réponse : une requête partie avant l'occultation et qui atterrit
// pendant n'est pas une fuite, c'est un vol en cours.
export type EntreeDeJournal = {
  readonly methode: string;
  readonly url: string;
  readonly emiseA: number;
};

// `fin: null` = l'onglet est encore caché au moment du verdict. La fenêtre reste ouverte plutôt
// que de se refermer sur l'instant de la mesure : refermer laisserait sortir tout ce qui part
// APRÈS l'observation, c'est-à-dire exactement ce qu'un onglet en arrière-plan a le temps de faire.
export type FenetreCachee = {
  readonly debut: number;
  readonly fin: number | null;
};

export const METHODES_MUTANTES = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

const MUTANTES: readonly string[] = METHODES_MUTANTES;

export const estMutante = (entree: EntreeDeJournal): boolean =>
  MUTANTES.includes(entree.methode.toUpperCase());

// Borne GAUCHE incluse, borne DROITE exclue. Ce n'est pas un détail d'arithmétique : la reprise
// du § 6.2 — `reconnectAttempts = 0`, `connect()`, `refresh`, `GET /sync` — part à l'instant même
// du retour. Une borne droite incluse ferait tomber le gate sur le comportement qu'il EXIGE.
export const emisePendant = (
  entree: EntreeDeJournal,
  fenetres: readonly FenetreCachee[],
): boolean =>
  fenetres.some(
    (fenetre) =>
      entree.emiseA >= fenetre.debut && (fenetre.fin === null || entree.emiseA < fenetre.fin),
  );

// DEUX BARRES, PAS UNE. Le § 8.5 gate ZÉRO requête — un onglet caché ne coûte rien à personne, ni
// batterie ni données ; le § 6.5 gate ZÉRO requête MUTANTE — un onglet caché ne DÉTRUIT rien,
// c'est le fond de la décision du § 6.2 (« le navigateur n'appelle JAMAIS `leave` »). Les fondre
// en une fonction ferait passer une préchargeuse de fond pour une fuite d'écriture, et le rapport
// ne dirait plus laquelle des deux lignes vient de tomber.
export const requetesPendantOngletCache = ({
  journal,
  fenetres,
}: {
  readonly journal: readonly EntreeDeJournal[];
  readonly fenetres: readonly FenetreCachee[];
}): readonly EntreeDeJournal[] => journal.filter((entree) => emisePendant(entree, fenetres));

export const mutationsPendantOngletCache = ({
  journal,
  fenetres,
}: {
  readonly journal: readonly EntreeDeJournal[];
  readonly fenetres: readonly FenetreCachee[];
}): readonly EntreeDeJournal[] => requetesPendantOngletCache({ journal, fenetres }).filter(estMutante);

const depuisLeDebut = (entree: EntreeDeJournal, fenetres: readonly FenetreCachee[]): string => {
  const fenetre = fenetres.find((candidate) => emisePendant(entree, [candidate]));
  return fenetre === undefined ? '?' : String(entree.emiseA - fenetre.debut);
};

export const rapporteRequetesInterdites = (
  titre: string,
  entrees: readonly EntreeDeJournal[],
  fenetres: readonly FenetreCachee[],
): string =>
  [
    `${entrees.length} requête(s) émise(s) pendant que l'onglet était caché — ${titre} :`,
    ...entrees.map(
      (entree) =>
        `  • ${entree.methode.toUpperCase()} ${entree.url} (+${depuisLeDebut(entree, fenetres)} ms après le passage à hidden)`,
    ),
  ].join('\n');

// LE BATTEMENT — « 1 seule requête de battement pour N onglets sur 10 min » (§ 8.5).
//
// Le nombre à opposer n'est PAS le littéral de cette phrase. La période du battement est de
// 5 minutes (§ 5, tableau du contrat de données : « Battement 5 min, suspendu à hidden, porté par
// UN SEUL onglet » ; § 6.4 : « N = 10 min par défaut, soit deux battements manqués ») : sur une
// fenêtre de 10 minutes, un porteur unique en émet DEUX. Le « 1 seule » du § 8.5 et du cas E porte
// sur le RAPPORT — un battement, pas N — jamais sur un compte absolu. Un gate qui opposerait le
// littéral rougirait sur une v3 conforme, ce qui est la pire des deux erreurs possibles.
export const BATTEMENT = {
  periodeMs: 5 * 60_000,
  fenetreDeRecetteMs: 10 * 60_000,
  chemin: '/anonymous/refresh',
} as const;

export const estBattement = (entree: EntreeDeJournal): boolean =>
  entree.url.includes(BATTEMENT.chemin);

// L'HORLOGE VIRTUELLE SE PAUSE, ELLE NE S'INSTALLE PAS SEULEMENT.
//
// `page.clock.install()` seul laisse le temps COULER — c'est voulu, pour qu'une page se charge
// normalement — et le compte de battements redevient alors dépendant de la machine (mesuré : 2, 3
// puis 7 tours pour la même fenêtre). Le temps ne se fige qu'à `pauseAt`, qu'on ne peut appeler
// qu'APRÈS le chargement, donc à un instant virtuel qu'on ne connaît pas exactement.
//
// Cette marge est ce qui rend le compte déterministe malgré cette ignorance. Elle doit être :
//   — plus GRANDE que tout chargement réel, sinon la pause remonterait le temps ;
//   — strictement plus PETITE que la période du battement, sinon la page aurait déjà battu avant
//     même que la fenêtre d'observation ne s'ouvre.
// Sous ces deux bornes, un porteur unique émet exactement `plafondDeBattements` tours sur la
// fenêtre de recette, quel que soit le temps qu'a coûté le chargement.
export const MARGE_DE_CHARGEMENT_MS = 60_000;

export const INSTANT_DE_DEPART = Date.UTC(2026, 7, 30, 8, 0, 0);

export const plafondDeBattements = ({
  dureeMs,
  periodeMs,
}: {
  readonly dureeMs: number;
  readonly periodeMs: number;
}): number => Math.floor(dureeMs / periodeMs);

export type VerdictDeBattement = {
  readonly conforme: boolean;
  readonly observes: number;
  readonly plafond: number;
  readonly raison: string | null;
};

export const verdictDeBattement = ({
  battements,
  onglets,
  dureeMs,
  periodeMs,
}: {
  readonly battements: number;
  readonly onglets: number;
  readonly dureeMs: number;
  readonly periodeMs: number;
}): VerdictDeBattement => {
  const plafond = plafondDeBattements({ dureeMs, periodeMs });
  // Un gate de battement VERT PAR ABSENCE ne prouve rien : il rendrait le même verdict sur une v3
  // dont le battement ne part jamais, c'est-à-dire sur un bail que le serveur libère sous les
  // pieds de l'invité (§ 6.4). L'instrument doit d'abord prouver qu'il VOIT (leçon 345).
  if (battements === 0) {
    return {
      conforme: false,
      observes: 0,
      plafond,
      raison: `aucun battement observé sur ${onglets} onglet(s) : le porteur n'a pas battu, ou l'instrument ne l'a pas vu`,
    };
  }
  return battements <= plafond
    ? { conforme: true, observes: battements, plafond, raison: null }
    : {
        conforme: false,
        observes: battements,
        plafond,
        // DEUX causes possibles, et la mesure ne sait pas laquelle : N onglets qui battent chacun
        // pour soi (l'élection a échoué) ou UN porteur qui bat trop souvent (la période est
        // fausse). N'en nommer qu'une ferait lire au lecteur du rapport un diagnostic que le gate
        // ne porte pas — et l'enverrait chercher un second onglet qui n'existe pas.
        raison: `${battements} battements observés pour ${onglets} onglet(s) là où un porteur unique en émet ${plafond} sur la fenêtre de recette : soit chaque onglet bat pour soi, soit le porteur bat trop souvent`,
      };
};

// LA RECETTE DU § 6.5, et l'état RÉEL de sa couverture.
//
// Les six cas C→H avaient besoin d'un ÉCRAN pour avoir un sujet : ils l'ont depuis `thread`
// (L2, matrice ordre 5, issue #4524) — une conversation anonyme, un lien, un jeton, un cookie et
// le serveur `next start` que la production lance. La table dit désormais où CHAQUE cas est joué,
// et le témoin de `__tests__/lifecycle-gate.test.ts` interdit qu'un cas y reste sans sujet.
//
// UN ÉNONCÉ, UN FAIT — et c'est ce qui manquait. Un `statut` se pose sur une LIGNE, pas sur une
// phrase : tant que le cas H disait « zéro leave observé ; la place se libère après N minutes »
// en une seule ligne, la moitié assertée portait la moitié qui ne l'est par rien, et
// `casAPorter()` — qui vérifie qu'un statut est POSÉ, jamais qu'il couvre l'énoncé entier —
// rendait vert. Les énoncés qui portaient deux faits sont donc SCINDÉS (H / H-bail,
// D / D-lacune / D-hasGap), et ce qu'aucun sujet web ne peut produire porte l'issue hors-web qui
// le bloque (`bloqueParHorsWeb`) plutôt qu'un statut d'écran.
//
// Les scénarios FABRIQUÉS ci-dessous ne disparaissent pas pour autant, et ce n'est pas de la
// conservation : un gate d'absence qui n'a jamais vu de présence ne prouve rien, et l'écran
// conforme ne peut pas jouer ce rôle-là — par construction, il ne fuit pas. Ils restent les
// témoins de CONTRÔLE de l'instrument.
export type StatutDeCas = 'écran' | 'fabriqué' | 'à porter';

export type CasDeRecette = {
  readonly id: string;
  readonly enonce: string;
  /**
   * Où le cas a son SUJET aujourd'hui : `écran` (l'écran réel le joue),
   * `fabriqué` (seul un sujet fabriqué l'exerce), `à porter` (aucun sujet).
   */
  readonly statut: StatutDeCas;
  readonly porteurAttendu: string;
  /**
   * L'issue HORS-WEB sans laquelle le cas n'a AUCUN sujet possible — `null`
   * quand rien ne le bloque.
   *
   * Ce champ existe parce que la table a menti. Le cas H portait UN énoncé pour
   * DEUX faits — « zéro `POST /anonymous/leave` » et « la place se libère après
   * N minutes » — sous un seul `statut: 'écran'` : la première moitié est
   * assertée (`appels(chaine, '/anonymous/leave') === 0`), la seconde ne l'est
   * par RIEN et ne peut pas l'être, le balayage temporel qui libère un bail
   * anonyme n'existant pas côté passerelle (grep `isActive.*false` sur
   * `services/gateway/src` : seul `POST /anonymous/leave` et la purge 24 h de
   * `MaintenanceService`, aucun balayage sur battement manqué). L'issue #4524
   * le déclare elle-même : « Bloqué par (hors web) — `gw:bail-anonyme` ».
   *
   * `casAPorter()` ne pouvait pas l'attraper : il vérifie qu'un statut est
   * POSÉ, jamais que le sujet couvre l'énoncé ENTIER. La correction n'est donc
   * pas un test de plus — c'est la SCISSION de l'énoncé, un fait par ligne,
   * pour qu'un fait sans assertion cesse d'être porté par la couverture de son
   * voisin.
   */
  readonly bloqueParHorsWeb: string | null;
};

const SUR_L_ECRAN =
  'v3-lifecycle.spec.ts — « la recette du cycle de vie, jouée sur l’écran thread »';

export const CAS_DE_RECETTE: readonly CasDeRecette[] = [
  {
    id: 'C',
    enonce:
      "basculer d'application 10 min puis revenir ⇒ conversation ouverte, aucune modale, aucun re-join, et le premier message reçu pendant l'absence apparaît",
    statut: 'écran',
    porteurAttendu: SUR_L_ECRAN,
    bloqueParHorsWeb: null,
  },
  {
    /**
     * LE CAS QUE LA RECETTE N'AVAIT PAS, et qui est le comportement NOMINAL du
     * titre du lot : quelqu'un qui LIT. Le cas C ne rattrape que parce que le
     * test masque puis réaffiche l'onglet ; un onglet resté visible, dont le
     * réseau ne tombe pas et dont on ne touche pas le composeur, n'affichait
     * RIEN de neuf, indéfiniment.
     */
    id: 'C-visible',
    enonce:
      'un onglet VISIBLE, jamais masqué, dont on ne touche pas le composeur ⇒ un message arrivé côté serveur apparaît quand même (le battement rattrape)',
    statut: 'écran',
    porteurAttendu: SUR_L_ECRAN,
    bloqueParHorsWeb: null,
  },
  {
    id: 'D',
    enonce:
      'couper le réseau 5 min, envoyer 2 messages hors-ligne, revenir ⇒ les 2 partent dans l’ordre et le jeton est le même',
    statut: 'écran',
    porteurAttendu: SUR_L_ECRAN,
    bloqueParHorsWeb: null,
  },
  {
    /**
     * Le séparateur du § 7 a DEUX déclencheurs possibles, et un seul est
     * atteignable par un invité. Celui-ci — une fenêtre de rattrapage que la
     * passerelle n'a pas COUVERTE (`hasMore` / `truncated`, checkpoint tenu à
     * `since`) — l'est, et c'est lui que l'écran peint.
     */
    id: 'D-lacune',
    enonce:
      'une fenêtre de rattrapage que la passerelle ne couvre pas (truncated + nextCursor épuisés) ⇒ le séparateur « des messages manquent ici » est peint',
    statut: 'écran',
    porteurAttendu: SUR_L_ECRAN,
    bloqueParHorsWeb: null,
  },
  {
    /**
     * L'AUTRE déclencheur, et il est MORT pour l'unique audience de l'écran.
     * `hasGap = seq !== undefined && seq < checkpointSeq - GAP_THRESHOLD`
     * (`routes/sync/index.ts`), et `checkpointSeq` vaut 0 EN DUR pour une
     * identité anonyme (« Une session anonyme n'a pas de curseur à lire » —
     * `UserEventSeq` est indexée par `User.id`) avec `GAP_THRESHOLD = 10_000` :
     * il faudrait `seq < -10000` là où le schéma borne `seq` à `nonnegative`.
     * Aucun bouchon ne peut prouver ce cas : le poser à la main ne prouverait
     * que la lecture d'un drapeau que la production ne lèvera jamais.
     */
    id: 'D-hasGap',
    enonce:
      'hasGap (le gap de SÉQUENCE de /sync) peint son séparateur pour une session anonyme',
    statut: 'à porter',
    porteurAttendu:
      'aucun — le sujet n’existe pas côté web tant qu’une session anonyme n’a pas de curseur de séquence',
    bloqueParHorsWeb:
      'gw:seq-anonyme — donner un curseur de séquence aux sessions anonymes (`checkpointSeq` vaut 0 en dur, `seq` n’est jamais envoyé) ; sous-issue hors-web de #4524',
  },
  {
    id: 'E',
    enonce:
      'deux onglets sur le même lien ⇒ une seule requête de battement observée sur la fenêtre de recette',
    statut: 'écran',
    porteurAttendu:
      'v3-lifecycle.spec.ts — « deux onglets, un seul porteur » (écran réel), les scénarios fabriqués en restant les témoins de contrôle',
    bloqueParHorsWeb: null,
  },
  {
    /**
     * L'AUTRE moitié de l'énoncé du cas E, elle aussi longtemps portée par la
     * couverture de sa voisine : le test ne fermait AUCUN onglet. Un porteur qui
     * meurt sans successeur laisse le bail sans preuve de présence — c'est le
     * même défaut que H-bail, vu du côté client.
     */
    id: 'E-survie',
    enonce: 'fermer l’onglet PORTEUR ⇒ le survivant reprend le battement sans intervention',
    statut: 'écran',
    porteurAttendu: 'v3-lifecycle.spec.ts — « deux onglets, un seul porteur » (écran réel)',
    bloqueParHorsWeb: null,
  },
  {
    id: 'F',
    enonce:
      'forcer isActive:false en base ⇒ bandeau + bouton, la lecture reste, AUCUN POST /anonymous/join observé sans clic',
    statut: 'écran',
    porteurAttendu: SUR_L_ECRAN,
    bloqueParHorsWeb: null,
  },
  {
    id: 'G',
    enonce:
      'désactiver le lien pendant la lecture ⇒ composeur fermé avec sa raison, contenu lu conservé, file annulée et visible',
    statut: 'écran',
    porteurAttendu: SUR_L_ECRAN,
    bloqueParHorsWeb: null,
  },
  {
    id: 'H',
    enonce: 'fermer l’onglet ⇒ zéro POST /anonymous/leave observé',
    statut: 'écran',
    porteurAttendu: SUR_L_ECRAN,
    bloqueParHorsWeb: null,
  },
  {
    /**
     * L'AUTRE MOITIÉ de l'ancien énoncé du cas H, et elle n'a aucun sujet.
     * Le bail est le MÉCANISME sur lequel toute la décision « le navigateur
     * n'appelle jamais leave » repose (§ 6.2, § 6.4) : tant que le balayage
     * n'existe pas, une place fermée par un onglet tué reste occupée POUR
     * TOUJOURS, et le compteur d'admission du lien s'épuise. Le dire ici est
     * la seule façon que la table ne l'annonce pas comme couvert.
     */
    id: 'H-bail',
    enonce: 'la place se libère après N minutes sans battement (le bail serveur du § 6.4)',
    statut: 'à porter',
    porteurAttendu:
      'aucun — le web ne peut pas produire ce sujet : la libération est une transition SERVEUR',
    bloqueParHorsWeb:
      'gw:bail-anonyme — balayage compare-and-set (`updateMany({where:{id,isActive:true}})`, décrément si le compte rendu vaut 1, plancher à 0), N = 10 min par défaut ; nommé « Bloqué par (hors web) » dans l’issue #4524 elle-même',
  },
  {
    id: 'anti-régression',
    enonce:
      'visibilitychange:hidden seul ⇒ ZÉRO requête mutante, assertion sur le journal réseau (§ 6.5)',
    statut: 'écran',
    porteurAttendu:
      'v3-lifecycle.spec.ts — « un onglet caché ne fait RIEN partir » (écran réel), et les quatre scénarios fabriqués de ce module',
    bloqueParHorsWeb: null,
  },
];

/**
 * Les cas SANS SUJET ET SANS EXCUSE — ceux qu'un fichier de la v3 devrait
 * jouer et que personne ne joue. C'est cette liste qui doit rester vide.
 *
 * Elle ne compte PAS les cas bloqués hors-web : un gate rouge en permanence
 * n'est plus un gate, il devient le bruit qu'on apprend à ignorer. Ils sont
 * comptés par `casBloquesHorsWeb()`, que le spec oppose au lecteur du rapport
 * — la couverture qu'on ne peut pas produire se DÉCLARE, elle ne se tait pas.
 */
export const casAPorter = (): readonly CasDeRecette[] =>
  CAS_DE_RECETTE.filter((cas) => cas.statut === 'à porter' && cas.bloqueParHorsWeb === null);

export const casBloquesHorsWeb = (): readonly CasDeRecette[] =>
  CAS_DE_RECETTE.filter((cas) => cas.bloqueParHorsWeb !== null);

// LE SCÉNARIO FABRIQUÉ — le sujet sans lequel l'instrument ne peut pas se prouver.
//
// Aucun écran de la v3 ne tient encore de session invitée : opposer ce gate au dépôt tel qu'il est
// rendrait un vert de VACUITÉ, exactement le défaut que l'issue #4442 corrige. Le gate se prouve
// donc sur une page qu'il fabrique lui-même, aux DEUX faces : celle qui viole le § 6.2 — il doit
// TOMBER — et la même corrigée — il doit PASSER.
//
// Cette page n'est PAS l'implémentation de la v3 et n'a pas vocation à le devenir : l'élection du
// porteur y est réduite au strict nécessaire (le plus grand identifiant l'emporte) là où le § 6.2
// élit « le dernier onglet passé visible ». Le jour où `lib/realtime/lifecycle.ts` existe, c'est
// LUI que le spec ouvre, et ce scénario reste comme témoin de contrôle de l'instrument.
// QUATRE LOIS, PAS DEUX — et une par sujet défectueux. Le type portait deux booléens dont le
// premier, `suspendQuandCache`, en confondait deux : « ne mute pas dans le gestionnaire `hidden` »
// et « arrête sa minuterie de battement ». La page ne réalisait que le premier sens ; la SEULE
// fuite qu'un scénario savait produire était donc celle qu'il émettait SYNCHRONEMENT dans le
// gestionnaire — et l'instrument, taillé à la forme de son unique sujet, ne pouvait rien voir
// d'autre. Séparer les deux sens fait apparaître le sujet manquant (`SCENARIO_QUI_NE_SUSPEND_PAS`)
// que la barre « 0 requête pendant hidden » du § 8.5 n'avait jamais eu à faire rougir.
export type ScenarioFabrique = {
  readonly suspendLeBattementQuandCache: boolean;
  readonly muteSurHidden: boolean;
  readonly elitUnPorteur: boolean;
  readonly periodeDeBattementMs: number;
};

export const SCENARIO_CONFORME: ScenarioFabrique = {
  suspendLeBattementQuandCache: true,
  muteSurHidden: false,
  elitUnPorteur: true,
  periodeDeBattementMs: BATTEMENT.periodeMs,
};

// Chaque sujet défectueux est le scénario conforme MOINS UNE loi. Un sujet qui en enfreindrait deux
// rendrait le gate incapable de dire laquelle vient de tomber : le rouge serait juste et le rapport
// muet. `loisEnfreintes` est ce qui oppose cette règle, et `SCENARIOS_DEFECTUEUX` ce qui empêche
// qu'un cinquième sujet arrive sans témoin.
export const SCENARIO_QUI_MUTE_CACHE: ScenarioFabrique = {
  ...SCENARIO_CONFORME,
  muteSurHidden: true,
};

export const SCENARIO_QUI_NE_SUSPEND_PAS: ScenarioFabrique = {
  ...SCENARIO_CONFORME,
  suspendLeBattementQuandCache: false,
};

export const SCENARIO_QUI_BAT_PAR_ONGLET: ScenarioFabrique = {
  ...SCENARIO_CONFORME,
  elitUnPorteur: false,
};

// Un porteur UNIQUE qui bat cinq fois trop vite : sur la fenêtre de recette il émet dix battements
// là où le plafond en autorise deux. Sans ce sujet, le seul discriminant du gate serait l'ÉLECTION
// (1 porteur contre N), jamais le RAPPORT que le § 8.5 énonce.
export const SCENARIO_QUI_BAT_TROP_SOUVENT: ScenarioFabrique = {
  ...SCENARIO_CONFORME,
  periodeDeBattementMs: BATTEMENT.periodeMs / 5,
};

export const SCENARIOS_DEFECTUEUX: readonly ScenarioFabrique[] = [
  SCENARIO_QUI_MUTE_CACHE,
  SCENARIO_QUI_NE_SUSPEND_PAS,
  SCENARIO_QUI_BAT_PAR_ONGLET,
  SCENARIO_QUI_BAT_TROP_SOUVENT,
];

export const loisEnfreintes = (scenario: ScenarioFabrique): readonly string[] =>
  (Object.keys(SCENARIO_CONFORME) as readonly (keyof ScenarioFabrique)[]).filter(
    (loi) => scenario[loi] !== SCENARIO_CONFORME[loi],
  );

// Un préfixe qu'aucun motif de `budgets.json` ne réclame et qu'aucune route de la v3 n'émet : le
// scénario est servi par l'interception de Playwright, jamais par le serveur, et ne peut donc pas
// se confondre avec un écran mesuré.
export const CHEMIN_DU_SCENARIO = '/__gate-cycle-de-vie';

export const CHEMIN_DE_LA_PAGE_FABRIQUEE = `${CHEMIN_DU_SCENARIO}/scenario`;

export const CHEMIN_DU_BATTEMENT_FABRIQUE = `${CHEMIN_DU_SCENARIO}${BATTEMENT.chemin}`;

export const CHEMIN_DE_LA_FUITE_FABRIQUEE = `${CHEMIN_DU_SCENARIO}/anonymous/leave`;

// Ce que la page expose au spec : son ÉTAT d'élection, et rien d'autre.
//
// Le battement était APPELÉ (`__gateTic`), au motif qu'« un `setInterval` rendrait le compte de
// battements dépendant de l'horloge de la machine ». Le motif est juste pour l'horloge MACHINE et
// faux pour une horloge VIRTUELLE : `page.clock` fige le temps de la page et ne l'avance que sur
// ordre, donc un `setInterval` fait exactement `floor(durée / période)` tours, sans qu'aucune
// seconde réelle ne s'écoule. Le prix payé par l'appel était double, et c'est lui qui a fabriqué
// les deux défauts que ce lot corrige : aucun scénario ne pouvait fuir AUTREMENT que dans le
// gestionnaire `visibilitychange`, et le nombre de battements devenait une ENTRÉE du spec au lieu
// d'être une CONSÉQUENCE de la période.
export type FenetreFabriquee = {
  readonly __gatePorteur: () => boolean;
};

const election = (): string => `
  var MOI = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  var elu = MOI;
  var canal = new BroadcastChannel('meeshy-guest');
  var retiens = function (id) { if (id > elu) { elu = id; } };
  canal.onmessage = function (evt) {
    var d = evt.data;
    if (!d || typeof d.id !== 'string') return;
    if (d.type === 'bonjour') canal.postMessage({ type: 'moi', id: MOI });
    retiens(d.id);
  };
  canal.postMessage({ type: 'bonjour', id: MOI });
  var porteur = function () { return elu === MOI; };`;

// CE QUE LE GESTIONNAIRE `hidden` FAIT, loi par loi — exporté parce que c'est LÀ que la première
// ligne du § 6.2 se tient ou se perd, et qu'un témoin doit pouvoir le lire sans naviguer. Le corps
// est une liste d'instructions, jamais un texte indenté : ce qui compte est ce que la page FAIT,
// pas la colonne où elle l'écrit. L'ordre compte pour le lecteur d'un rapport rouge — la mutation
// part AVANT l'arrêt, comme partirait un `leave` posé en tête de gestionnaire.
export const instructionsSurHidden = (scenario: ScenarioFabrique): readonly string[] => [
  ...(scenario.muteSurHidden ? [`mute('${CHEMIN_DE_LA_FUITE_FABRIQUEE}');`] : []),
  ...(scenario.suspendLeBattementQuandCache ? ['arrete();'] : []),
  'return;',
];

const surHidden = (scenario: ScenarioFabrique): string =>
  instructionsSurHidden(scenario)
    .map((instruction) => `      ${instruction}`)
    .join('\n');

export const pageFabriquee = (scenario: ScenarioFabrique): string => `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Scénario fabriqué — cycle de vie v3</title></head>
<body>
<main id="main-content"><h1>Scénario fabriqué — cycle de vie</h1></main>
<script>
(function () {
  var mute = function (chemin) {
    fetch(chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .catch(function () {});
  };
${scenario.elitUnPorteur ? election() : '  var porteur = function () { return true; };'}
  var minuterie = null;
  var bat = function () { if (porteur()) mute('${CHEMIN_DU_BATTEMENT_FABRIQUE}'); };
  var demarre = function () {
    if (minuterie === null) minuterie = setInterval(bat, ${scenario.periodeDeBattementMs});
  };
  var arrete = function () {
    if (minuterie !== null) { clearInterval(minuterie); minuterie = null; }
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
${surHidden(scenario)}
    }
    demarre();
    bat();
  });
  demarre();
  window.__gatePorteur = porteur;
})();
</script>
</body>
</html>`;
