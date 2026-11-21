import * as fs from 'fs';
import * as path from 'path';
import { DELIBERATELY_WIDE, MEASURED_FAMILIES, MEASURED_NOT_INSTRUCTED } from './audience-law-inventories';

/**
 * Les deux inventaires sont RÉ-EXPORTÉS : leurs témoins les lisent depuis ce
 * module, qui reste la porte d'entrée du cliquet. Le découpage de #20100 est
 * une affaire de BUDGET et de responsabilité, pas de surface publique.
 */
export { DELIBERATELY_WIDE, MEASURED_FAMILIES, MEASURED_NOT_INSTRUCTED };

/**
 * Les AUDIENCES de diffusion d'une conversation lisent-elles l'appartenance
 * VIVANTE, ou `isActive` NU ? (#16690)
 *
 * Toute PORTE D'ACCÈS du dépôt exige `PARTICIPATION_VIVANTE` — `isActive: true`
 * **et** `bannedAt` nul ou absent : la jonction aux rooms
 * (`AuthHandler`), le refus de jonction (`ConversationHandler`), le contrôle
 * d'accès REST (`access-control`), l'admission des lecteurs de fichier
 * (`fileReaderAdmission`). Les DIFFUSEURS, eux, se construisaient sur
 * `isActive: true` nu — si bien que la porte et la diffusion n'avaient pas la
 * même définition de « membre ».
 *
 * Une ligne `isActive: true, bannedAt ≠ null` existe en base : bannir pendant
 * qu'une ligne est inactive n'écrit que `bannedAt`
 * (`conversationBanState.ts`), et `restore-for-me` rallumait `isActive`
 * avant #10436. Le dépôt NOMME cette conséquence
 * (`routes/user-deletions.ts`) : « rendait la ligne active ET bannie, lue comme
 * vivante par toute lecture `userId + isActive: true` ». Le producteur est
 * fermé ; la migration qui reprendrait les lignes existantes existe (#16690,
 * `packages/shared/prisma/migrations/2026-11-07-participant-active-and-banned.mongodb.js`)
 * et n'a été exécutée nulle part.
 *
 * Une telle ligne n'est PAS dans `conversation:<id>`, mais sa room `user:<id>`
 * est rejointe INCONDITIONNELLEMENT (`AuthHandler.ts:392`) — c'est par là que
 * les accusés, la pastille et le rejeu hors ligne l'atteignaient.
 *
 * ## LA DISTINCTION QUI DÉCIDE DU SENS DU CORRECTIF
 *
 * Elle est la raison d'être de ce balayage, et l'ignorer OUVRE une fuite au
 * lieu d'en fermer une :
 *
 * | l'ensemble répond à | l'appliquer veut dire | la loi |
 * |---|---|---|
 * | **qui REÇOIT** (audience) | servir | la plus ÉTROITE — `PARTICIPATION_VIVANTE` |
 * | **qui ne doit RIEN recevoir** (exclusion) | taire | la plus LARGE — `isActive` nu |
 *
 * `translationReaders` porte les DEUX dans un seul `Promise.all` : la lecture
 * lawful (`scanLiveParticipants`) construit `rooms` (qui reçoit la traduction),
 * la lecture NUE (`scanActiveParticipants`, bornée depuis #20050) construit
 * `excludedQueueKeys` (qui ne doit rien recevoir, pas même en file). Resserrer
 * la seconde retirerait le membre banni de la liste d'EXCLUSION — il
 * recevrait donc la traduction par la file hors ligne. **Une liste de refus se
 * construit sur le sur-ensemble ; c'est le seul sens où elle échoue fermée.**
 *
 * D'où un inventaire de refus qui n'est pas une dette : c'est une DÉCISION,
 * et chaque entrée porte sa raison.
 */

/**
 * Les façons d'ÉPELER la loi dans un `where`.
 *
 * `ADMITTED_FILE_READER_WHERE` y figure parce qu'il EST
 * `PARTICIPATION_VIVANTE` — une seule définition, un nom qui dit l'usage — et
 * **le balayage ne lui fait confiance que parce qu'un second témoin prouve
 * l'identité** (`fileReaderAdmission` § « l'alias est la loi »). Sans cette
 * preuve, accepter un second nom serait exactement la jumelle que ce cliquet
 * existe pour empêcher.
 */
const LAW_SPELLINGS = ['PARTICIPATION_VIVANTE', 'ADMITTED_FILE_READER_WHERE'] as const;

/**
 * ⚠️ CE CLIQUET, SEUL, CERTIFIE L'ORTHOGRAPHE QUI ÉTEINT LA FEATURE (#20111).
 *
 * `guardsAgainstBan` admet `bannedAt: null` comme la loi, et c'est une décision
 * écrite (`captureNoticeVisibility.ts` l'épelle ainsi). Mais sur MongoDB cette
 * égalité n'apparie PAS la clé absente — donc elle exclut l'immense majorité de
 * la population, qui n'a jamais été bannie. Mesuré : remplacer
 * `...PARTICIPATION_VIVANTE` par `isActive: true, bannedAt: null` sur les trois
 * sélecteurs de l'agent laisse **les 36 témoins de ces cliquets VERTS**, et ce
 * sont les témoins de COMPORTEMENT du paquet agent qui l'attrapent (5 rouges
 * sur 7).
 *
 * > La phrase que ce dépôt répète — « un témoin qui compare la clause reçue à
 * > celle qu'il attend ne vérifie que sa propre copie » — vaut **aussi de ce
 * > cliquet-ci**. Il garde qu'une clause PARLE du bannissement ; il ne peut pas
 * > garder qu'elle apparie la bonne population. Cela se garde par un double qui
 * > ÉVALUE le `where` contre des documents nus, chez le consommateur.
 */


