import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { buildLastMessagePreviewTranslations } from '../../routes/conversations/utils/last-message-preview';

/**
 * Un participant réduit à ce qu'il faut pour nommer sa room personnelle ET
 * résoudre son prisme. `language` est la colonne `Participant.language` — la
 * SEULE préférence linguistique d'un participant sans compte (invité de lien
 * partagé), qui n'a aucune ligne `User` où lire les quatre niveaux du Prisme.
 */
export interface PrismeParticipant {
  readonly id: string;
  readonly userId: string | null;
  readonly language?: string | null;
}

export type PrismePrisma = Pick<PrismaClient, 'user'>;

/**
 * La carte `{ room personnelle → aperçus traduits }` que `conversation:updated`
 * doit porter, résolue PAR DESTINATAIRE.
 *
 * Une room ABSENTE de la carte vaut `lastMessageTranslations: null` sur le fil :
 * aucune traduction ne sert le prisme de ce destinataire. Ce n'est pas la même
 * chose que « le champ n'est pas dans la charge utile » — c'est ce `null` REÇU
 * qui périme proprement la carte du client (voir plus bas).
 */
export type LastMessagePrismeByRoom = ReadonlyMap<string, Record<string, string>>;

/**
 * `Message.translations` arrive ici sous DEUX formes, et confondre les deux
 * n'échoue pas bruyamment — ça rend silencieusement un aperçu non traduit :
 *
 *  - la **carte Mongo** (`{ "fr": { text, isEncrypted, … } }`), ce que la
 *    colonne stocke et ce que rendent les `select` de ce fichier ;
 *  - le **tableau au format API** (`[{ targetLanguage, translatedContent, … }]`),
 *    ce que le type partagé `Message.translations` PROMET et ce que porte un
 *    message déjà passé par `transformTranslationsToArray` — le cas d'un
 *    re-broadcast après traduction sur le chemin socket.
 *
 * Le second est ramené au premier plutôt que dupliquer les quatre exclusions de
 * `buildLastMessagePreviewTranslations`, qui reste l'unique juge. Sans cette
 * conversion, un tableau serait rejeté comme « pas une carte » et TOUS les
 * destinataires recevraient `null` — l'aperçu retomberait sur l'original alors
 * que les traductions existent.
 *
 * Rend `null` quand il n'y a rien d'exploitable — l'appelant court-circuite
 * alors sans toucher la base.
 */
