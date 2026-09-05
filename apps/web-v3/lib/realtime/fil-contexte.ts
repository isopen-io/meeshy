import { COOKIE_DE_JETON, valeurDuCookie } from '@/lib/api/cookies';
import type { Creance } from '@/lib/api/fil';
import { cleDeLien, jetonDuCookie, type CleDeLien } from '@/lib/api/guest-session';
import type { Droits } from '@/lib/api/invite';
import { FIL } from '@/lib/contenu/fil';

import type { ControleurDuComposeur } from './composeur';
import type { Defilement } from './defilement';
import type { EtatDuFil } from './fil-etat';
import type { Peintre } from './fil-peinture';
import type { Reserve } from './reserve';

/**
 * CE QUE LE MODULE DE PARTICIPATION TIENT — les TYPES et les DEUX LECTEURS du
 * `<main data-participation="fil">` (`configuration`, `creanceDe`), extraits
 * de `participate.ts` (§ 4 étape 0 de la spécification #5163 : le module
 * était hors budget, 1 056 lignes). AUCUNE logique de plus ici — c'est la
 * raison pour laquelle ce fichier ne grandit quasiment jamais : un type et un
 * lecteur ne changent qu'avec la FORME du `<main>` que le serveur sert.
 */

export type Porte = 'membre' | 'invite';

export type Configuration = {
  readonly socket: string;
  readonly passerelle: string;
  readonly conversation: string;
  readonly porte: Porte;
  readonly lien: CleDeLien | null;
  readonly moi: string | null;
  readonly nom: string;
  readonly langues: readonly string[];
  /** Les droits SERVIS par le document — l'état de départ, avant tout `participant:rights-updated`. Un membre a tout. */
  readonly droits: Droits;
  /** Les participants NOMMÉS par le document — les seuls dont `user:status` peut faire bouger « N en ligne ». */
  readonly participants: readonly string[];
  /** Ceux que le document a SERVIS en ligne — l'état de départ du compte. */
  readonly presents: readonly string[];
};

type Ecouteur = (...arguments_: unknown[]) => void;

export type Socket = {
  readonly connected: boolean;
  connect(): unknown;
  disconnect(): unknown;
  emit(evenement: string, ...arguments_: unknown[]): unknown;
  on(evenement: string, ecouteur: Ecouteur): unknown;
  timeout(ms: number): { emit(evenement: string, ...arguments_: unknown[]): unknown };
  readonly io: { on(evenement: string, ecouteur: Ecouteur): unknown };
};

export type ModuleSocket = { readonly io: (url: string, options: Readonly<Record<string, unknown>>) => Socket };

const liste = (valeur: string | undefined): readonly string[] => (valeur ?? '').split(',').filter((entree) => entree !== '');

export const configuration = (main: HTMLElement): Configuration | null => {
  const { socket, passerelle, conversation, porte, lien, moi, nom, langues, ecrire, fichiers, images, historique, participants, presents } = main.dataset;
  if (socket === undefined || passerelle === undefined || conversation === undefined) return null;
  if (porte !== 'membre' && porte !== 'invite') return null;
  const cle = lien === undefined ? null : cleDeLien({ linkId: lien });
  if (porte === 'invite' && cle === null) return null;
  return {
    socket,
    passerelle,
    conversation,
    porte,
    lien: cle,
    moi: moi ?? null,
    nom: nom ?? FIL.vous,
    langues: liste(langues),
    droits: {
      canSendMessages: ecrire === '1',
      canSendFiles: fichiers === '1',
      canSendImages: images === '1',
      canViewHistory: porte === 'membre' || historique === '1',
    },
    participants: liste(participants),
    presents: liste(presents),
  };
};

export const creanceDe = (config: Configuration): Creance | null => {
  if (config.porte === 'membre') {
    const jeton = valeurDuCookie(document.cookie, COOKIE_DE_JETON);
    return jeton === null ? null : { genre: 'membre', jeton };
  }
  const jeton = config.lien === null ? null : jetonDuCookie(document.cookie, config.lien);
  return jeton === null ? null : { genre: 'invite', jeton };
};

export const identifiantClient = (): string => `cid_${crypto.randomUUID()}`;

export type Contexte = {
  readonly main: HTMLElement;
  readonly config: Configuration;
  readonly creance: Creance;
  readonly p: Peintre;
  readonly r: Reserve;
  readonly defile: Defilement;
  /** Les clés de la réserve pour CE lecteur — `null` quand le document n'a servi aucune identité. */
  readonly cles: { readonly file: string; readonly brouillon: string } | null;
  /** Les fichiers d'une bulle qui attend son envoi, par `clientMessageId` — un `File` ne vit pas dans l'état. */
  readonly fichiers: Map<string, readonly File[]>;
  /** Ce qui a été affiché et n'a pas encore été DIT à la passerelle. */
  readonly lus: Set<string>;
  etat: EtatDuFil;
  /** Les droits tels que le lecteur les TIENT — servis par le document, puis changés par `participant:rights-updated`. */
  droits: Droits;
  socket: Socket | null;
  /**
   * Le socket est AUTHENTIFIÉ — `authenticated` reçu, pas seulement le transport
   * ouvert : la passerelle refuse tout `message:send`, `reaction:add` ou
   * `typing:start` qui la devance (`User not authenticated`), exactement comme
   * elle refuse un `conversation:join` prématuré. Tombe à `disconnect`.
   */
  pret: boolean;
  /** Un vidage de la file est en cours : un second, déclenché par `conversation:joined`, attend son tour — FIFO, jamais deux envois croisés. */
  vidageEnCours: boolean;
  composeur: ControleurDuComposeur | null;
  /** La poignée de destruction de `prendsLesGestes` (`fil-gestes.ts`) — retirée à `destruction` (§ 12.11 étage 3), à côté de `composeur.detruit()`. */
  gestes: { readonly detruit: () => void } | null;
  /** Le micro et la position (#5061, `lib/realtime/capture.ts`) — `actualise()` rejouée par `appliqueLesDroits`, `detruit()` par `destruction`. */
  capture: { readonly actualise: () => void; readonly detruit: () => void } | null;
  /**
   * La poignée de `armeLaFeuilleDeLien` (#5034, `lib/realtime/feuille-de-lien.ts`)
   * — rendue à `destruction`, à côté des trois ci-dessus. L'écoute se pose au
   * DOCUMENT (la feuille vit hors de `main`), qui survit à une navigation
   * douce : sans ce retrait, chaque traversée d'écran en empilerait une, et
   * une seule soumission posterait autant de fois qu'il y a d'écoutes.
   */
  feuilleDeLien: (() => void) | null;
  enLigne: boolean;
  cache: boolean;
  deconnecteDepuis: number | null;
  checkpoint: string | null;
  /** Le dernier curseur GLOBAL connu — `checkpointSeq` de `/sync`, ou un `_seq` reçu — renvoyé en `seq` (`routes/sync/index.ts:279`). */
  seq: number | null;
  plusAncien: string | null;
  ferme: boolean;
  dernierBattementA: number;
  accuseProgramme: ReturnType<typeof setTimeout> | null;
};