/**
 * Les clés de PREMIER NIVEAU d'un `where`, avec leur valeur telle qu'écrite.
 *
 * Les deux discriminants de ce fichier lisaient le TEXTE ENTIER par expression
 * régulière, et l'audit adversarial de #20100 a mesuré ce que ça leur coûtait,
 * dans les deux sens :
 *
 * - `spellsTheLaw` certifiait `{ isActive: true, NOT: { bannedAt: null } }` —
 *   une audience composée EXCLUSIVEMENT de bannis — et
 *   `{ isActive: true, OR: [{ bannedAt: null }, { role: 'creator' }] }`, où un
 *   créateur banni passe. Le MOT `bannedAt: null` était là ; sa POLARITÉ et sa
 *   PORTÉE ne l'étaient pas. C'est le défaut que #20091 disait avoir fermé,
 *   rejoué sous deux autres orthographes.
 * - `namesAParticularMember` prenait `idempotencyKey:` pour une clé `id` (pas de
 *   frontière de mot), et ne reconnaissait pas `{ notIn: … }`, `NOT: { userId }`
 *   ni un curseur de pagination `id: { gt: … }` — chacun faisant passer une
 *   AUDIENCE ENTIÈRE pour une porte, donc disparaître du relevé **sans trace**.
 *
 * > **Une expression régulière sur un `where` ne lit pas une clause, elle lit
 * > une chaîne.** La portée (à quel niveau ?) et la polarité (dans quel sens ?)
 * > sont les deux choses qu'elle ne peut pas voir, et ce sont exactement les
 * > deux qui décident du verdict.
 */
function topLevelPairs(where: string): ReadonlyArray<{ readonly key: string; readonly value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];
  let depth = 0;
  let keyStart = 0;
  let key: string | null = null;
  let valueStart = 0;
  for (let i = 0; i < where.length; i += 1) {
    const char = where[i];
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') depth -= 1;
    else if (char === ':' && depth === 0 && key === null) {
      key = where.slice(keyStart, i).trim();
      valueStart = i + 1;
    } else if (char === ',' && depth === 0) {
      if (key !== null) pairs.push({ key, value: where.slice(valueStart, i).trim() });
      key = null;
      keyStart = i + 1;
    }
  }
  if (key !== null) pairs.push({ key, value: where.slice(valueStart).trim() });
  return pairs;
}

/**
 * La garde de bannissement, reconnue par une LISTE BLANCHE de formes, et c'est
 * un choix de sens d'erreur : une orthographe valide mais non prévue sera
 * comptée NUE — une relecture de trop — là où la reconnaissance par mot-clé
 * certifiait des clauses qui ANNULENT la loi. Le fichier le dit déjà de son
 * autre discriminant : « un cliquet qui sur-signale coûte une relecture ; un
 * cliquet qui se trompe sur un site juste coûte sa crédibilité ».
 *
 * Les quatre formes admises, toutes au PREMIER niveau du `where` :
 * `bannedAt: null`, `bannedAt: { isSet: false }`, `...unsetOrNull('bannedAt')`,
 * et l'`OR` que `unsetOrNull` produit — dont **chaque** branche doit contraindre
 * `bannedAt`, sans quoi l'autre branche est une porte de sortie.
 */
