import type { FastifyInstance } from 'fastify';
import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { RECIPIENT_LANG_SELECT, recipientLanguages } from '../../utils/recipient-language';

/**
 * Le MOT d'une demande de connexion, servi au lecteur (#19361).
 *
 * Planche Etat-Demande, étape « Reçue » : « On s'est croisées au festival ! ·
 * Traduit de l'arabe ». Deux champs s'ajoutent à la ligne, et pour le seul
 * DESTINATAIRE — l'émetteur relit son propre texte, il n'a besoin ni de sa
 * langue ni d'une traduction :
 *
 *   - `messageOriginalLanguage` : la langue détectée à l'envoi ;
 *   - `messageTranslation` : `{ language, text }` élu par la descente du Prisme
 *     du lecteur (`resolvePrismTranslation`, rangs 1→4), `null` ⇒ l'original.
 *
 * La carte brute (`messageTranslations`) ne sort JAMAIS : elle porterait, à
 * côté du champ servi, toutes les langues que personne n'a demandées — et vers
 * l'émetteur, la preuve de ce que le destinataire lit.
 *
 * `message` reste l'original, inchangé : un ancien client ignore les deux
 * nouveaux champs.
 */

type LignePortantMot = Record<string, unknown> & {
  readonly receiverId?: unknown;
  readonly message?: unknown;
  readonly messageOriginalLanguage?: unknown;
  readonly messageTranslations?: unknown;
};

/** La carte `langue → texte` que la descente lit, depuis la colonne rangée par le translator. */
function textesTraduits(colonne: unknown): Record<string, string> {
  if (!colonne || typeof colonne !== 'object') return {};
  return Object.fromEntries(
    Object.entries(colonne as Record<string, unknown>).flatMap(([langue, valeur]) => {
      const texte = typeof valeur === 'string' ? valeur : (valeur as { text?: unknown } | null)?.text;
      return typeof texte === 'string' && texte.trim() !== '' ? [[langue, texte]] : [];
    })
  );
}

const estRecueTraduite = (demande: LignePortantMot, acteurId: string | undefined): boolean =>
  !!acteurId &&
  demande.receiverId === acteurId &&
  typeof demande.message === 'string' &&
  Object.keys(textesTraduits(demande.messageTranslations)).length > 0;

/**
 * Les langues du lecteur, lues UNE fois pour toute la page — et seulement si une
 * ligne qu'il a REÇUE porte une traduction. Une page sans mot traduit ne coûte
 * aucune lecture.
 */
export async function lecteurDuMot(
  fastify: FastifyInstance,
  acteurId: string | undefined,
  demandes: readonly LignePortantMot[]
): Promise<readonly string[]> {
  if (!acteurId || !demandes.some((demande) => estRecueTraduite(demande, acteurId))) return [];
  const lecteur = await fastify.prisma.user.findUnique({
    where: { id: acteurId },
    select: RECIPIENT_LANG_SELECT,
  });
  return recipientLanguages(lecteur);
}

/** La ligne servie : la carte brute retirée, le mot résolu pour le seul destinataire. */
export function servirMot<T extends LignePortantMot>(
  demande: T,
  acteurId: string | undefined,
  langues: readonly string[]
): T {
  const { messageTranslations, messageOriginalLanguage, ...reste } = demande;
  const destinataire = !!acteurId && demande.receiverId === acteurId && typeof demande.message === 'string';
  if (!destinataire) return reste as unknown as T;

  const origine = typeof messageOriginalLanguage === 'string' ? messageOriginalLanguage : null;
  const traduction = resolvePrismTranslation({
    translations: textesTraduits(messageTranslations),
    originalLanguage: origine,
    preferredLanguages: langues,
  });

  return {
    ...reste,
    messageOriginalLanguage: origine,
    messageTranslation: traduction ? { language: traduction.language, text: traduction.text } : null,
  } as unknown as T;
}
