import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import type { Recuperateur } from '@/lib/api/compte';
import { ecrisUnePreference, lisLesPreferences } from '@/lib/api/preferences';
import { demandeDeSuppression, exportDesDonnees } from '@/lib/api/reglages-details';
import { estUneCleDeConfidentialite, REGLAGES_DETAILS, type CleDeConfidentialite } from '@/lib/contenu/reglages-details';

import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import {
  documentDeLaConfidentialite,
  documentDeLaSuppression,
  documentDeLExport,
  documentDesMessages,
  documentDesReglagesDeDocument,
  documentDuHubMedias,
  documentDuStubMedias,
  type EtatDeLaConfidentialite,
} from './reglages-details-vue';
import { documentDePanne } from './vue';

/**
 * LES PORTES DES QUATRE RÉGLAGES-DÉTAILS (travail `reglages-details`) — le
 * MÊME patron que `reglages-porte.ts` et `prefs-porte.ts` : un jeton ? la
 * passerelle l'accepte-t-elle ? a-t-elle répondu ? Origine vérifiée AVANT
 * tout POST, Post/Redirect/Get, un échec qui RE-LIT le serveur plutôt que
 * d'inventer un état.
 *
 * `/settings/media/audio`, `/settings/media/video` et `/settings/message` NE
 * PARLENT PAS À LA PASSERELLE (régime 3) : ils ne demandent qu'un jeton, comme
 * le carrefour et `/settings/application`.
 */

const versLaConnexion = (chemin: string): Response =>
  new Response(null, {
    status: 302,
    headers: { location: `/login?returnUrl=${encodeURIComponent(chemin)}`, 'cache-control': CACHE_PRIVE },
  });

const avecJeton = async (
  requete: Request,
  chemin: string,
  suite: (jeton: string) => Promise<Response>,
): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(chemin);
  return suite(jeton);
};

// ─── /settings/privacy ──────────────────────────────────────────────────────

const CHEMIN_PRIVACY = '/settings/privacy';

const etatDeConfidentialite = (
  document: Readonly<Record<string, unknown>>,
  options: { readonly regleAppliquee: CleDeConfidentialite | null; readonly echec: boolean },
): EtatDeLaConfidentialite => ({
  reglages: Object.fromEntries(
    (['showOnlineStatus', 'showLastSeen', 'showReadReceipts', 'showTypingIndicator'] as const).map((cle) => [
      cle,
      document[cle] !== false,
    ]),
  ) as Record<CleDeConfidentialite, boolean>,
  regleAppliquee: options.regleAppliquee,
  echec: options.echec,
});

const sertLaConfidentialite = async ({
  jeton,
  regleAppliquee,
  echec,
  recuperer,
}: {
  readonly jeton: string;
  readonly regleAppliquee: CleDeConfidentialite | null;
  readonly echec: boolean;
  readonly recuperer?: Recuperateur;
}): Promise<Response> => {
  const issue = await lisLesPreferences({ jeton, categories: ['privacy'], recuperer });
  if (issue.genre === 'session-expiree') return versLaConnexion(CHEMIN_PRIVACY);
  if (issue.genre !== 'documents' || issue.documents.privacy === undefined) return rendu(documentDePanne(), 503);

  return rendu(documentDeLaConfidentialite(etatDeConfidentialite(issue.documents.privacy, { regleAppliquee, echec })));
};

const regleDeConfidentialiteDeLURL = (requete: Request): CleDeConfidentialite | null => {
  const valeur = new URL(requete.url).searchParams.get('regle');
  return valeur !== null && estUneCleDeConfidentialite(valeur) ? valeur : null;
};