function guardsAgainstBan(where: string): boolean {
  if (/\.{3}\s*unsetOrNull\(\s*['"`]bannedAt['"`]\s*\)/.test(where)) return true;
  for (const { key, value } of topLevelPairs(where)) {
    if (key === 'bannedAt') {
      if (/^null$/.test(value) || /^\{\s*isSet:\s*false\s*\}$/.test(value)) return true;
      continue;
    }
    if (key !== 'OR') continue;
    const branches = value.replace(/^\[/, '').replace(/\]$/, '').split(/\}\s*,/).map((branch) => branch.trim());
    if (branches.length > 1 && branches.every((branch) => /\bbannedAt\b/.test(branch))) return true;
  }
  return false;
}

/**
 * Ce `where` ÉPELLE-t-il la loi ?
 *
 * Par une des constantes ci-dessus — ou **à la main**, ce que le doc-comment du
 * balayage de bornes (`live-audience-bound-sweep.ts`) annonçait comme sa
 * quatrième forme sans que personne la mesure : `isActive: true` SUIVI de la
 * garde de bannissement, qu'elle s'écrive `unsetOrNull('bannedAt')` ou en
 * clair. `captureNoticeVisibility.ts` est ce cas, et le compter parmi les
 * audiences nues aurait envoyé réparer un site conforme — **un cliquet qui
 * sur-signale coûte une relecture ; un cliquet qui se trompe sur un site juste
 * coûte sa crédibilité, et avec elle les constats voisins.**
 *
 * La garde de bannissement, et RIEN d'autre, fait la différence : `isActive`
 * seul n'est pas la loi, c'est son sur-ensemble.
 */
export function spellsTheLawForAudit(where: string): boolean {
  return spellsTheLaw(where);
}

function spellsTheLaw(where: string): boolean {
  if (LAW_SPELLINGS.some((spelling) => where.includes(spelling))) return true;
  if (!/isActive:\s*true/.test(where)) return false;
  // La POLARITÉ, jamais le MOT. Le premier jet rendait `true` sur
  // `/bannedAt/` nu — l'audit adversarial a mesuré le faux VERT qu'il
  // autorisait : `{ conversationId, isActive: true, bannedAt: { not: null } }`,
  // soit une audience composée EXCLUSIVEMENT de bannis, était déclarée
  // conforme à la loi qui existe pour les exclure. Un cliquet qui se trompe
  // dans le sens rassurant est pire que pas de cliquet.
  return guardsAgainstBan(where);
}

/** Une audience relevée par le balayage. */
export type AudienceSite = {
  readonly file: string;
  readonly line: number;
  /** Le `where` tel qu'il est écrit, commentaires dépouillés et espaces réduits. */
  readonly where: string;
  readonly usesLaw: boolean;
};

/**
 * Une lecture de `Participant` que le balayage n'a pas pu JUGER, et pourquoi.
 *
 * ── POURQUOI LA PUBLIER AU LIEU DE LA SAUTER (#20091) ────────────────────────
 *
 * Le discriminant est TEXTUEL : il lit le littéral du `where`. Quand ce `where`
 * est une VARIABLE (`where: others`), un APPEL (`where: presenceSnapshotContactsWhere(…)`)
 * ou un TERNAIRE, il n'y a pas de littéral à lire — et l'ancien balayage
 * passait au suivant sans rien dire.
 *
 * > **« Zéro trouvé » et « zéro existe » ne sont pas la même affirmation.** Un
 * > balayage qui écarte ce qu'il ne sait pas résoudre doit PUBLIER ce qu'il
 * > écarte, et quelqu'un doit l'ouvrir — sans quoi le chiffre qu'il publie se
 * > lit comme une propriété du dépôt alors qu'il n'est qu'une propriété de
 * > l'instrument (cycle 164, leçon 261).
 *
 * Ce n'est pas théorique : `ensureGlobalConversationMembership` servait
 * l'arrivée dans le salon GLOBAL depuis un `where: others` — une variable —
 * donc sur `isActive` NU, invisible aux deux balayages du dépôt. Il a été
 * trouvé en comptant ce que l'instrument ne savait pas juger, pas en cherchant
 * un défaut.
 */
export type UnjudgeableRead = {
  readonly file: string;
  readonly line: number;
  readonly method: string;
  /**
   * Ce qui tient la place du littéral : `variable`, `appel`, `ternaire`,
   * `absent`, ou `portée-indirecte` — un `where` littéral dont le
   * `conversationId` vient d'un spread, donc dont on ne sait pas dire s'il
   * désigne une conversation.
   */
  readonly form: string;
};

/**
 * LA PORTÉE DU BALAYAGE — `src/` ENTIER, et c'est #20091.
 *
 * Elle valait `path.resolve(__dirname, '..')`, soit `src/socketio/`. Le cliquet
 * était vert, et affirmait d'un dépôt ce qu'il mesurait d'un répertoire.
 *
 * **Les comptes vivent dans un TÉMOIN, pas ici** (`audience-law-scope.test.ts`,
 * § « la distribution mesurée »). Le premier jet de ce lot les avait écrits en
 * prose — « 51 au dehors, dont 50 nues » — et l'audit adversarial a mesuré
 * qu'ils ne correspondaient plus : le lot avait ÉLARGI le discriminant dans le
 * même mouvement, si bien que le chiffre d'avant et le chiffre d'après ne
 * comptent pas la même chose. Un compte est une AFFIRMATION (cycle 93) ; écrit
 * dans un commentaire il ne peut pas rougir, et il dérive au premier
 * élargissement de l'instrument qui le produit.
 *
 * > Une énumération porte DEUX affirmations (leçon 261) : « ces sites
 * > respectent la règle » — vérifiable, et vérifiée — et « ce sont les sites
 * > où la règle s'applique », qui ne l'était pas. Ici la seconde n'était même
 * > pas une liste : c'était un CHEMIN, donc une affirmation qu'on ne relit
 * > jamais, puisqu'elle ne ressemble pas à un inventaire. Une audience de
 * > diffusion ne vit pas dans un répertoire — elle vit partout où quelque
 * > chose part vers des membres : `routes/`, `services/`, `utils/` autant que
 * > `socketio/`.
 *
 * Conséquence de forme : les clés d'inventaire portent désormais leur chemin
 * depuis `src/` (`socketio/handlers/StatusHandler.ts#0`, et non
 * `handlers/StatusHandler.ts#0`). Une clé qui ne désigne plus rien fait
 * tomber le témoin « ne garde aucun refus périmé » — c'est voulu : un refus
 * qui ne désigne plus de site autorise en silence le site futur qui
 * reprendrait sa clé.
 */
const AUDIENCE_ROOT = path.resolve(__dirname, '..', '..');

/**
 * ET LA PORTÉE A BOUGÉ UNE SECONDE FOIS — de `services/gateway` à
 * `services/` (#20111).
 *
 * #20091 a déplacé la portée de `src/socketio/` à `src/` ENTIER, et son
 * doc-comment ci-dessus dit pourquoi : une portée est une AFFIRMATION, et
 * c'est celle que personne ne relit, parce qu'elle ne ressemble pas à un
 * inventaire — c'est un `path.resolve`. **Elle a bougé d'un répertoire, pas
 * d'un PAQUET**, et `services/agent` lit `Participant` lui aussi : ses trois
 * sélecteurs de membres DORMANTS portaient `isActive` NU, hors de toute vue.
 *
 * Le site était DOUBLEMENT masqué — hors de la racine, **et** derrière le
 * `notIn` que le discriminant d'identité prenait pour la désignation d'une
 * personne (corrigé par #20100, mais hors de sa portée).
 *
 * ── CE QUE LA PORTÉE LAISSE DEHORS, ET POURQUOI ─────────────────────────────
 *
 * Nommé ici plutôt que déduit d'un chemin, puisque c'est tout l'objet du lot :
 *
 * | paquet | lit `Participant` ? | dans la portée ? |
 * |---|---|---|
 * | `services/gateway/src` | oui, partout | **oui** |
 * | `services/agent/src` | oui — les sélecteurs de dormants | **oui** (#20111) |
 * | `services/translator` | non — Python, aucun client Prisma | non |
 * | `packages/shared` | il DÉCLARE la loi et les types, n'interroge rien | non |
 * | `apps/*` | non — aucun client Prisma instancié | non |
 * | `scripts/` | **OUI** — 6 lectures dans 4 fichiers | non, et sa raison est autre |
 *
 * `services/translator`, `packages/shared` et `apps/*` n'ont **aucune lecture à
 * garder**. **`scripts/` en a**, et sa ligne a dû être réécrite : le premier jet
 * de cette table y avait écrit « aucun accès base », ce qui est FAUX —
 * `mesure-succession-plafonds.ts:83` porte `{ conversationId, isActive: true,
 * role: { in: [...] } }`, c'est-à-dire exactement le discriminant de ce
 * balayage. Sa raison de sortie est **« hors CI, aucune surface servie, aucune
 * de ces lectures ne décide d'une autorisation »** : des outils de migration et
 * de mesure qu'un humain lance à la main.
 *
 * > **Une racine EXCLUE porte une raison, et la raison est une affirmation
 * > comme les autres.** Elle doit être fausse pour être remarquée, et celle-là
 * > l'était — dans le lot même qui fait de l'exclusion « vérifiable » sa
 * > leçon. Le remède n'est pas d'entrer la racine : la bonne raison existait,
 * > elle n'avait pas été cherchée.
 *
 * Le jour où une racine exclue acquiert une lecture qui DÉCIDE, c'est cette
 * table qu'il faut relire — et le témoin `audience-law-scope.test.ts` § « la
 * portée couvre les paquets qui lisent `Participant` » rougit si une racine
 * déclarée disparaît.
 *
 * ── POURQUOI LE PRÉFIXE DE LA PASSERELLE EST VIDE ───────────────────────────
 *
 * La clé d'inventaire d'un site est `<préfixe><chemin>#<rang>`. Celui de la
 * passerelle est VIDE — l'orthographe historique — et celui de l'agent porte
 * son nom de paquet. L'asymétrie est un choix, et il se mesure : repréfixer la
 * passerelle reclasserait **89 clés d'inventaire** pour aucun signal
 * supplémentaire, et un inventaire recopié à la main est l'endroit où une
 * ligne se perd. Ce qu'une clé doit garantir est qu'elle désigne EXACTEMENT un
 * fichier, et un préfixe `@meeshy/agent/` ne peut par construction collisionner
 * avec aucun chemin relatif de la passerelle (aucun ne commence par `@`).
 *
 * **Une racine déclarée et ABSENTE du disque JETTE.** Un balayage qui saute en
 * silence une racine qu'il annonce est exactement la portée fausse que ce
 * paragraphe existe pour empêcher — « un inventaire vide et un balayage
 * aveugle sont le même vert ».
 */
const AUDIENCE_ROOTS: ReadonlyArray<{ readonly prefix: string; readonly dir: string }> = [
  { prefix: '', dir: AUDIENCE_ROOT },
  { prefix: '@meeshy/agent/', dir: path.resolve(AUDIENCE_ROOT, '..', '..', 'agent', 'src') },
];

/**
 * Une racine déclarée et ABSENTE du disque JETTE — extraite pour être
 * TESTABLE (#20111, constat B7 de l'audit adversarial).
 *
 * Elle vivait en ligne dans la boucle de balayage, et la mutation qui la
 * remplaçait par un `continue` laissait les 36 témoins VERTS : la propriété
 * était tenue par son voisin (« chacune EXISTE sur le disque »), jamais par un
 * rouge à elle. **Une ceinture sans témoin se lit comme la garde** — son
 * doc-comment l'annonçait comme telle — et c'est exactement ce que ce fichier
 * reproche ailleurs à une portée écrite en commentaire.
 */
export function assertRootExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    throw new Error(`balayage des audiences: racine déclarée ABSENTE — ${dir}. Une portée qui rétrécit en silence est le défaut de #20091.`);
  }
}

