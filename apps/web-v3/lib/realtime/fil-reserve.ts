import type { PieceJointe } from '@/lib/api/fil';
import { lieuDeMessage, type Lieu } from '@/lib/api/lieu';

import type { Contexte } from './fil-contexte';
import * as F from './fil-etat';

/**
 * LA FILE HORS LIGNE — mémoriser une bulle qu'on ne peut pas envoyer, l'en
 * oublier une fois partie, et la relire au montage. Extrait de
 * `participate.ts` (§ 4 étape 0 de la spécification #5163 : le module était
 * hors budget, 1 056 lignes). Aucun comportement ne change — seule la
 * frontière du fichier bouge.
 */

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur) ? (valeur as Readonly<Record<string, unknown>>) : null;

const chaine = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null);

export const GENRE_PAR_TYPE: readonly (readonly [string, PieceJointe['genre']])[] = [
  ['image/', 'image'],
  ['audio/', 'audio'],
  ['video/', 'video'],
];

/** Les pièces d'une bulle qui n'est pas encore partie : nommées et pesées, sans adresse — rien ne se télécharge. */
export const piecesLocales = (clientMessageId: string, fichiers: readonly File[]): readonly PieceJointe[] =>
  fichiers.map((fichier, rang) => ({
    id: `${clientMessageId}:${rang}`,
    genre: GENRE_PAR_TYPE.find(([prefixe]) => fichier.type.startsWith(prefixe))?.[1] ?? 'fichier',
    nom: fichier.name,
    url: '',
    // Rien à jouer tant que rien n'est parti : la piste d'une pièce locale est
    // son adresse — vide, comme elle.
    piste: '',
    octets: fichier.size,
    dureeMs: null,
    largeur: null,
    hauteur: null,
    transcription: null,
    transcriptionOriginale: null,
    langueDeTranscription: null,
    langueServie: null,
  }));

export const fichiersDe = (valeur: unknown): readonly File[] =>
  (Array.isArray(valeur) ? valeur : []).filter((entree): entree is File => entree instanceof Blob);

/**
 * LE LIEU D'UNE BULLE EN RÉSERVE (#5061) — écrit sous la MÊME forme que la
 * passerelle le sert (`latitude`/`longitude`/`name`/`address`), pour que
 * `lieuDeMessage` — le site UNIQUE de sa lecture (`lib/api/lieu.ts`) — le
 * relise à l'identique. Une position partagée hors ligne est un envoi COMME
 * un autre : sans elle, la file rendait un message VIDE, que la passerelle
 * refuse en 400 et que `relisLaFile` jetait en silence au rechargement — un
 * envoi perdu sans un mot, ce que le § 7 interdit.
 */
const lieuEnReserve = (lieu: Lieu | null): Readonly<Record<string, unknown>> | null =>
  lieu === null ? null : { latitude: lieu.latitude, longitude: lieu.longitude, name: lieu.nom, address: lieu.adresse };

export const memoriseHorsLigne = async (ctx: Contexte, bulle: F.Bulle): Promise<void> => {
  if (bulle.clientMessageId === null || ctx.cles === null) return;
  const lieu = lieuEnReserve(bulle.lieu);
  await ctx.r
    .ecris(`${ctx.cles.file}${bulle.ecritA ?? ''}:${bulle.clientMessageId}`, {
      clientMessageId: bulle.clientMessageId,
      texte: bulle.texte,
      langue: bulle.langueOriginale,
      ecritA: bulle.ecritA,
      pieces: ctx.fichiers.get(bulle.clientMessageId) ?? [],
      ...(lieu === null ? {} : { lieu }),
    })
    .catch(() => undefined);
};

export const oublieHorsLigne = async (ctx: Contexte, clientMessageId: string): Promise<void> => {
  ctx.fichiers.delete(clientMessageId);
  if (ctx.cles === null) return;
  const cles = await ctx.r.cles(ctx.cles.file).catch(() => []);
  await Promise.all(cles.filter((cle) => cle.endsWith(`:${clientMessageId}`)).map((cle) => ctx.r.efface(cle)));
};

/** Ce qui attendait dans la réserve à l'ouverture (une page rechargée hors ligne) reprend sa place. */
export const relisLaFile = async (ctx: Contexte): Promise<void> => {
  if (ctx.cles === null) return;
  const cles = await ctx.r.cles(ctx.cles.file).catch(() => []);
  for (const cle of cles) {
    const entree = objet(await ctx.r.lis(cle).catch(() => null));
    const clientMessageId = chaine(entree?.clientMessageId);
    const texte = chaine(entree?.texte) ?? '';
    const fichiers = fichiersDe(entree?.pieces);
    // UN LIEU SEUL EST UN MESSAGE (#5061) — la passerelle l'admet sans texte
    // ni pièce (`SendMessageBodySchema.refine`, `Boolean(data.location)`) :
    // le compter ici avec les deux autres porteurs, sinon la file jetterait
    // une position partagée hors ligne au rechargement.
    const lieu = lieuDeMessage({ location: entree?.lieu });
    if (clientMessageId === null || (texte === '' && fichiers.length === 0 && lieu === null)) continue;
    if (fichiers.length > 0) ctx.fichiers.set(clientMessageId, fichiers);
    ctx.etat = F.insere(ctx.etat, {
      ...F.bulleOptimiste({
        clientMessageId,
        texte,
        auteur: ctx.config.nom,
        auteurId: ctx.config.moi,
        langue: chaine(entree?.langue) ?? ctx.config.langues[0] ?? 'fr',
        horsLigne: true,
        maintenant: Date.parse(chaine(entree?.ecritA) ?? '') || Date.now(),
        ...(lieu === null ? {} : { lieu }),
      }),
      pieces: piecesLocales(clientMessageId, fichiers),
    });
  }
};
