import type { IncomingMessage, ServerResponse } from 'node:http';

import type { PieceDeBouchon } from './bouchon-fil';
import type { Identite } from './bouchon-socket';

/**
 * LE BOUCHON TUS (#5390) — `POST /api/v1/uploads`
 * (`services/gateway/src/routes/uploads/tus-handler.ts:297-343` la création,
 * `:581-622` le corps de fin) et `DELETE /api/v1/posts/media/:mediaId`
 * (`routes/posts/media.ts:45`), les deux routes que
 * `lib/api/medias-de-post.ts` appelle.
 *
 * **CE BOUCHON NE JOUE QUE LA « CREATION-WITH-UPLOAD » COMPLÈTE.**
 * `televerseMediaDePost` envoie toujours l'octet ENTIER dans le corps du
 * `POST` : aucun spec e2e n'a donc besoin du repli PATCH — celui-ci est
 * prouvé par `__tests__/medias-de-post.test.ts`, contre un `recuperer` cousu
 * qui n'ouvre aucun serveur HTTP. Un bouchon qui jouerait les deux chemins
 * ici les jouerait devant PERSONNE.
 *
 * TROIS GARDES, dans l'ordre où `tus-handler.ts` les pose :
 *
 *   1. une créance (`Authorization: Bearer` ou `X-Session-Token`) — sinon 401,
 *      TEXTE BRUT (`onUploadCreate`, jamais de JSON sur un refus) ;
 *   2. `uploadcontext: post` (`Upload-Metadata`, décodé depuis le base64 du
 *      protocole TUS) — c'est ce qui fait écrire un `PostMedia` plutôt qu'un
 *      `MessageAttachment` (`isPostMediaUploadContext`) ;
 *   3. un COMPTE ENREGISTRÉ — un invité y reçoit 403, MÊME TEXTE que la
 *      passerelle réelle (`onUploadCreate:325-331`).
 *
 * Les octets sont servis PAR LA MÊME ROUTE que les pièces de message
 * (`GET /attachments/file/:id/:name`, `bouchon-fil.ts`) : ce bouchon écrit
 * dans le MÊME `pieces: Map<string, PieceDeBouchon>` que `deposeUnePiece`
 * (`serveurs.ts`), avec la MÊME forme de `fileUrl` — un site de lecture, deux
 * producteurs.
 */

export type MediaDePostDeBouchon = {
  readonly id: string;
  readonly uploaderId: string;
  reclame: boolean;
};

export type EtatDesUploadsDeBouchon = {
  readonly creanceDe: (requete: IncomingMessage) => Identite | null;
  readonly pieces: Map<string, PieceDeBouchon>;
  /** Les `PostMedia` téléversés et pas encore rattachés à un post — `duCompte` les réclame sur `mediaIds`. */
  readonly mediasDePostEnAttente: Map<string, MediaDePostDeBouchon>;
};

const decodeB64 = (valeur: string): string => Buffer.from(valeur, 'base64').toString('utf8');

/** `Upload-Metadata: filename <b64>,filetype <b64>,uploadcontext <b64>` — le protocole TUS. */
const metadonneesDuTeleversement = (entete: string | string[] | undefined): Record<string, string> => {
  const brut = Array.isArray(entete) ? (entete[0] ?? '') : (entete ?? '');
  const carte: Record<string, string> = {};
  brut
    .split(',')
    .map((paire) => paire.trim())
    .filter((paire) => paire !== '')
    .forEach((paire) => {
      const espace = paire.indexOf(' ');
      if (espace === -1) return;
      carte[paire.slice(0, espace)] = decodeB64(paire.slice(espace + 1));
    });
  return carte;
};

let compteur = 0;

export const routesDesUploads =
  (etat: EtatDesUploadsDeBouchon) =>
  ({
    requete,
    url,
    corps,
    reponse,
  }: {
    readonly requete: IncomingMessage;
    readonly url: URL;
    readonly corps: Buffer;
    readonly reponse: ServerResponse;
  }): boolean => {
    if (url.pathname !== '/api/v1/uploads' || requete.method !== 'POST') return false;

    const texteBrut = (statut: number, corpsTexte: string): void => {
      reponse.writeHead(statut, { 'content-type': 'text/plain' });
      reponse.end(corpsTexte);
    };
    const jsonDeFin = (donnees: unknown): void => {
      reponse.writeHead(200, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify(donnees));
    };

    const identite = etat.creanceDe(requete);
    if (identite === null) {
      texteBrut(401, 'Authentication required\n');
      return true;
    }

    const meta = metadonneesDuTeleversement(requete.headers['upload-metadata']);
    if (meta.uploadcontext !== 'post') {
      texteBrut(400, 'Unsupported upload context\n');
      return true;
    }
    if (identite.genre !== 'membre') {
      texteBrut(403, 'Post media upload requires an identifiable registered account\n');
      return true;
    }

    compteur += 1;
    const id = `media-bouchon-${compteur}`;
    const nom = meta.filename ?? 'media';
    const piece: PieceDeBouchon = {
      id,
      fileUrl: `/api/v1/attachments/file/${id}/${encodeURIComponent(nom)}`,
      originalName: nom,
      mimeType: meta.filetype ?? 'application/octet-stream',
      fileSize: corps.length,
      octets: corps,
    };
    etat.pieces.set(id, piece);
    etat.mediasDePostEnAttente.set(id, { id, uploaderId: identite.id, reclame: false });

    jsonDeFin({
      success: true,
      data: {
        attachment: {
          id,
          fileName: piece.originalName,
          originalName: piece.originalName,
          mimeType: piece.mimeType,
          fileSize: piece.fileSize,
          fileUrl: piece.fileUrl,
          uploadedBy: identite.id,
          isAnonymous: false,
          createdAt: new Date().toISOString(),
        },
      },
    });
    return true;
  };

/**
 * `DELETE /api/v1/posts/media/:mediaId` — même prédicat que
 * `claimableMediaWhere` : réclamable seulement par SON téléverseur, et
 * seulement tant qu'AUCUN post ne l'a rattaché (`routes/posts/media.ts:27`).
 */
export const routesDesMediasDePost =
  (etat: EtatDesUploadsDeBouchon) =>
  ({
    requete,
    url,
    json,
  }: {
    readonly requete: IncomingMessage;
    readonly url: URL;
    readonly json: (corps: unknown, statut?: number) => void;
  }): boolean => {
    const correspond = /^\/api\/v1\/posts\/media\/([^/]+)$/.exec(url.pathname);
    if (correspond === null || requete.method !== 'DELETE') return false;

    const identite = etat.creanceDe(requete);
    if (identite === null) {
      json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);
      return true;
    }

    const id = correspond[1] ?? '';
    const media = etat.mediasDePostEnAttente.get(id);
    if (media === undefined || media.reclame || media.uploaderId !== identite.id) {
      json({ success: false, error: 'Media not found' }, 404);
      return true;
    }

    etat.mediasDePostEnAttente.delete(id);
    etat.pieces.delete(id);
    json({ success: true, data: { message: 'Media deleted' } });
    return true;
  };