/** Les racines déclarées, pour le témoin de portée — qui les veut toutes présentes. */
export const AUDIENCE_SCOPE = AUDIENCE_ROOTS.map(({ prefix, dir }) => ({ prefix, dir }));

/**
 * Dépouille les commentaires en PRÉSERVANT le compte de lignes : un numéro de
 * ligne calculé sur une source raccourcie désigne la mauvaise ligne, et un
 * cliquet qui pointe à côté se lit comme un cliquet qui se trompe.
 */
export function stripComments(source: string): string {
  const keepLines = (block: string): string => '\n'.repeat((block.match(/\n/g) ?? []).length);
  return source
    .replace(/\/\*[\s\S]*?\*\//g, keepLines)
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Ce `where` DÉSIGNE-t-il un membre en particulier ?
 *
 * Si oui, c'est une PORTE (« ce lecteur-ci appartient-il ? »), pas une
 * audience : elle relève d'`access-control` et de ses propres gardes, et la
 * faire entrer ici mesurerait la popularité d'un motif au lieu d'une propriété
 * (cycle 107, balayage JETÉ plutôt que gelé).
 *
 * **`userId: { not: null }` ne désigne PERSONNE**, et c'est la correction qui
 * compte : c'est un filtre de NULLITÉ — « garder les membres qui ont un
 * compte » — sur une audience de tout le salon. Le premier discriminant, un
 * `\buserId\b` nu, écartait ainsi en silence trois audiences réelles (frappe,
 * appel manqué, pont d'agent). Un balayage qui OMET est plus coûteux qu'un
 * balayage qui sur-signale : seul le premier est silencieux.
 */
export function namesAParticularMember(where: string): boolean {
  for (const { key, value } of identityLevelPairs(where)) {
    if (key !== 'id' && key !== 'userId') continue;
    if (value === '') return true;
    if (!NAMES_NOBODY.test(value)) return true;
  }
  // Raccourci (`userId,`) ⇒ la variable homonyme NOMME une personne. Il n'a pas
  // de `:`, donc aucune paire ne le porte — et sa FRONTIÈRE DE MOT est ce qui
  // manquait : sans elle, `idempotencyKey:` et `userIdsExcluded:` tiraient cette
  // branche et faisaient disparaître la lecture entière du relevé.
  return /(?:^|[,{]\s*)(?:userId|id)\s*(?=[,}]|$)/.test(where);
}

/**
 * Toutes les paires du MÊME NIVEAU LOGIQUE qu'un `where`, les combinateurs
 * traversés.
 *
 * `AND`, `OR` et un étalement de parenthèses (`...(cond ? { id } : {})`) ne
 * changent pas le niveau d'une clause : ils l'habillent. Sans les traverser, le
 * discriminant d'identité ne voyait pas l'idiome le plus courant du dépôt pour
 * désigner UN lecteur sous ses deux colonnes —
 * `OR: [{ id: clé }, { userId: clé }]`, que `services/gateway/CLAUDE.md`
 * prescrit — et rangeait donc cinq PORTES parmi les audiences.
 *
 * `NOT` n'est PAS traversé : ce qu'il nomme est ce qui ne sera pas servi.
 *
 * La traversée s'arrête aux combinateurs. Elle n'entre pas dans un filtre de
 * RELATION (`conversation: { participants: { some: { userId } } }`) : un
 * `userId` là-dedans ne désigne pas le membre lu, il désigne une conversation —
 * et l'y lire transformerait une audience en porte, l'erreur exactement
 * inverse.
 */
function identityLevelPairs(where: string): ReadonlyArray<{ readonly key: string; readonly value: string }> {
  const collected: Array<{ key: string; value: string }> = [];
  for (const { key, value } of topLevelPairs(where)) {
    if (key === 'NOT') continue;
    if (key === 'AND' || key === 'OR') {
      for (const branch of braceBlocks(value)) collected.push(...identityLevelPairs(branch));
      continue;
    }
    if (key.startsWith('...')) {
      for (const branch of braceBlocks(value)) collected.push(...identityLevelPairs(branch));
      continue;
    }
    collected.push({ key, value });
  }
  // Un étalement de parenthèses est une paire SANS `:` — `topLevelPairs` ne le
  // rend donc pas, et ses branches se lisent ici.
  for (const spread of where.match(/\.{3}\s*\([\s\S]*?\)(?=\s*[,}]|\s*$)/g) ?? []) {
    for (const branch of braceBlocks(spread)) collected.push(...identityLevelPairs(branch));
  }
  return collected;
}

/** Les corps d'objet `{ … }` d'un texte, accolades ÉQUILIBRÉES, sans les accolades. */
function braceBlocks(source: string): readonly string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        blocks.push(source.slice(start, i));
        start = -1;
      }
    }
  }
  return blocks;
}

