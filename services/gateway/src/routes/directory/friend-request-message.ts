import type { FastifyInstance } from 'fastify';
import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { RECIPIENT_LANG_SELECT, recipientLanguages } from '../../utils/recipient-language';
import { getCacheStore } from '../../services/CacheStore';
import {
  startFriendRequestMessageTranslation,
  type DeclenchementTraduction,
} from '../../services/friend-requests/FriendRequestMessageTranslationService';

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
  readonly id?: unknown;
  readonly status?: unknown;
  readonly createdAt?: unknown;
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

/** La fenêtre du rattrapage : au-delà, une demande en attente n'attend plus sa traduction. */
const RATTRAPAGE_FENETRE_MS = 7 * 86_400_000;
/** Une relance par demande et par demi-heure, quel que soit le nombre de lectures. */
const RATTRAPAGE_VERROU_S = 1800;

/** Une demande REÇUE, en attente et récente, dont le mot a une langue d'origine : candidate au rattrapage. */
function recueEnAttenteAvecMot(demande: LignePortantMot, acteurId: string, now: number): boolean {
  const creee = demande.createdAt instanceof Date ? demande.createdAt.getTime() : Number.NaN;
  return (
    demande.receiverId === acteurId &&
    demande.status === 'pending' &&
    typeof demande.id === 'string' &&
    typeof demande.message === 'string' &&
    demande.message.trim() !== '' &&
    typeof demande.messageOriginalLanguage === 'string' &&
    now - creee <= RATTRAPAGE_FENETRE_MS
  );
}

/**
 * Les langues du lecteur, lues UNE fois pour toute la page — et seulement si une
 * ligne qu'il a REÇUE porte une traduction, ou un mot encore à traduire. Une page
 * sans mot reçu ne coûte aucune lecture.
 */
export async function lecteurDuMot(
  fastify: FastifyInstance,
  acteurId: string | undefined,
  demandes: readonly LignePortantMot[]
): Promise<readonly string[]> {
  const now = Date.now();
  if (
    !acteurId ||
    !demandes.some((demande) => estRecueTraduite(demande, acteurId) || recueEnAttenteAvecMot(demande, acteurId, now))
  ) {
    return [];
  }
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

/**
 * Ce qu'il faut relancer : une demande reçue, en attente et récente, dont AUCUNE langue
 * du Prisme du lecteur (hors la langue du mot) n'a de traduction rangée. Le retour du
 * translator a pu se perdre (passerelle redémarrée, autre instance) : rien d'autre ne le
 * rattraperait, et le destinataire lirait l'original pour toujours.
 */
export function motsARelancer(
  acteurId: string | undefined,
  demandes: readonly LignePortantMot[],
  langues: readonly string[],
  now: number = Date.now()
): DeclenchementTraduction[] {
  if (!acteurId || langues.length === 0) return [];
  return demandes.flatMap((demande) => {
    if (!recueEnAttenteAvecMot(demande, acteurId, now)) return [];
    const source = normalizeLanguageForDedup(demande.messageOriginalLanguage as string);
    const rangees = new Set(Object.keys(textesTraduits(demande.messageTranslations)).map(normalizeLanguageForDedup));
    const voulues = langues.map(normalizeLanguageForDedup).filter((langue) => langue !== source);
    if (voulues.length === 0 || voulues.some((langue) => rangees.has(langue))) return [];
    return [{
      friendRequestId: demande.id as string,
      receiverId: acteurId,
      message: demande.message as string,
      sourceLanguage: demande.messageOriginalLanguage as string,
    }];
  });
}

/** Relance, sans attendre, chaque mot perdu — au plus une fois par verrou. Jamais bloquant. */
export function relancerMotsPerdus(
  fastify: FastifyInstance,
  acteurId: string | undefined,
  demandes: readonly LignePortantMot[],
  langues: readonly string[]
): void {
  const relances = motsARelancer(acteurId, demandes, langues);
  if (relances.length === 0) return;
  const service = startFriendRequestMessageTranslation(fastify);
  if (!service) return;
  for (const relance of relances) {
    void getCacheStore()
      .setnx(`friend-request:translation-retry:${relance.friendRequestId}`, '1', RATTRAPAGE_VERROU_S)
      .then((libre) => (libre ? service.trigger(relance) : undefined))
      .catch(() => undefined);
  }
}
