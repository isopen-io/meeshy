import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { AdminButton } from '@/components/admin/button';
import { AdminFormActions, AdminFormError, AdminFormSheet } from '@/components/admin/form';
import { AdminEmptyState, AdminErrorState, AdminSkeleton } from '@/components/admin/states';
import { BRAND, INK2 } from '@/components/admin/tone';
import type { AdminDeps } from '@/lib/api/admin';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import {
  adminProfileImageCandidatesQueryKey,
  loadAdminProfileImageCandidates,
  performAdminImageUpload,
  setAdminUserImage,
  type AdminImageChoice,
} from '@/lib/api/admin-user-images';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import type { ProfileImageKind } from '@/lib/api/profile';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { PROFILE_IMAGE_ACCEPT } from '@/lib/profile/image-upload';

/**
 * **LA PHOTO OU LA BANNIÈRE D'UN MEMBRE** (#8217) — la feuille, ouverte depuis
 * sa fiche. Deux voies, une seule écriture (`PUT …/profile-images/:kind`) :
 *
 * - **Téléverser** : le fichier suit le chemin du profil (recompression,
 *   `POST /attachments/upload`), puis son adresse est posée.
 * - **Choisir** : parmi les images que le membre a DÉJÀ publiées en public.
 *   Une pièce jointe de message, une story ou un post restreint ne sont jamais
 *   proposés — c'est la passerelle qui tient la règle, la feuille n'offre que
 *   ce qu'elle a servi.
 *
 * Un seul geste en vol à la fois : tant qu'une écriture n'est pas revenue,
 * les autres boutons attendent — deux poses concurrentes laisseraient la
 * fiche afficher celle qui revient la PREMIÈRE, pas la dernière demandée.
 *
 * ## Les pièces du kit (#9463)
 *
 * Feuille, gestes, refus, attente, vide et échec sont ceux de `components/admin`.
 * Les candidates qu'on n'a pas pu lire se disent par `AdminErrorState`, avec son
 * « Réessayer » : un échec sans issue obligeait à fermer et rouvrir la feuille.
 * La grille des candidates reste ici : c'est un sélecteur de médias, que le kit
 * n'a pas.
 */

const TITRES: Readonly<Record<ProfileImageKind, AdminPlainCatalogKey>> = {
  avatar: 'admin.gallery.avatar',
  banner: 'admin.gallery.banner',
};

type Refus = 'offline' | 'unreadable' | 'failed' | 'forbidden' | null;

const REFUS: Readonly<Record<Exclude<Refus, null>, AdminPlainCatalogKey>> = {
  offline: 'admin.images.offline',
  unreadable: 'admin.images.unreadable',
  failed: 'admin.images.failed',
  forbidden: 'admin.prefs.reserved',
};

/** Un 403 est un RANG insuffisant, jamais « échec » : l'administrateur doit savoir que réessayer n'y fera rien. */
const refusDuStatut = (status: number): Exclude<Refus, null> => (status === 403 ? 'forbidden' : 'failed');

