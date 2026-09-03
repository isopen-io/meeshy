import { apercuServi, type ApercuServi, type SourceDApercu } from '@/lib/api/compte';

/**
 * L'ÉTAT DE LA LISTE DES CONVERSATIONS — pur, sans DOM, sans réseau.
 *
 * C'est la moitié du module de participation qui se TESTE sans navigateur : le
 * réordonnancement, le compte de non-lus, la frappe et le retrait optimiste
 * d'une ligne sont des fonctions de `(état, événement) → état`. La peinture
 * (`liste-peinture.ts`) applique le résultat ; le module (`liste.ts`) décide
 * QUAND. Les trois se lisent séparément parce qu'ils échouent séparément.
 *
 * CE QUE LA PASSERELLE POUSSE, ET CE QU'ELLE NE POUSSE PAS. La liste écoute
 * `conversation:updated` (le re-tri et l'aperçu — `MeeshySocketIOManager.ts:
 * 3216`, `MessageHandler.ts:1691`, `emitConversationPreviewUpdate.ts:361`,
 * tous trois émis vers la room PERSONNELLE de chaque participant) et
 * `conversation:unread-updated` (la pastille — `emitUnreadCountsToRecipients.ts`,
 * même room). Elle n'écoute PAS `message:new` : les deux événements voyagent
 * ensemble sur le même envoi, et le second porte l'aperçu déjà DESCENDU au
 * prisme du lecteur (`resolveLastMessagePreviewPrism`), là où `message:new`
 * porte la carte du message. Deux sources pour une ligne, c'est la jumelle qui
 * fait clignoter le texte entre deux langues.
 *
 * La FRAPPE, elle, arrive par la room de CONVERSATION (`StatusHandler.ts:292`).
 * La liste n'a aucun `conversation:join` à émettre pour l'entendre : la
 * passerelle joint le socket à TOUTES les rooms du lecteur à l'authentification
 * (`AuthHandler._joinUserConversations`, `:724-741`).
 */

export type LigneDeListe = {
  readonly id: string;
  readonly titre: string;
  /** L'instant du dernier message, en ISO — la clé de tri. `null` ⇒ jamais rien dit. */
  readonly quand: string | null;
  readonly nonLus: number;
  readonly sourdine: boolean;
  /**
   * L'APERÇU DÉJÀ RÉSOLU — le texte SERVI, sa langue, et celle d'où il vient.
   *
   * La descente du Prisme se fait UNE fois, à l'arrivée de la charge
   * (`bouge`), jamais à la peinture. La première version gardait la charge
   * BRUTE et redescendait à chaque repeinture : l'état relu dans le document
   * n'ayant, lui, aucune carte de traductions, la seconde descente rendait
   * « aucune traduction » et EFFAÇAIT la pastille que le serveur venait de
   * peindre. Une résolution qui se rejoue sur une source appauvrie ne rend pas
   * le même verdict — c'est la même faute que relire un texte déjà traduit pour
   * en déduire sa langue d'origine.
   */
  readonly apercu: ApercuServi | null;
  /** Les noms de ceux qui écrivent, dans l'ordre d'arrivée — vide la plupart du temps. */
  readonly frappeurs: readonly string[];
  /**
   * La ligne est RETIRÉE de la vue mais pas encore du serveur (§ 12.10.4) : elle
   * garde sa place dans l'état, ce qui est la condition pour la remettre à
   * l'endroit exact d'où elle vient si le geste est annulé ou refusé.
   */
  readonly retiree: boolean;
};

export type EtatDeLaListe = {
  readonly lignes: readonly LigneDeListe[];
};

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

const carte = (valeur: unknown): Readonly<Record<string, string>> | null => {
  const brut = objet(valeur);
  if (brut === null) return null;
  const entrees = Object.entries(brut).filter((entree): entree is [string, string] => typeof entree[1] === 'string' && entree[1] !== '');
  return entrees.length === 0 ? null : Object.fromEntries(entrees);
};

/**
 * L'ORDRE — le plus récent d'abord, et ce qui n'a JAMAIS rien dit à la fin.
 *
 * Le tri est STABLE sur l'instant : deux conversations du même horodatage
 * gardent l'ordre que la passerelle a servi, qui est celui de sa propre
 * requête. Un tri qui les départagerait par identifiant ferait sauter des
 * lignes sous les yeux du lecteur à chaque repeinture, pour rien.
 *
 * Les lignes RETIRÉES gardent leur rang : c'est ce qui permet de les remettre
 * exactement où elles étaient quand le geste est annulé.
 */
export const ordonnees = (etat: EtatDeLaListe): readonly LigneDeListe[] =>
  [...etat.lignes]
    .map((ligne, rang) => ({ ligne, rang }))
    .sort((a, b) => {
      const instantA = a.ligne.quand === null ? -1 : Date.parse(a.ligne.quand) || -1;
      const instantB = b.ligne.quand === null ? -1 : Date.parse(b.ligne.quand) || -1;
      return instantB === instantA ? a.rang - b.rang : instantB - instantA;
    })
    .map(({ ligne }) => ligne);