/**
 * Les valeurs de clé d'identité qui ne SÉLECTIONNENT personne : les formes
 * NÉGATIVES et les formes de PLAGE.
 *
 * Le premier discriminant n'admettait que `{ not: null }`, la NULLITÉ. L'audit
 * de #20100 a mesuré ce que les autres orthographes cachaient : `{ notIn: … }`
 * (le complément d'une liste de membres servie), `{ not: { in: … } }`,
 * et surtout `{ gt: curseur }` — **une pagination keyset faisait passer une
 * audience entière pour une porte.** Cinq lectures de production disparaissaient
 * ainsi du relevé, dont l'éventail de « X a rejoint » (`memberAdmission`) et le
 * ROSTER de synchronisation delta servi à tout client.
 */
const NAMES_NOBODY = /^\{\s*(?:not|notIn|gt|gte|lt|lte)\s*:[\s\S]*\}$/;

/**
 * Cette clause imbriquée parle-t-elle de PARTICIPATION — donc le relevé sait-il
 * même de quel MODÈLE elle vient ?
 *
 * Le schéma ne porte que DEUX relations nommées `participants` :
 * `Conversation.participants: Participant[]` et
 * `CallSession.participants: CallParticipant[]`. La seconde n'a **ni
 * `isActive` ni `bannedAt`** — c'est la mesure, pas une impression, et
 * `audience-law-nested-scope.test.ts` § « le modèle » la relit dans
 * `schema.prisma` pour que l'ajout d'une colonne ou d'une troisième relation
 * rougisse ici.
 *
 * Une clause qui ne nomme aucune des deux colonnes ne peut donc pas être
 * rattachée à un modèle par le texte, et le premier jet de ce lot l'a payé : il
 * rangeait les deux lectures de `CallCleanupService`
 * (`{ OR: [{ leftAt: null }, { leftAt: { isSet: false } }] }`, des participants
 * d'APPEL) parmi les audiences NUES d'une conversation. Le signal était faux et
 * il envoyait réparer une clause qui n'a rien à voir avec le bannissement.
 *
 * > **Un balayage qui change de forme d'appel change aussi de PREUVE DE
 * > MODÈLE.** La forme appelée la portait gratuitement — `participant.findMany`
 * > NOMME la table. La forme imbriquée ne nomme qu'une RELATION, et deux
 * > modèles la partagent.
 *
 * La garde ne s'applique pas à la forme APPELÉE : `participant.<méthode>` dit
 * la table, et un `where` qui ne porte aucune clause d'activité y est une
 * audience réellement NON BORNÉE — plus large qu'`isActive` nu, donc à voir.
 */