export function AdminUserImageSheet({
  membre,
  kind,
  language,
  onClose,
  onSaved,
  onAnnounce,
  onPreview,
  onFailed,
  deps = apiDeps,
  isOnline = () => navigator.onLine,
}: {
  readonly membre: AdminUserDetail;
  readonly kind: ProfileImageKind;
  readonly language: AdminLanguage;
  readonly onClose: () => void;
  readonly onSaved: (membre: AdminUserDetail, kind: ProfileImageKind) => void;
  readonly onAnnounce: (texte: string) => void;
  /**
   * L'APERÇU IMMÉDIAT (#8289) — l'image choisie, avant que la passerelle ne
   * réponde : une adresse `blob:` pour un fichier, l'adresse de la candidate
   * pour une image publique, `null` pour un retrait. La fiche la montre à la
   * place de la valeur servie jusqu'à `onSaved` ou `onFailed`.
   */
  readonly onPreview?: (kind: ProfileImageKind, url: string | null) => void;
  /** Le geste a échoué : la fiche retire son aperçu et dit pourquoi. */
  readonly onFailed?: (kind: ProfileImageKind, message: string) => void;
  readonly deps?: AdminDeps;
  readonly isOnline?: () => boolean;
}) {
  const [enVol, setEnVol] = useState<string | null>(null);
  const [refus, setRefus] = useState<Refus>(null);
  const fichier = useRef<HTMLInputElement | null>(null);

  const candidates = useQuery({
    queryKey: adminProfileImageCandidatesQueryKey(membre.id),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminProfileImageCandidates({ ...deps, userId: membre.id, offset: 0, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

  const actuelle = membre[kind];

  function conclure(aJour: AdminUserDetail, cle: AdminPlainCatalogKey) {
    onAnnounce(translateAdmin(language, cle));
    onSaved(aJour, kind);
    onClose();
  }

  function echouer(cause: Exclude<Refus, null>) {
    const message = translateAdmin(language, REFUS[cause]);
    setRefus(cause);
    onAnnounce(message);
    onFailed?.(kind, message);
  }

  async function poser(geste: string, choix: AdminImageChoice, apercu: string | null) {
    if (enVol !== null) return;
    setEnVol(geste);
    setRefus(null);
    onPreview?.(kind, apercu);
    const resultat = await setAdminUserImage({ ...deps, userId: membre.id, kind, choice: choix });
    setEnVol(null);
    if (!resultat.ok) {
      echouer(refusDuStatut(resultat.status));
      return;
    }
    conclure(resultat.data, choix.source === 'none' ? 'admin.images.removed' : 'admin.images.saved');
  }

  async function televerser(file: File) {
    if (enVol !== null) return;
    setEnVol('upload');
    setRefus(null);
    if (typeof URL.createObjectURL === 'function') onPreview?.(kind, URL.createObjectURL(file));
    const issue = await performAdminImageUpload({ userId: membre.id, kind, file, deps: { ...deps, isOnline } });
    setEnVol(null);
    if (issue.status === 'saved') {
      conclure(issue.membre, 'admin.images.saved');
      return;
    }
    if (issue.status === 'cancelled') {
      onFailed?.(kind, '');
      return;
    }
    echouer(issue.status === 'refused' ? refusDuStatut(issue.httpStatus ?? 0) : issue.status);
  }

  const occupe = enVol !== null;
  const liste = candidates.data?.candidates ?? [];

  return (
    <AdminFormSheet language={language} title={translateAdmin(language, TITRES[kind])} onClose={onClose} data={{ 'data-admin-image-sheet': kind }}>
      <figure
        className={`m-0 grid place-items-center overflow-hidden ${kind === 'avatar' ? 'mx-auto size-24 rounded-full' : 'aspect-[3/1] w-full rounded-card'}`}
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }}
        data-admin-image-current={actuelle === '' ? '' : actuelle}
      >
        {actuelle === '' ? (
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.gallery.empty')}
          </span>
        ) : (
          <img src={attachmentSrc(actuelle)} alt={translateAdmin(language, 'admin.images.current')} className="block size-full object-cover" />
        )}
      </figure>

      <input
        ref={fichier}
        type="file"
        accept={PROFILE_IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-admin-image-file=""
        onChange={(event) => {
          const choisi = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (choisi !== undefined) void televerser(choisi);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <AdminButton tone="primary" disabled={occupe} busy={enVol === 'upload'} data={{ 'data-admin-image-upload': '' }} onClick={() => fichier.current?.click()}>
          {translateAdmin(language, enVol === 'upload' ? 'admin.images.uploading' : 'admin.images.upload')}
        </AdminButton>
        {actuelle === '' ? null : (
          <AdminButton disabled={occupe} data={{ 'data-admin-image-remove': '' }} onClick={() => void poser('none', { source: 'none' }, null)}>
            {translateAdmin(language, 'admin.images.remove')}
          </AdminButton>
        )}
      </div>

      {refus === null ? null : <AdminFormError text={translateAdmin(language, REFUS[refus])} data={{ 'data-admin-image-refused': refus }} />}

      <section className="grid gap-2" aria-labelledby={`admin-image-choose-${kind}`}>
        <h3 id={`admin-image-choose-${kind}`} className="text-body font-semibold">
          {translateAdmin(language, 'admin.images.choose')}
        </h3>
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.images.chooseHint')}
        </p>
        {candidates.isPending ? (
          <AdminSkeleton rows={2} language={language} />
        ) : candidates.isError ? (
          <AdminErrorState language={language} message={translateAdmin(language, 'admin.images.candidatesFailed')} onRetry={() => void candidates.refetch()} />
        ) : liste.length === 0 ? (
          <AdminEmptyState title={translateAdmin(language, 'admin.images.noCandidate')} data={{ 'data-admin-image-candidates-empty': '' }} />
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="list">
            {liste.map((candidate, rang) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  disabled={occupe}
                  data-admin-image-candidate={candidate.id}
                  aria-label={translateAdmin(language, 'admin.images.useCandidate', { n: String(rang + 1), total: String(liste.length) })}
                  onClick={() => void poser(candidate.id, { source: 'media', mediaId: candidate.id }, candidate.fileUrl)}
                  className="grid aspect-square w-full place-items-center overflow-hidden rounded-chip focus-visible:outline-2"
                  style={{
                    minHeight: 44,
                    opacity: occupe && enVol !== candidate.id ? 0.5 : 1,
                    outline: candidate.fileUrl === actuelle ? `2px solid ${BRAND}` : undefined,
                    outlineColor: BRAND,
                    backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)',
                  }}
                >
                  <img
                    src={attachmentSrc(candidate.thumbnailUrl ?? candidate.fileUrl)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="block size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AdminFormActions language={language} onCancel={onClose} />
    </AdminFormSheet>
  );
}