export const CONFIDENTIALITE = async (requete: Request, recuperer?: Recuperateur): Promise<Response> =>
  avecJeton(requete, CHEMIN_PRIVACY, async (jeton) => {
    if (requete.method !== 'POST') {
      return sertLaConfidentialite({ jeton, regleAppliquee: regleDeConfidentialiteDeLURL(requete), echec: false, recuperer });
    }

    if (origineEtrangere(requete)) return refusDOrigine(requete);

    const formulaire = await requete.formData().catch(() => null);
    const cle = formulaire?.get('cle');
    const valeur = formulaire?.get('valeur');

    if (
      typeof cle !== 'string' ||
      !estUneCleDeConfidentialite(cle) ||
      (valeur !== 'true' && valeur !== 'false')
    ) {
      return new Response(null, { status: 400, headers: { 'cache-control': CACHE_PRIVE } });
    }

    const issue = await ecrisUnePreference({ jeton, categorie: 'privacy', champs: { [cle]: valeur === 'true' }, recuperer });
    if (issue.genre === 'session-expiree') return versLaConnexion(CHEMIN_PRIVACY);
    if (issue.genre === 'documents') {
      return redirection(`${CHEMIN_PRIVACY}?regle=${encodeURIComponent(cle)}`, { 'cache-control': CACHE_PRIVE });
    }

    return sertLaConfidentialite({ jeton, regleAppliquee: null, echec: true, recuperer });
  });

// ─── /settings/privacy/export ───────────────────────────────────────────────

const CHEMIN_EXPORT = `${CHEMIN_PRIVACY}/export`;

export const EXPORT = async (requete: Request, recuperer?: Recuperateur): Promise<Response> =>
  avecJeton(requete, CHEMIN_EXPORT, async (jeton) => {
    if (requete.method !== 'POST') {
      return rendu(documentDeLExport({ genre: 'formulaire' }));
    }

    if (origineEtrangere(requete)) return refusDOrigine(requete);

    const issue = await exportDesDonnees({ jeton, recuperer });
    if (issue.genre === 'session-expiree') return versLaConnexion(CHEMIN_EXPORT);
    if (issue.genre !== 'fait') return rendu(documentDeLExport({ genre: 'panne' }), 503);

    // UN FICHIER, PAS UNE PAGE. `GET /me/export` sert toujours un JSON
    // `{ success, data }` (§ 2.4 de la spécification, quel que soit
    // `?format=`) : c'est ici, et seulement ici, que la v3 le transforme en
    // pièce téléchargeable — `content-disposition: attachment` est ce qui
    // déclenche le téléchargement plutôt que l'affichage brut.
    return new Response(JSON.stringify(issue.document, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${REGLAGES_DETAILS.export.nomDeFichier}"`,
        'cache-control': CACHE_PRIVE,
      },
    });
  });

// ─── /settings/privacy/delete ───────────────────────────────────────────────

const CHEMIN_SUPPRESSION = `${CHEMIN_PRIVACY}/delete`;

const AVIS_DE_SUPPRESSION: Readonly<Record<Exclude<Awaited<ReturnType<typeof demandeDeSuppression>>['genre'], 'demandee' | 'session-expiree'>, string>> = {
  'mot-de-passe-invalide': REGLAGES_DETAILS.suppression.motDePasseInvalide,
  'sans-email': REGLAGES_DETAILS.suppression.sansEmail,
  'deja-en-cours': REGLAGES_DETAILS.suppression.dejaEnCours,
  'compte-introuvable': REGLAGES_DETAILS.suppression.panne,
  panne: REGLAGES_DETAILS.suppression.panne,
};

export const SUPPRESSION = async (requete: Request, recuperer?: Recuperateur): Promise<Response> =>
  avecJeton(requete, CHEMIN_SUPPRESSION, async (jeton) => {
    if (requete.method !== 'POST') {
      return rendu(documentDeLaSuppression({ genre: 'formulaire', avis: null }));
    }

    if (origineEtrangere(requete)) return refusDOrigine(requete);

    const formulaire = await requete.formData().catch(() => null);
    const phrase = formulaire?.get('confirmationPhrase');
    const motDePasse = formulaire?.get('currentPassword');

    if (typeof phrase !== 'string' || typeof motDePasse !== 'string' || motDePasse === '') {
      return rendu(documentDeLaSuppression({ genre: 'formulaire', avis: REGLAGES_DETAILS.suppression.phraseInvalide }), 422);
    }
    if (phrase !== REGLAGES_DETAILS.suppression.phraseAConfirmer) {
      return rendu(documentDeLaSuppression({ genre: 'formulaire', avis: REGLAGES_DETAILS.suppression.phraseInvalide }), 422);
    }

    const issue = await demandeDeSuppression({ jeton, confirmationPhrase: phrase, motDePasse, recuperer });
    if (issue.genre === 'session-expiree') return versLaConnexion(CHEMIN_SUPPRESSION);
    if (issue.genre === 'demandee') return rendu(documentDeLaSuppression({ genre: 'demandee' }));

    return rendu(
      documentDeLaSuppression({ genre: 'formulaire', avis: AVIS_DE_SUPPRESSION[issue.genre] }),
      issue.genre === 'mot-de-passe-invalide' ? 400 : issue.genre === 'panne' ? 503 : 409,
    );
  });

