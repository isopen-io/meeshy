import type { MessageServi } from '@/app/(public)/chats/[lien]/fil-modele';
import { refusDeLaPlace, type RefusDeLaPlace, type Verdict } from '@/lib/api/messagerie';

/**
 * LA FILE HORS-LIGNE — extraite du patron mesuré de `apps/web`
 * (`services/socketio/orchestrator.service.ts`, 911 lignes), où il MARCHE mais
 * est noyé dans le transport (§ 2, ligne « File hors-ligne »).
 *
 * L'extraction n'est pas un rangement : c'est ce qui rend les trois propriétés
 * du § 7 mesurables. Tant que la file vit dans l'orchestrateur du socket, on ne
 * peut opposer « les deux messages partent DANS L'ORDRE » qu'à un navigateur,
 * un serveur et un réseau qu'on aurait coupés — c'est-à-dire à une chaîne dont
 * chaque maillon peut mentir. Ici, le transport est un PARAMÈTRE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TROIS LOIS, ET LA DIFFÉRENCE ENTRE UNE COUPURE ET UN REFUS
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   1. **FIFO strict, un envoi à la fois.** Deux envois en vol rendent l'ordre
 *      d'ARRIVÉE indéterminé : la conversation des autres afficherait la
 *      réponse avant la question. Le vidage est donc séquentiel, jamais un
 *      `Promise.all`.
 *   2. **Une coupure ARRÊTE ; elle n'annule pas.** `indisponible` — un tunnel
 *      coupé, un 500, un délai — laisse l'entrée EN FILE, à sa place. Reprendre
 *      à la suivante inverserait l'ordre ; jeter l'entrée perdrait un message
 *      que le visiteur croit écrit. C'est la ligne « erreur réseau ≠ 401 » du
 *      § 7, appliquée à l'écriture.
 *   3. **Un refus ANNULE, et se VOIT.** 401 (place fermée) et 410 (lien mort)
 *      ne se réessaieront jamais : la file entière est rendue à l'appelant avec
 *      sa cause, pour être peinte en « non envoyé » (§ 6.3 G : « les envois en
 *      file sont annulés et rendus VISIBLES comme non envoyés, jamais perdus en
 *      silence »).
 *
 * Ce que ce module ne fait PAS encore, et qu'il faut dire : il ne PERSISTE pas.
 * Le § 3.3 range la file sous `idb-keyval`, et ce n'est pas fait ici — une file
 * perdue au rechargement reste une file perdue. Le cas D de la recette (§ 6.5)
 * ne l'exige pas : il coupe le réseau, il ne recharge pas la page. La
 * persistance est donc un manque DÉCLARÉ, pas un manque masqué.
 */

/** Le plafond du patron mesuré (`MAX_QUEUE_SIZE`) : une file non bornée est une rétention. */
export const PLAFOND_DE_LA_FILE = 50;

export type EntreeDeFile = {
  /** L'identifiant LOCAL — celui de la bulle optimiste, jusqu'à ce que le serveur en donne un. */
  readonly cle: string;
  readonly texte: string;
  /** La langue déclarée du visiteur : le rang 1 du Prisme des autres lecteurs. */
  readonly langue: string | null;
  readonly ecriteA: number;
};

export type RefusDeFile = {
  /** La place fermée (401) ou le lien mort (410) — jamais une coupure. */
  readonly cause: RefusDeLaPlace;
  readonly annulees: readonly EntreeDeFile[];
};

export type ResultatDeVidage = {
  readonly partis: readonly MessageServi[];
  /** Ce qui n'est PAS parti et qu'on réessaiera — dans son ordre d'écriture. */
  readonly restantes: readonly EntreeDeFile[];
  readonly refus: RefusDeFile | null;
};

/**
 * Le plafond garde les PLUS ANCIENNES.
 *
 * Le choix n'est pas neutre : garder les plus récentes ferait disparaître, en
 * silence, le message que le visiteur a écrit en premier — et c'est celui dont
 * il attend le plus la réponse. Un dépassement se traduit donc par un refus
 * d'ajout, que l'écran peut dire, jamais par un oubli du passé.
 */
export const enfile = (
  file: readonly EntreeDeFile[],
  entree: EntreeDeFile,
): readonly EntreeDeFile[] => (file.length >= PLAFOND_DE_LA_FILE ? file : [...file, entree]);

export const videLaFile = async ({
  file,
  envoie,
}: {
  readonly file: readonly EntreeDeFile[];
  readonly envoie: (entree: EntreeDeFile) => Promise<Verdict<MessageServi>>;
}): Promise<ResultatDeVidage> => {
  const partis: MessageServi[] = [];

  for (let rang = 0; rang < file.length; rang += 1) {
    const entree = file[rang];
    if (entree === undefined) continue;

    const verdict = await envoie(entree);

    if (verdict.etat === 'servi') {
      partis.push(verdict.valeur);
      continue;
    }

    if (verdict.etat === 'indisponible') {
      return { partis, restantes: file.slice(rang), refus: null };
    }

    const refus = refusDeLaPlace(verdict);
    if (refus === null) return { partis, restantes: file.slice(rang), refus: null };

    return { partis, restantes: [], refus: { cause: refus, annulees: file.slice(rang) } };
  }

  return { partis, restantes: [], refus: null };
};