const remplace = (etat: EtatDeLaListe, id: string, changement: (ligne: LigneDeListe) => LigneDeListe): EtatDeLaListe => ({
  lignes: etat.lignes.map((ligne) => (ligne.id === id ? changement(ligne) : ligne)),
});

export type MiseAJour = {
  readonly id: string;
  readonly quand: string | null;
} & SourceDApercu;

/**
 * `conversation:updated` — l'aperçu DÉJÀ descendu au prisme du lecteur et
 * l'instant qui décide du rang.
 *
 * `lastMessagePreview` peut valoir `''` (un message qui n'est qu'une position),
 * et c'est une VALEUR : la ligne dit alors qu'elle n'a pas de texte. Seule son
 * ABSENCE laisse l'aperçu précédent en place — un événement qui ne parle pas
 * d'aperçu ne doit pas en effacer un.
 */
export const miseAJourDe = (charge: unknown): MiseAJour | null => {
  const brut = objet(charge);
  const id = chaine(brut?.conversationId);
  if (brut === null || id === null) return null;
  return {
    id,
    quand: chaine(brut.lastMessageAt),
    apercu: typeof brut.lastMessagePreview === 'string' ? brut.lastMessagePreview : null,
    apercuTraductions: carte(brut.lastMessageTranslations),
    apercuLangueOriginale: chaine(brut.lastMessageOriginalLanguage),
  };
};

/**
 * `langues` est le prisme ORDONNÉ du lecteur, servi par le document
 * (`data-langues`). Il entre ICI parce que la descente se fait à l'ARRIVÉE de
 * la charge — le seul instant où la carte des traductions existe encore.
 */
export const bouge = (etat: EtatDeLaListe, maj: MiseAJour, langues: readonly string[]): EtatDeLaListe =>
  remplace(etat, maj.id, (ligne) => ({
    ...ligne,
    quand: maj.quand ?? ligne.quand,
    ...(maj.apercu === null ? {} : { apercu: apercuServi(maj, langues) }),
  }));

export type ComptesNonLus = { readonly id: string; readonly nonLus: number };

/** `conversation:unread-updated` — `{ conversationId, unreadCount, bridge }` (`emitUnreadCountsToRecipients.ts`). */
export const comptesDe = (charge: unknown): ComptesNonLus | null => {
  const brut = objet(charge);
  const id = chaine(brut?.conversationId);
  const nonLus = brut?.unreadCount;
  if (id === null || typeof nonLus !== 'number' || !Number.isFinite(nonLus)) return null;
  return { id, nonLus: Math.max(0, Math.trunc(nonLus)) };
};

export const compte = (etat: EtatDeLaListe, { id, nonLus }: ComptesNonLus): EtatDeLaListe =>
  remplace(etat, id, (ligne) => ({ ...ligne, nonLus }));

export type Frappeur = { readonly conversation: string; readonly nom: string };

/**
 * `typing:start` / `typing:stop` — `TypingEvent { userId, username, displayName,
 * conversationId, isTyping }` (`StatusHandler.ts:271-277`). Le nom AFFICHÉ prime
 * sur le pseudo : c'est celui que la ligne montre partout ailleurs.
 */
export const frappeurDe = (charge: unknown): Frappeur | null => {
  const brut = objet(charge);
  const conversation = chaine(brut?.conversationId);
  const nom = chaine(brut?.displayName) ?? chaine(brut?.username);
  if (conversation === null || nom === null) return null;
  return { conversation, nom };
};

export const frappe = (etat: EtatDeLaListe, frappeur: Frappeur, actif: boolean): EtatDeLaListe =>
  remplace(etat, frappeur.conversation, (ligne) => ({
    ...ligne,
    frappeurs: actif
      ? ligne.frappeurs.includes(frappeur.nom)
        ? ligne.frappeurs
        : [...ligne.frappeurs, frappeur.nom]
      : ligne.frappeurs.filter((nom) => nom !== frappeur.nom),
  }));

/** Le retrait OPTIMISTE — la ligne quitte la vue, garde son rang, et peut revenir. */
export const retire = (etat: EtatDeLaListe, id: string): EtatDeLaListe =>
  remplace(etat, id, (ligne) => ({ ...ligne, retiree: true }));

export const remets = (etat: EtatDeLaListe, id: string): EtatDeLaListe =>
  remplace(etat, id, (ligne) => ({ ...ligne, retiree: false }));

export const metEnSourdine = (etat: EtatDeLaListe, id: string, sourdine: boolean): EtatDeLaListe =>
  remplace(etat, id, (ligne) => ({ ...ligne, sourdine }));

export const ligneDe = (etat: EtatDeLaListe, id: string): LigneDeListe | null =>
  etat.lignes.find((ligne) => ligne.id === id) ?? null;