// ─── /settings/media ────────────────────────────────────────────────────────

const CHEMIN_MEDIA = '/settings/media';

/** Le hub NE DEMANDE RIEN — comme le carrefour, il n'est que des liens. */
export const HUB_MEDIAS = (requete: Request): Promise<Response> =>
  avecJeton(requete, CHEMIN_MEDIA, async () => rendu(documentDuHubMedias()));

export const STUB_AUDIO = (requete: Request): Promise<Response> =>
  avecJeton(requete, `${CHEMIN_MEDIA}/audio`, async () =>
    rendu(documentDuStubMedias(REGLAGES_DETAILS.media.audio)),
  );

export const STUB_VIDEO = (requete: Request): Promise<Response> =>
  avecJeton(requete, `${CHEMIN_MEDIA}/video`, async () =>
    rendu(documentDuStubMedias(REGLAGES_DETAILS.media.video)),
  );

// ─── /settings/media/document ───────────────────────────────────────────────

const CHEMIN_DOCUMENT = `${CHEMIN_MEDIA}/document`;

const sertLeDocument = async ({
  jeton,
  regleAppliquee,
  echec,
  recuperer,
}: {
  readonly jeton: string;
  readonly regleAppliquee: boolean;
  readonly echec: boolean;
  readonly recuperer?: Recuperateur;
}): Promise<Response> => {
  const issue = await lisLesPreferences({ jeton, categories: ['document'], recuperer });
  if (issue.genre === 'session-expiree') return versLaConnexion(CHEMIN_DOCUMENT);
  if (issue.genre !== 'documents' || issue.documents.document === undefined) return rendu(documentDePanne(), 503);

  return rendu(
    documentDesReglagesDeDocument({
      autoDownloadEnabled: issue.documents.document.autoDownloadEnabled === true,
      regleAppliquee,
      echec,
    }),
  );
};

export const DOCUMENT_MEDIAS = async (requete: Request, recuperer?: Recuperateur): Promise<Response> =>
  avecJeton(requete, CHEMIN_DOCUMENT, async (jeton) => {
    if (requete.method !== 'POST') {
      return sertLeDocument({ jeton, regleAppliquee: new URL(requete.url).searchParams.has('regle'), echec: false, recuperer });
    }

    if (origineEtrangere(requete)) return refusDOrigine(requete);

    const formulaire = await requete.formData().catch(() => null);
    const cle = formulaire?.get('cle');
    const valeur = formulaire?.get('valeur');

    if (cle !== 'autoDownloadEnabled' || (valeur !== 'true' && valeur !== 'false')) {
      return new Response(null, { status: 400, headers: { 'cache-control': CACHE_PRIVE } });
    }

    const issue = await ecrisUnePreference({
      jeton,
      categorie: 'document',
      champs: { autoDownloadEnabled: valeur === 'true' },
      recuperer,
    });
    if (issue.genre === 'session-expiree') return versLaConnexion(CHEMIN_DOCUMENT);
    if (issue.genre === 'documents') {
      return redirection(`${CHEMIN_DOCUMENT}?regle`, { 'cache-control': CACHE_PRIVE });
    }

    return sertLeDocument({ jeton, regleAppliquee: false, echec: true, recuperer });
  });

// ─── /settings/message ──────────────────────────────────────────────────────

/** Ne parle pas non plus à la passerelle (régime 3, § 2.7 de la spécification). */
export const MESSAGES = (requete: Request): Promise<Response> =>
  avecJeton(requete, '/settings/message', async () => rendu(documentDesMessages()));
