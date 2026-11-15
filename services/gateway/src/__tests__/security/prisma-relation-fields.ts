/**
 * #4888 — la résolution PAR MODÈLE qu'exige un balayage de `select: { … }`.
 *
 * `include: { x: true }` ne peut désigner qu'une RELATION — Prisma refuse un
 * scalaire là. `select: { x: true }` peut désigner l'un OU l'autre, et seul le
 * modèle interrogé le distingue (`Message.translations` est un scalaire JSON,
 * quand `Message.attachments` est une relation). Un balayage par simple union
 * de noms de relations lus dans `schema.prisma` mesure donc la POPULARITÉ d'un
 * identifiant, pas une propriété (cycle 107, `services/gateway/CLAUDE.md`).
 *
 * Source du datamodel : le client Prisma RÉEL, importé par un chemin RELATIF
 * qui contourne le stub de test (`jest.config.json` mappe le spécificateur
 * `@meeshy/shared/prisma/client` vers `__stubs__/prisma-client.ts`, qui n'a
 * aucun DMMF). Ce balayage n'exerce aucune requête ni aucun comportement
 * métier — il lit un SCHÉMA, exactement comme `response-schema-sweep.ts` lit
 * des fichiers de route — donc le stub applicatif n'a pas lieu d'être ici.
 */
import { join } from 'path';

/** Un champ du datamodel Prisma, réduit à ce dont ce balayage a besoin. */
type ChampDatamodel = {
  readonly name: string;
  readonly kind: string;
  readonly type: string;
};

/** Un modèle du datamodel Prisma, réduit à ce dont ce balayage a besoin. */
type ModeleDatamodel = {
  readonly name: string;
  readonly fields: readonly ChampDatamodel[];
};

const CHEMIN_CLIENT_REEL = join(__dirname, '../../../../../packages/shared/prisma/client/index.js');

/**
 * Le datamodel du client RÉEL, lu défensivement : un client non généré (ou
 * dont le chemin a bougé) rend `[]` plutôt que de faire lever l'import — ce
 * balayage doit alors être vu comme NON CONCLUANT par son appelant, jamais
 * comme « aucune relation nulle part ».
 */
export function datamodelReel(): readonly ModeleDatamodel[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Prisma } = require(CHEMIN_CLIENT_REEL) as {
      Prisma?: { dmmf?: { datamodel?: { models?: readonly ModeleDatamodel[] } } };
    };
    return Prisma?.dmmf?.datamodel?.models ?? [];
  } catch {
    return [];
  }
}

/** Nom du délégué Prisma Client pour un modèle — `MessageAttachment` → `messageAttachment`. */
function nomDelegue(modele: string): string {
  return modele.charAt(0).toLowerCase() + modele.slice(1);
}

export type IndexDesRelations = {
  /** `prisma.<délégué>.` → nom du modèle Prisma (`PascalCase`). */
  readonly modeleParDelegue: ReadonlyMap<string, string>;
  /** `Modele.champ` → modèle CIBLE de la relation, pour les champs `kind === 'object'` seulement. */
  readonly ciblesDeRelation: ReadonlyMap<string, string>;
};

/**
 * Construit l'index une fois pour tout le balayage — jamais recalculé par
 * occurrence.
 *
 * `kind === 'object'` recouvre DEUX choses que MongoDB/Prisma distingue mais
 * que le DMMF étiquette pareil : une vraie RELATION vers une collection à
 * part (`Message.attachments` → `MessageAttachment`, sa propre collection),
 * et un TYPE COMPOSITE embarqué DANS le même document (`Participant.permissions`
 * → `ParticipantPermissions`, mesuré : absent de `datamodel.models`, donc pas
 * une collection). Charger un composite embarqué ne fait AUCUN aller-retour
 * de plus — il fait déjà partie du document — ce n'est donc pas le défaut visé
 * ici. Seuls les champs dont la CIBLE est un autre `model` (jamais un `type`
 * composite) entrent dans `ciblesDeRelation` ; un premier balayage qui les
 * confondait rendait `Participant.permissions` faux positif sur les deux
 * seuls sites du dépôt qui le sélectionnent nu.
 */
export function construireIndexDesRelations(modeles: readonly ModeleDatamodel[]): IndexDesRelations {
  const modeleParDelegue = new Map<string, string>();
  const ciblesDeRelation = new Map<string, string>();
  const nomsDeModeles = new Set(modeles.map((m) => m.name));

  for (const m of modeles) {
    modeleParDelegue.set(nomDelegue(m.name), m.name);
    for (const f of m.fields) {
      if (f.kind === 'object' && nomsDeModeles.has(f.type)) {
        ciblesDeRelation.set(`${m.name}.${f.name}`, f.type);
      }
    }
  }

  return { modeleParDelegue, ciblesDeRelation };
}

export function estUneRelation(index: IndexDesRelations, modele: string, champ: string): boolean {
  return index.ciblesDeRelation.has(`${modele}.${champ}`);
}

export function modeleCible(index: IndexDesRelations, modele: string, champ: string): string | undefined {
  return index.ciblesDeRelation.get(`${modele}.${champ}`);
}

export function modeleDuDelegue(index: IndexDesRelations, delegue: string): string | undefined {
  return index.modeleParDelegue.get(delegue);
}