function speaksOfParticipation(where: string): boolean {
  // Une épellation de la loi compte comme une colonne : `PARTICIPATION_VIVANTE`
  // est typée `Prisma.ParticipantWhereInput`, donc elle ne se compile que sur la
  // bonne relation — alors qu'elle ne NOMME aucune colonne dans le texte. Le
  // premier jet l'oubliait, et c'est le pire défaut que ce lot pouvait avoir :
  // il publiait en « modèle indécidable » l'audience qu'il venait de
  // RESSERRER, si bien que l'inventaire se rééquilibrait et que tout paraissait
  // vert — **un site corrigé disparaissait du relevé au lieu d'y passer au
  // VERT**. Un cliquet qui se trompe dans le sens rassurant est pire que pas de
  // cliquet (#20091).
  if (LAW_SPELLINGS.some((spelling) => where.includes(spelling))) return true;
  return /\bisActive\b/.test(where) || /\bbannedAt\b/.test(where);
}

/**
 * Ce `where` tient-il sa clause d'un APPEL étalé, que le balayage ne sait pas
 * lire ?
 *
 * `{ conversationId, ...callerParticipantWhere(caller) }` a toute l'apparence
 * d'une audience — portée écrite, aucune identité visible — et c'en est le
 * CONTRAIRE : l'appel porte la clé du membre. Le discriminant d'identité est
 * TEXTUEL ; devant un appel il ne peut rien conclure, et conclure quand même
 * rendait un verdict d'AUDIENCE sur une PORTE (`messagePinAdmission`,
 * `call-participants`).
 *
 * > C'est le constat I2 de #20091 vu par son autre bout : le lot y avait publié
 * > la portée indirecte (`{ ...SCOPE, isActive: true }`) et laissé la CLÉ
 * > indirecte se faire juger. Les deux formes ont la même cause — un étalement
 * > illisible — et seule la seconde produit un faux verdict plutôt qu'un
 * > silence.
 *
 * **Un APPEL, jamais un identifiant**, et ce n'est pas une commodité : nommer
 * un membre en particulier exige une valeur d'EXÉCUTION, qu'une constante de
 * module ne peut pas porter. `...NOT_YET_ACCEPTED` et `[...narrowing]` restent
 * donc jugés — le premier jet publiait les deux formes, et il a fallu mesurer
 * ce qu'il faisait disparaître : **trois décisions déjà instruites**, reclassées
 * en « je ne sais pas » par le lot même qui prétend mieux voir.
 */
function keyedByAnUnreadableCall(where: string): boolean {
  const calls = where.match(/\.{3}\s*([A-Za-z_$][\w$.]*)\s*\(/g) ?? [];
  return calls.some((spread) => {
    const name = (spread.match(/[A-Za-z_$][\w$.]*/) ?? [''])[0];
    return !NEGATIVE_WHERE_HELPERS.includes(name);
  });
}

/**
 * Les fabriques de clause du dépôt qui ne peuvent PAS nommer un membre, parce
 * qu'elles ne produisent qu'un refus : `unsetOrNull(f)` rend
 * `{ OR: [{ f: null }, { f: { isSet: false } }] }`, `differsOrUnset(f, v)` rend
 * `{ OR: [{ NOT: { f: v } }, { f: { isSet: false } }] }`
 * (`utils/prisma-unset.ts`).
 *
 * C'est la MÊME règle que celle du `{ not: … }` ci-dessus, prise un niveau
 * d'écriture plus haut : **aucune forme négative ne SÉLECTIONNE quelqu'un**, et
 * `differsOrUnset('userId', arrival.userId)` — « tout le monde SAUF l'arrivant »
 * — est une audience, pas une porte. La ranger avec les clés aurait reclassé
 * l'éventail d'arrivée de #20051 en « je ne sais pas », perdant une famille
 * déjà instruite.
 */
const NEGATIVE_WHERE_HELPERS = ['unsetOrNull', 'differsOrUnset'] as const satisfies readonly string[];

/**
 * Le corps d'un bloc, accolades INCLUSES, depuis son accolade ouvrante — ce que
 * `callArguments` fait pour un appel, sans la parenthèse à franchir.
 */
export function balancedBlock(source: string, openIndex: number): string | null {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return null;
}

/**
 * Le corps du `where`, accolades ÉQUILIBRÉES.
 *
 * Un `[^}]*` s'arrête à la PREMIÈRE accolade fermante — donc à l'intérieur du
 * premier objet imbriqué (`conversationId: { in: [...] }`), et tout ce qui
 * suit dans le `where` devient invisible. Le cliquet a d'abord signalé ainsi
 * un site parfaitement conforme ; il aurait TU, de la même façon, un site nu
 * dont le `where` porte un objet imbriqué avant `isActive`. **Un balayage qui
 * tronque se trompe dans les deux sens, et seul le sens rassurant est
 * silencieux.**
 */
export function balancedObjectBody(source: string, openIndex: number): string | null {
  let depth = 1;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i).split(/\s+/).join(' ').trim();
    }
  }
  return null;
}

/**
 * Relève les `participant.findMany`/`count` dont le `where` porte
 * `conversationId` SANS identité particulière — c'est-à-dire « tous les
 * membres de cette conversation », la forme d'une audience de diffusion.
 *
 * Une requête keyée sur `id:` ou `userId:` est une PORTE (« ce lecteur-ci
 * appartient-il ? »), pas une audience : elle relève d'`access-control` et de
 * ses propres gardes, et la faire entrer ici mesurerait la popularité d'un
 * motif au lieu d'une propriété (cycle 107, balayage JETÉ).
 */