function normalizeTranslationsToMap(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;

  if (Array.isArray(raw)) {
    const out: Record<string, unknown> = {};
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const { targetLanguage, translatedContent, isEncrypted } = entry as {
        targetLanguage?: unknown;
        translatedContent?: unknown;
        isEncrypted?: unknown;
      };
      if (typeof targetLanguage !== 'string' || targetLanguage === '') continue;
      out[targetLanguage] = { text: translatedContent, isEncrypted };
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  const map = raw as Record<string, unknown>;
  return Object.keys(map).length > 0 ? map : null;
}

/**
 * Résout, pour chaque participant, la carte d'aperçus traduits que sa ligne de
 * liste doit rendre — le jumeau temps réel de ce que `GET /conversations` sert
 * déjà par REST (`buildLastMessagePreviewTranslations`, même unité, mêmes quatre
 * exclusions).
 *
 * **Pourquoi par destinataire.** Le prisme est une propriété du LECTEUR, pas du
 * message : deux participants d'une même conversation ne veulent pas la même
 * langue. Les trois émetteurs de `conversation:updated` bouclaient déjà par
 * participant (`participantUserRooms`) en envoyant le MÊME objet à tout le
 * monde ; la boucle existait, il ne manquait que la résolution.
 *
 * **Pourquoi le champ doit voyager même vide.** `Message.translations` est
 * périmée dans la même écriture qu'une édition (`routes/messages.ts`,
 * `translations: null`). Le serveur fait donc son travail — c'est le fil qui ne
 * le disait pas : le client recevait le NOUVEAU `lastMessagePreview` et gardait
 * la carte de traductions de l'ANCIEN texte, que son résolveur préfère. La
 * ligne affichait l'ancien contenu indéfiniment. Le client ne peut pas trancher
 * seul (une édition garde le même `lastMessageId`, et vider inconditionnellement
 * casserait le chemin d'envoi) : seul le serveur sait que la carte a été
 * périmée, donc c'est le fil qui doit le dire.
 *
 * **Chemin rapide, et il est le cas nominal.** Un message vient d'être stocké :
 * ses traductions n'existent pas encore (le pipeline NLLB est asynchrone via
 * ZMQ). Quand la colonne ne porte rien d'exploitable, la réponse est `null` pour
 * TOUT le monde — inutile de charger les préférences des participants. Aucune
 * requête n'est ajoutée au chemin d'envoi tant qu'il n'y a rien à distribuer.
 *
 * Meilleur effort — ne lève jamais. Une panne de lecture rend une carte vide,
 * ce qui dégrade vers l'aperçu brut : le texte reste JUSTE, seulement pas
 * traduit. Faire échouer l'émission entière serait strictement pire.
 */
export async function resolveLastMessagePrismeByRoom(params: {
  prisma: PrismePrisma;
  participants: readonly PrismeParticipant[];
  translations: unknown;
  originalLanguage: string | null | undefined;
  onError?: (error: unknown) => void;
}): Promise<LastMessagePrismeByRoom> {
  const { prisma, participants, originalLanguage, onError } = params;
  const empty: LastMessagePrismeByRoom = new Map();

  const translations = normalizeTranslationsToMap(params.translations);
  if (!translations) return empty;
  if (participants.length === 0) return empty;

  try {
    const accountIds = [...new Set(participants.map((p) => p.userId).filter((id): id is string => !!id))];
    const users = accountIds.length
      ? await prisma.user.findMany({
          where: { id: { in: accountIds } },
          select: {
            id: true,
            systemLanguage: true,
            regionalLanguage: true,
            customDestinationLanguage: true,
            deviceLocale: true,
          },
        })
      : [];
    const prefsById = new Map(users.map((u) => [u.id, u]));

    const byRoom = new Map<string, Record<string, string>>();
    // Deux participants qui partagent le même prisme partagent la même carte :
    // `buildLastMessagePreviewTranslations` est pure, la mémoïser sur la clé du
    // prisme borne le coût au nombre de prismes DISTINCTS et non au nombre de
    // participants — ce qui compte sur un groupe de plusieurs centaines.
    const memo = new Map<string, Record<string, string> | null>();

    for (const participant of participants) {
      const key = participant.userId ?? participant.id;
      if (!key) continue;

      const prefs = participant.userId ? prefsById.get(participant.userId) : undefined;
      // Un participant sans compte n'a que `Participant.language` — la même
      // source que `groupSocketsByLanguage` utilise pour lui sur le chemin
      // `message:new`. La passer par `resolveUserLanguagesOrdered` (plutôt que
      // de la lowercaser à la main) lui applique la normalisation BCP-47 du
      // Prisme : un `'pt-BR'` de participant matche la traduction `'pt'`.
      const viewerLanguages = prefs
        ? resolveUserLanguagesOrdered(prefs, { deviceLocale: prefs.deviceLocale ?? undefined })
        : resolveUserLanguagesOrdered({ systemLanguage: participant.language ?? null });
      if (viewerLanguages.length === 0) continue;

      const memoKey = viewerLanguages.join('|');
      const resolved = memo.has(memoKey)
        ? memo.get(memoKey)!
        : buildLastMessagePreviewTranslations({ translations, originalLanguage, viewerLanguages });
      memo.set(memoKey, resolved);
      if (!resolved) continue;

      byRoom.set(ROOMS.user(key), resolved);
    }

    return byRoom;
  } catch (error) {
    onError?.(error);
    return empty;
  }
}
