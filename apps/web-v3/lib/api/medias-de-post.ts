import { chaine, objet } from './lecture';
import { baseDeLaPasserelle } from './passerelle';
import type { Recuperateur } from './publication';

/**
 * LE TRANSPORT D'UN MÉDIA DE POST (#5390) — TUS, la SEULE porte qui crée un
 * `PostMedia` (§ 2.1 de la spécification).
 *
 * **IL N'EXISTE AUCUNE ROUTE MULTIPART QUI CRÉE UN `PostMedia`.**
 * `POST /attachments/upload` (`services/gateway/src/routes/attachments/
 * upload.ts:59-206`) ne crée que des `MessageAttachment`
 * (`AttachmentService.uploadMultiple`). La capacité EST exposée — par TUS
 * (`@tus/server`, `services/gateway/src/routes/uploads/tus-handler.ts`) — et
 * ce module la relaie CÔTÉ SERVEUR : le « sans JavaScript » du critère de fin
 * est une propriété du NAVIGATEUR (un `<input type="file">` dans un
 * `<form method="post" enctype="multipart/form-data">`), pas de la porte, qui
 * reste un gestionnaire de route Node — elle a le droit de parler TUS.
 *
 * `POST /api/v1/uploads` (enregistrement : `route-registration.ts:263`,
 * `basePath: ${API_PREFIX}/uploads`) sert l'extension TUS
 * **creation-with-upload** : un `POST` qui porte
 * `Content-Type: application/offset+octet-stream` et le corps ENTIER crée ET
 * remplit l'upload en une requête ; `onUploadFinish`
 * (`tus-handler.ts:581-622`) rend alors directement
 * `{ success: true, data: { attachment: { id, … } } }` — **`data.attachment.id`
 * EST l'identifiant `PostMedia`** à poser dans `mediaIds` (`publie()`,
 * `lib/api/publication.ts`).
 *
 * `uploadcontext` DOIT valoir `post` (`isPostMediaUploadContext`,
 * `@meeshy/shared/types/attachment:466-471`) : c'est ce qui fait écrire la
 * table `PostMedia` plutôt que `MessageAttachment`
 * (`tus-handler.ts:449-505`) — et ce qui EXIGE un compte enregistré
 * (`onUploadCreate`, `:325-331` ; un jeton invité y reçoit 403).
 *
 * LE REPLI PATCH (§ 2.1, dernier paragraphe). Si la réponse de création ne
 * porte pas le corps de fin — un serveur TUS peut répondre à la création
 * SANS avoir encore reçu la totalité de l'offset annoncé, ou choisir de ne
 * rendre le corps qu'au dernier octet reçu —, ce module lit `Location` +
 * `Upload-Offset` et envoie le RESTE des octets par un `PATCH`. Un seul repli
 * suffit ici : ce module n'envoie jamais un fichier en plusieurs morceaux
 * (§ étape 4 de la spécification — un seul fichier en vol, borne mémoire et
 * 3G), donc l'écart entre l'offset annoncé et l'offset reçu ne peut être que
 * le corps entier ou rien.
 */

const CHEMIN_DES_UPLOADS = '/api/v1/uploads';
const CHEMIN_DES_MEDIAS = '/api/v1/posts/media';

const REFUS_TELEVERSEMENT = 'Le service ne répond pas.';

/** `Upload-Metadata` — les valeurs voyagent en base64 (protocole TUS, valeurs ASCII garanties ici : nom et type MIME). */
const enBase64 = (valeur: string): string => Buffer.from(valeur, 'utf8').toString('base64');

const enTeteDeMetadonnees = (nom: string, type: string): string =>
  `filename ${enBase64(nom)},filetype ${enBase64(type)},uploadcontext ${enBase64('post')}`;

const nombreEnTete = (valeur: string | null): number | null => {
  if (valeur === null) return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
};

/** Le corps d'une réponse TUS — JSON à la fin (`onUploadFinish`), texte brut sur un refus (`onUploadCreate`). */
const lisLeCorps = async (reponse: Response): Promise<{ readonly brut: string; readonly json: Readonly<Record<string, unknown>> | null }> => {
  const brut = await reponse.text().catch(() => '');
  try {
    return { brut, json: objet(JSON.parse(brut)) };
  } catch {
    return { brut, json: null };
  }
};