/**
 * Le bloc d'ARGUMENTS d'un appel, accolades équilibrées — depuis l'accolade
 * ouvrante qui suit la parenthèse.
 */
export function callArguments(source: string, parenIndex: number): string | null {
  const open = source.indexOf('{', parenIndex);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/** Ce qui tient la place du littéral, quand `where:` n'ouvre pas d'accolade. */
export function unreadableForm(afterWhere: string): string {
  const head = afterWhere.trimStart();
  if (head.startsWith('{')) return '';
  if (/^[A-Za-z_$][\w$.]*\s*\(/.test(head)) return 'appel';
  if (/^[A-Za-z_$][\w$.]*\s*[?]/.test(head)) return 'ternaire';
  if (/^[A-Za-z_$][\w$.]*/.test(head)) return 'variable';
  return 'ternaire';
}

/**
 * Un `where` qui est une VARIABLE, résolu si le fichier la DÉCLARE lui-même.
 *
 * C'est l'élargissement qu'a exigé le premier correctif de #20091 :
 * `ensureGlobalConversationMembership` sert l'arrivée dans le salon GLOBAL
 * depuis `where: others`, et sa clause a été resserrée **sans qu'aucun cliquet
 * puisse le garder** — mesuré, pas supposé : la mutation inverse laissait le
 * témoin VERT. Un correctif sans témoin est un correctif qui se perdra.
 *
 * La résolution est volontairement ÉTROITE — un `const` du MÊME fichier, jamais
 * un import, un paramètre ni un appel : le balayage doit rester capable de dire
 * « je n'ai pas pu juger » (`UnjudgeableRead`), et une résolution qui devine
 * fabriquerait des verdicts au lieu d'en publier l'absence. Même discipline que
 * `response-payload-mismatch`, qui résout la variable que le gestionnaire
 * compose sous ses propres yeux et se tait sur tout le reste.
 */
export function resolveLocalWhere(source: string, name: string): string | null {
  // `$` est un métacaractère : un identifiant qui en porte un composerait une
  // expression régulière qui ne cherche pas ce qu'on croit.
  const escaped = name.replace(/[$]/g, '\\$&');
  const declaration = new RegExp(`\\bconst\\s+${escaped}\\s*(?::[^=]*)?=\\s*\\{`, 'g');
  const first = declaration.exec(source);
  if (first === null) return null;
  // HOMONYME ⇒ on ne résout PAS. Deux fonctions du même fichier peuvent
  // déclarer `const others = { … }` ; prendre la PREMIÈRE déclarerait conforme
  // un site qui ne l'est pas, et ce faux VERT est le seul verdict que ce
  // balayage n'a pas le droit de rendre. Un site non résolu se publie comme
  // illisible — « je n'ai pas conclu » est une réponse, « il est conforme »
  // n'en est pas une quand on a deviné.
  if (declaration.exec(source) !== null) return null;
  return balancedObjectBody(source, first.index + first[0].length);
}

/**
 * Les lectures de `Participant` que le balayage a vues passer sans pouvoir les
 * juger — `where` non littéral, ou absent. Voir `UnjudgeableRead`.
 */
export function sweepUnjudgeableParticipantReads(): UnjudgeableRead[] {
  return walkParticipantReads().unjudgeable;
}

/**
 * Relève les `participant.findMany|count|groupBy|aggregate` dont le `where`
 * porte `conversationId` SANS identité particulière — c'est-à-dire « tous les
 * membres de cette conversation », la forme d'une audience de diffusion.
 *
 * Une requête keyée sur `id:` ou `userId:` est une PORTE (« ce lecteur-ci
 * appartient-il ? »), pas une audience : elle relève d'`access-control` et de
 * ses propres gardes, et la faire entrer ici mesurerait la popularité d'un
 * motif au lieu d'une propriété (cycle 107, balayage JETÉ).
 *
 * **`groupBy` et `aggregate` sont dans le relevé depuis #20091**, et le `where`
 * n'a plus à être la PREMIÈRE clé de l'appel. L'ancien discriminant exigeait
 * `findMany(\{ where: \{` d'affilée : **28 des 215 lectures de `Participant` du
 * dépôt lui échappaient par la seule forme de leur appel**, dont deux dans son
 * propre répertoire. Un `select` écrit avant le `where` suffisait à sortir une
 * audience du cliquet, et rien ne le disait.
 */
export function sweepConversationAudiences(): AudienceSite[] {
  return walkParticipantReads().audiences;
}

function walkParticipantReads(): { audiences: AudienceSite[]; unjudgeable: UnjudgeableRead[] } {
  const audiences: AudienceSite[] = [];
  const unjudgeable: UnjudgeableRead[] = [];
  const walk = (dir: string, prefix: string, root: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full, prefix, root);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      const src = stripComments(fs.readFileSync(full, 'utf8'));
      const file = `${prefix}${path.relative(root, full)}`;
      const lineOf = (index: number): number => src.slice(0, index).split('\n').length;
      let match: RegExpExecArray | null;

      const called = /participant\.(findMany|count|groupBy|aggregate|findFirst)\(/g;
      while ((match = called.exec(src)) !== null) {
        const line = lineOf(match.index);
        const method = match[1];
        const args = callArguments(src, match.index + match[0].length - 1);
        const at = args === null ? -1 : args.indexOf('where:');
        if (args === null || at < 0) {
          unjudgeable.push({ file, line, method, form: 'absent' });
          continue;
        }
        const after = args.slice(at + 'where:'.length);
        const form = unreadableForm(after);
        // Une VARIABLE déclarée dans le même fichier se résout ; tout le reste
        // se PUBLIE comme illisible.
        const local = form === 'variable' ? resolveLocalWhere(src, (after.trimStart().match(/^[A-Za-z_$][\w$]*/) ?? [''])[0]) : null;
        if (form !== '' && local === null) {
          unjudgeable.push({ file, line, method, form });
          continue;
        }
        const where = local ?? balancedObjectBody(args, args.indexOf('{', at) + 1);
        if (where === null) {
          unjudgeable.push({ file, line, method, form: 'absent' });
          continue;
        }
        judge({ file, line, method, where, scopeIsWritten: true }, audiences, unjudgeable);
      }

      // L'AUTRE forme d'audience : la PROJECTION imbriquée (#20100).
      const projected = /\bparticipants:\s*\{/g;
      while ((match = projected.exec(src)) !== null) {
        const block = balancedBlock(src, match.index + match[0].length - 1);
        if (block === null) continue;
        const at = block.indexOf('where:');
        // Un bloc SANS `where:` n'est pas de ce relevé, et pour deux raisons
        // distinctes qu'il ne faut pas confondre : ou c'est un FILTRE de
        // conversation (`{ some: … }`, `{ every: … }`), qui ne nomme aucune
        // audience, ou c'est une projection NON BORNÉE — plus large encore
        // qu'`isActive` nu — qui se filtre souvent en CODE, ce qu'aucun
        // discriminant de `where` ne peut voir. La seconde est mesurée et
        // suivie chez elle (#20103) ; la deviner ici fabriquerait des verdicts.
        if (at < 0) continue;
        const line = lineOf(match.index);
        const form = unreadableForm(block.slice(at + 'where:'.length));
        if (form !== '') {
          unjudgeable.push({ file, line, method: 'participants-imbriqué', form });
          continue;
        }
        const where = balancedObjectBody(block, block.indexOf('{', at) + 1);
        if (where === null) {
          unjudgeable.push({ file, line, method: 'participants-imbriqué', form: 'absent' });
          continue;
        }
        if (!speaksOfParticipation(where)) {
          unjudgeable.push({ file, line, method: 'participants-imbriqué', form: 'modèle-indécidable' });
          continue;
        }
        judge({ file, line, method: 'participants-imbriqué', where, scopeIsWritten: false }, audiences, unjudgeable);
      }
    }
  };
  for (const declared of AUDIENCE_ROOTS) {
    assertRootExists(declared.dir);
    walk(declared.dir, declared.prefix, declared.dir);
  }
  // Le rang d'inventaire d'un site est son rang dans son FICHIER, et les deux
  // relevés ne balaient pas la même passe : sans ce tri, la clé d'un site
  // dépendrait de l'ORDRE DES SCANNERS plutôt que de la source. Il est sans
  // effet sur les clés d'avant #20100, que la passe unique rendait déjà dans
  // l'ordre des lignes.
  const byLine = (a: { file: string; line: number }, b: { file: string; line: number }): number =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file);
  audiences.sort(byLine);
  unjudgeable.sort(byLine);
  return { audiences, unjudgeable };
}

/**
 * Le verdict sur un `where` LITTÉRAL, partagé par les deux formes d'audience.
 *
 * `scopeIsWritten` est la seule chose qui les distingue, et ce n'est pas un
 * détail d'implémentation. Une audience IMBRIQUÉE tient sa portée du `where` de
 * son PARENT :
 *
 * ```ts
 * conversation.findUnique({ where: { id: conversationId }, select: { participants: { where: … } } })
 * ```
 *
 * Exiger d'elle un `conversationId` textuel la rejetait TOUTE — c'est le
 * constat I2 de #20091, et la raison pour laquelle trente-trois audiences, dont
 * l'éventail de notifications push, vivaient hors de tout relevé du dépôt.
 */
function judge(
  read: { file: string; line: number; method: string; where: string; scopeIsWritten: boolean },
  audiences: AudienceSite[],
  unjudgeable: UnjudgeableRead[]
): void {
  const { file, line, method, where, scopeIsWritten } = read;
  if (scopeIsWritten && !where.includes('conversationId')) {
    // #20091, constat de l'audit : un `where` LITTÉRAL dont la portée vient
    // d'un spread (`{ ...SCOPE, isActive: true }`) n'a pas de `conversationId`
    // textuel. L'écarter en SILENCE est exactement le défaut que ce lot
    // corrige ailleurs — il se publie donc.
    if (/\.{3}[A-Za-z_$]/.test(where)) unjudgeable.push({ file, line, method, form: 'portée-indirecte' });
    return;
  }
  // La LOI D'ABORD. Un `where` qui l'épelle est conforme, qu'il désigne un
  // membre ou toute une audience — se taire sur lui perdrait un VERT sans rien
  // rendre de plus sûr, et c'est ce que faisait le premier jet de ce lot sur
  // `scanLiveParticipants`, la lecture d'audience la plus utilisée du dépôt
  // (son `[...narrowing]` suffisait à la rendre illisible).
  if (spellsTheLaw(where)) {
    audiences.push({ file, line, where, usesLaw: true });
    return;
  }
  if (namesAParticularMember(where)) return;
  // La CLÉ peut venir d'un appel étalé, comme la PORTÉE — et là, se taire est
  // le seul verdict honnête (#20100).
  if (keyedByAnUnreadableCall(where)) {
    unjudgeable.push({ file, line, method, form: 'clé-indirecte' });
    return;
  }
  audiences.push({ file, line, where, usesLaw: false });
}

/** La clé d'inventaire d'un site : fichier + rang de la requête dans ce fichier. */
export function audienceKey(sites: readonly AudienceSite[], site: AudienceSite): string {
  const sameFile = sites.filter((s) => s.file === site.file);
  return `${site.file}#${sameFile.indexOf(site)}`;
}
