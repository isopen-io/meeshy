import * as fs from 'fs';
import * as path from 'path';

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
 * fermé ; aucune migration n'a reprise les lignes existantes.
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
 * `translationReaders` porte les DEUX dans un seul `Promise.all` : la requête
 * lawful construit `rooms` (qui reçoit la traduction), la requête NUE construit
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

/** Une audience relevée par le balayage. */
export type AudienceSite = {
  readonly file: string;
  readonly line: number;
  /** Le `where` tel qu'il est écrit, commentaires dépouillés et espaces réduits. */
  readonly where: string;
  readonly usesLaw: boolean;
};

const AUDIENCE_ROOT = path.resolve(__dirname, '..');

/**
 * Les exclusions DÉLIBÉRÉES — clé `fichier#indice-de-requête`, jamais un
 * numéro de ligne, qui dériverait à la première édition et transformerait le
 * cliquet en bruit (règle du balayage des schémas de réponse).
 */
export const DELIBERATELY_WIDE: Readonly<Record<string, string>> = {
  'handlers/StatusHandler.ts#0':
    "`_getBlockedSocketIdsInRoom` rend les sockets à EXCLURE d'une diffusion de frappe : " +
    'resserrer réduirait la liste de refus. Et le même relevé décide `typerIsRegistered`, ' +
    "donc laquelle des deux lois s'applique — un frappeur actif-et-banni y basculerait de " +
    'la loi des cercles vers la règle de blocage seule, strictement plus faible.',
  'translationReaders.ts#1':
    "`excludedQueueKeys` est une liste de REFUS : elle se construit sur le sur-ensemble. " +
    "Resserrer ici retirerait un membre banni de l'exclusion, donc lui servirait la " +
    'traduction par la file hors ligne. La requête lawful du même `Promise.all` construit, ' +
    "elle, l'audience (`rooms`).",
};

/**
 * Dépouille les commentaires en PRÉSERVANT le compte de lignes : un numéro de
 * ligne calculé sur une source raccourcie désigne la mauvaise ligne, et un
 * cliquet qui pointe à côté se lit comme un cliquet qui se trompe.
 */
function stripComments(source: string): string {
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
function namesAParticularMember(where: string): boolean {
  const binding = /(?:^|[,{]\s*)(?:userId|id)\s*(?::\s*([^,]*))?/g;
  let match: RegExpExecArray | null;
  while ((match = binding.exec(where)) !== null) {
    const value = (match[1] ?? '').trim();
    // Raccourci (`userId,`) ⇒ la variable homonyme NOMME une personne.
    if (value === '') return true;
    // Un filtre de nullité ne nomme personne ; tout le reste (variable,
    // littéral, `{ in: [...] }`) sélectionne des personnes précises.
    if (!/^\{\s*not:\s*null\s*\}$/.test(value)) return true;
  }
  return false;
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
function balancedObjectBody(source: string, openIndex: number): string | null {
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
export function sweepConversationAudiences(): AudienceSite[] {
  const found: AudienceSite[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const raw = fs.readFileSync(full, 'utf8');
      const src = stripComments(raw);
      const re = /participant\.(?:findMany|count)\(\s*\{\s*where:\s*\{/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(src)) !== null) {
        const where = balancedObjectBody(src, re.lastIndex);
        if (where === null) continue;
        if (!where.includes('conversationId')) continue;
        if (namesAParticularMember(where)) continue;
        found.push({
          file: path.relative(AUDIENCE_ROOT, full),
          line: src.slice(0, match.index).split('\n').length,
          where,
          usesLaw: LAW_SPELLINGS.some((spelling) => where.includes(spelling)),
        });
      }
    }
  };
  walk(AUDIENCE_ROOT);
  return found;
}

/** La clé d'inventaire d'un site : fichier + rang de la requête dans ce fichier. */
export function audienceKey(sites: readonly AudienceSite[], site: AudienceSite): string {
  const sameFile = sites.filter((s) => s.file === site.file);
  return `${site.file}#${sameFile.indexOf(site)}`;
}