const idDeLAttachment = (json: Readonly<Record<string, unknown>> | null): string | null =>
  json?.success === true ? chaine(objet(objet(json.data)?.attachment)?.id) : null;

export type IssueDeTeleversement =
  | { readonly genre: 'televerse'; readonly id: string }
  | { readonly genre: 'refus'; readonly message: string; readonly statut: number | null };

/**
 * TÉLÉVERSE UN FICHIER ET RÉCLAME UN `PostMedia`. Un seul fichier à la fois
 * (l'appelant — `composer-porte.ts` — les envoie séquentiellement) : la
 * mémoire de la porte ne tient jamais plus d'un fichier en vol, ce que
 * demande une 3G rurale autant qu'un conteneur borné.
 */
export const televerseMediaDePost = async ({
  jeton,
  fichier,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly fichier: { readonly nom: string; readonly type: string; readonly octets: Uint8Array };
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDeTeleversement> => {
  const appelle = recuperer ?? ((u: string, o: RequestInit) => fetch(u, o));
  const racine = base ?? baseDeLaPasserelle();

  const creation = await appelle(`${racine}${CHEMIN_DES_UPLOADS}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jeton}`,
      'tus-resumable': '1.0.0',
      'upload-length': String(fichier.octets.byteLength),
      'upload-metadata': enTeteDeMetadonnees(fichier.nom, fichier.type),
      'content-type': 'application/offset+octet-stream',
    },
    body: Buffer.from(fichier.octets),
  }).catch(() => null);

  if (creation === null) return { genre: 'refus', message: REFUS_TELEVERSEMENT, statut: null };

  const { brut, json } = await lisLeCorps(creation);
  const id = idDeLAttachment(json);
  if (id !== null) return { genre: 'televerse', id };

  // LE REPLI — le corps de fin n'est pas encore là, mais l'upload a été créé
  // (un `Location` en témoigne) : on complète par un `PATCH`.
  const location = creation.headers.get('location');
  if (creation.ok && location !== null) {
    const adresseDuPatch = location.startsWith('http') ? location : `${racine}${location}`;
    const offsetDecrit = nombreEnTete(creation.headers.get('upload-offset')) ?? 0;

    const patch = await appelle(adresseDuPatch, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${jeton}`,
        'tus-resumable': '1.0.0',
        'upload-offset': String(offsetDecrit),
        'content-type': 'application/offset+octet-stream',
      },
      body: Buffer.from(fichier.octets.slice(offsetDecrit)),
    }).catch(() => null);

    if (patch === null) return { genre: 'refus', message: REFUS_TELEVERSEMENT, statut: null };

    const corpsDuPatch = await lisLeCorps(patch);
    const idDuPatch = idDeLAttachment(corpsDuPatch.json);
    if (idDuPatch !== null) return { genre: 'televerse', id: idDuPatch };

    return { genre: 'refus', message: corpsDuPatch.brut.trim() || REFUS_TELEVERSEMENT, statut: patch.status };
  }

  return { genre: 'refus', message: brut.trim() || REFUS_TELEVERSEMENT, statut: creation.status };
};

/**
 * RELÂCHE UN MÉDIA EN ATTENTE — `DELETE /api/v1/posts/media/:mediaId`
 * (`routes/posts/media.ts:45`). MEILLEUR EFFORT, et c'est délibéré : relâcher
 * est un nettoyage, jamais un état d'écran. Un orphelin serveur — le média
 * reste en base, `postId: null`, jamais réclamé — est la conséquence
 * ACCEPTÉE d'un relâchement qui échoue (§ 9 Q5 de la spécification) ; refaire
 * échouer la publication ELLE-MÊME pour ce nettoyage serait pire que
 * l'orphelin qu'il évite.
 */
export const relacheMediaDePost = async ({
  jeton,
  id,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly id: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<void> => {
  const appelle = recuperer ?? ((u: string, o: RequestInit) => fetch(u, o));
  await appelle(`${base ?? baseDeLaPasserelle()}${CHEMIN_DES_MEDIAS}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${jeton}` },
  }).catch(() => null);
};
