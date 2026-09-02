import type { Droits } from '@/lib/api/invite';

/**
 * LES DROITS D'UN INVITÉ — UNE source, deux surfaces (issue #4523, conception
 * § 12.3 point 3, charte règle 26).
 *
 * Le bandeau du fil (`app/connecte/fil-vue.ts`, l'état INVITÉ de `/chat/:lien`
 * — la vue `rights` de la planche) rend les verdicts que la passerelle a
 * SERVIS : `entry.rights` du 201 de la jonction (`link-admission.ts:640-662`),
 * puis, à chaque chargement, `participant.canSend*` et
 * `conversation.allowViewHistory` du battement (`participantConversationPayload`,
 * `:554-577`) — l'INSTANTANÉ pris au join, que `services/participantRights.ts:
 * 6-13` déclare ne suivre ni le lien ni le delta de l'hôte. Ce que l'hôte
 * change ENSUITE (§ 6.3.B) n'arrive PAS par le battement : la passerelle le
 * pousse par `participant:rights-updated` (`participants-writes.ts:403-425`),
 * que `lib/realtime/droits-peinture.ts` lit et repeint. L'accordéon de la
 * modale (`app/(public)/chat/[lien]/choix-vue.ts`, l'état CHOIX — la vue
 * `join`) NOMME les mêmes droits AVANT la jonction, sans en donner le verdict :
 * l'aperçu (`GET /anonymous/link/:identifier`, `routes/anonymous.ts:663-692`)
 * sert les exigences du lien, ses langues et son effectif, jamais
 * `allowViewHistory` ni `allowAnonymous*` — un verdict affirmé là serait
 * inventé (§ 5.1). Le seul verdict qu'elle rend est celui que rien n'accorde à
 * un invité : aucun champ de `GuestRights` (`services/participantRights.ts`)
 * ne porte un appel ni une invitation.
 *
 * Quatre droits, dans l'ordre de la planche (`cible/rights.png`) : ce que le
 * lecteur LIT (l'historique — le plancher est `joinedAt` quand le lien ne
 * l'ouvre pas, `messages-list.ts:265-275`), ce qu'il ÉCRIT, ce qu'il JOINT
 * (photos et fichiers sont DEUX droits distincts, `upload.ts:287-311`), et ce
 * qui reste aux membres du compte. La planche date l'historique (« depuis le
 * 12 août ») et chiffre les pièces (« 10 Mo ») : la passerelle ne sert ni
 * l'un ni l'autre, et un chiffre ne s'invente pas.
 */

/** Le paramètre d'adresse qui dit « la jonction vient d'avoir lieu » — posé par la 303 de `/chat/:lien`, lu par son GET, retiré par le module de participation. */
export const PARAMETRE_DE_JONCTION_FRAICHE = 'bienvenue';

export const BANDEAU_DES_DROITS = {
  bienvenue: (pseudo: string): string => `Bienvenue ${pseudo} — vous êtes entré en anonyme`,
  ouvre: (titre: string): string => `Voilà ce que ce lien vous ouvre dans ${titre}`,
} as const;

export type CleDeDroit = 'historique' | 'ecrire' | 'fichiers' | 'appels';

export type DroitRendu = {
  readonly cle: CleDeDroit;
  readonly accorde: boolean;
  readonly titre: string;
  readonly sous: string;
};

export type DroitAnnonce = {
  readonly cle: CleDeDroit;
  /** Le nom du droit, à l'infinitif — pour l'énumérer AVANT la jonction sans en préjuger. */
  readonly nom: string;
  /** Vrai quand c'est le LIEN qui en décide ; faux quand aucun champ servi ne peut l'accorder à un invité. */
  readonly variable: boolean;
  readonly rendu: (droits: Droits) => DroitRendu;
};

export const SANS_DROITS: Droits = { canSendMessages: false, canSendFiles: false, canSendImages: false, canViewHistory: false };
export const TOUS_LES_DROITS: Droits = { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: true };

type Libelle = Omit<DroitRendu, 'cle'>;

const historique = (droits: Droits): Libelle =>
  droits.canViewHistory
    ? { accorde: true, titre: 'Historique de la conversation', sous: 'Vous lisez aussi ce qui a été dit avant votre arrivée.' }
    : { accorde: false, titre: 'Historique masqué', sous: 'Les messages antérieurs à votre arrivée restent masqués.' };

const ecrire = (droits: Droits): Libelle =>
  droits.canSendMessages
    ? { accorde: true, titre: 'Écrire et répondre', sous: 'Traduit vers les langues des participants.' }
    : { accorde: false, titre: 'Lecture seule', sous: 'L’hôte n’autorise pas les invités à écrire.' };

const fichiers = (droits: Droits): Libelle => {
  if (droits.canSendFiles && droits.canSendImages) return { accorde: true, titre: 'Envoyer photos et fichiers', sous: 'Ce lien admet les deux.' };
  if (droits.canSendImages) return { accorde: true, titre: 'Envoyer des photos', sous: 'Les autres fichiers restent réservés aux membres.' };
  if (droits.canSendFiles) return { accorde: true, titre: 'Envoyer des fichiers', sous: 'Les photos restent réservées aux membres.' };
  return { accorde: false, titre: 'Pas de photo ni de fichier', sous: 'Réservé aux membres de la conversation.' };
};

const appels = (): Libelle => ({ accorde: false, titre: 'Pas d’appel, pas d’invitation', sous: 'Réservé aux membres du compte.' });

export const DROITS_DE_L_INVITE: readonly DroitAnnonce[] = [
  { cle: 'historique', nom: 'lire l’historique', variable: true, rendu: (droits) => ({ cle: 'historique', ...historique(droits) }) },
  { cle: 'ecrire', nom: 'écrire', variable: true, rendu: (droits) => ({ cle: 'ecrire', ...ecrire(droits) }) },
  { cle: 'fichiers', nom: 'joindre photos et fichiers', variable: true, rendu: (droits) => ({ cle: 'fichiers', ...fichiers(droits) }) },
  { cle: 'appels', nom: 'appeler', variable: false, rendu: () => ({ cle: 'appels', ...appels() }) },
];

/** Les quatre droits, rendus pour CE lien — ce que le bandeau affiche, et ce que le module repeint. */
export const droitsRendus = (droits: Droits): readonly DroitRendu[] => DROITS_DE_L_INVITE.map((droit) => droit.rendu(droits));

/** Les droits que le lien décide, par leur nom — ce que la modale énumère avant la jonction. */
export const nomsDesDroitsVariables = (): readonly string[] =>
  DROITS_DE_L_INVITE.filter((droit) => droit.variable).map((droit) => droit.nom);

/** Les droits que rien n'accorde à un invité — le seul verdict que la modale a le droit de rendre. */
export const droitsHorsDuLien = (): readonly DroitRendu[] =>
  DROITS_DE_L_INVITE.filter((droit) => !droit.variable).map((droit) => droit.rendu(SANS_DROITS));
