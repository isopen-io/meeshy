import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { AdminButton } from '@/components/admin/button';
import { AdminFormStatus } from '@/components/admin/form';
import { INK } from '@/components/admin/tone';
import { adminUserDetailQueryKey, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiFailure, ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES BRIQUES DE LA FICHE ÉDITABLE D'UN MEMBRE** (#8289).
 *
 * Plus de bouton « Modifier » : chaque champ est éditable là où il s'affiche,
 * et chaque SECTION porte son bouton « Enregistrer », actif seulement quand
 * elle a changé. L'état de l'envoi — en cours, enregistré, refusé et pourquoi
 * — se lit SOUS la section, annoncé aux lecteurs d'écran (`role="status"`).
 *
 * Ce fichier ne garde que le MÉTIER du membre — l'écriture d'une section, le
 * motif d'un refus, la carte de verre. Les champs, les bascules, les listes, le
 * badge « vérifié » et le bouton vivent dans le kit (`components/admin`, #9463) :
 * la fiche les avait écrits pour elle seule, et chaque feuille les recopiait.
 */
/**
 * LA CARTE DE VERRE (#8289, design validé de l'inscription #8288) — la matière
 * est celle du site UNIQUE `styles/glass.css` (`glass glass-card`, jamais un
 * flou réécrit ici) ; le bord et l'ombre sont ceux de la carte d'identité de
 * l'inscription (`signup-identity-card.tsx`), en jetons, donc justes dans les
 * deux schémas.
 */
export const GLASS_CARD_CLASS = 'glass glass-card rounded-[26px]';
export const GLASS_CARD_EDGE = {
  border: '1px solid color-mix(in srgb, var(--color-ios-ink) 12%, transparent)',
  boxShadow: '0 18px 48px color-mix(in srgb, var(--color-ios-ink) 14%, transparent)',
} as const;

export type SectionState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'saving' }
  | { readonly phase: 'saved'; readonly message: string }
  | { readonly phase: 'error'; readonly message: string };

/** Le motif d'un refus, dit dans la langue de l'administrateur — jamais le texte brut de la passerelle. */
export function refusalOf(failure: ApiFailure, language: AdminLanguage): string {
  if (failure.code === 'USERNAME_TAKEN') return translateAdmin(language, 'admin.create.usernameTaken');
  if (failure.code === 'EMAIL_TAKEN') return translateAdmin(language, 'admin.create.emailTaken');
  if (failure.code === 'TWO_FACTOR_NOT_ENROLLED') return translateAdmin(language, 'admin.security.twoFactorNotEnrolled');
  if (failure.status === 403) return translateAdmin(language, 'admin.prefs.reserved');
  if (failure.status === 400) return translateAdmin(language, 'admin.prefs.invalid');
  return translateAdmin(language, 'admin.edit.failed');
}

/**
 * L'ÉCRITURE D'UNE SECTION — un geste en vol à la fois, le membre RENDU par la
 * passerelle écrit dans le cache du détail (jamais une invalidation, qui
 * afficherait l'état d'avant le temps de revenir), et la liste des comptes
 * invalidée pour qu'elle ne montre pas l'ancien nom.
 */
export function useMemberWrite({
  userId,
  language,
  onAnnounce,
}: {
  readonly userId: string;
  readonly language: AdminLanguage;
  readonly onAnnounce: (texte: string) => void;
}) {
  const client = useQueryClient();
  const [state, setState] = useState<SectionState>({ phase: 'idle' });
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  /**
   * `optimistic` (#8289) — le membre tel qu'il sera, posé dans le cache AVANT
   * la réponse : le badge bascule au geste. Un refus remet l'instantané pris
   * juste avant, jamais une valeur recalculée.
   */
  async function run(
    gesture: () => Promise<ApiResult<AdminUserDetail>>,
    success: AdminPlainCatalogKey = 'admin.edit.saved',
    optimistic?: (avant: AdminUserDetail) => AdminUserDetail,
  ): Promise<AdminUserDetail | null> {
    if (state.phase === 'saving') return null;
    const cle = adminUserDetailQueryKey(userId);
    const instantane = client.getQueryData<AdminUserDetail>(cle);
    if (optimistic !== undefined && instantane !== undefined) client.setQueryData(cle, optimistic(instantane));
    setState({ phase: 'saving' });
    setFailure(null);
    const result = await gesture();
    if (!result.ok) {
      if (optimistic !== undefined && instantane !== undefined) client.setQueryData(cle, instantane);
      const message = refusalOf(result, language);
      setState({ phase: 'error', message });
      setFailure(result);
      onAnnounce(message);
      return null;
    }
    client.setQueryData(adminUserDetailQueryKey(userId), result.data);
    void client.invalidateQueries({ queryKey: ['admin', 'users'] });
    const message = translateAdmin(language, success);
    setState({ phase: 'saved', message });
    onAnnounce(message);
    return result.data;
  }

  const reset = () => {
    if (state.phase !== 'saving') setState({ phase: 'idle' });
  };

  return { state, failure, run, reset };
}

/**
 * UNE SECTION ÉDITABLE — un `<form>` : Entrée enregistre depuis n'importe quel
 * champ, et le bouton porte le nom de la section pour le lecteur d'écran
 * (« Enregistrer — Identité »).
 */
export function MemberSection({
  name,
  titre,
  language,
  dirty,
  state,
  onSave,
  saveLabel,
  saveTone = 'primary',
  children,
}: {
  readonly name: string;
  readonly titre: string;
  readonly language: AdminLanguage;
  /** `null` : la section n'a RIEN à enregistrer d'un bloc (ses gestes sont immédiats). */
  readonly dirty: boolean | null;
  readonly state: SectionState;
  readonly onSave?: () => void;
  readonly saveLabel?: string;
  readonly saveTone?: 'primary' | 'danger';
  readonly children: ReactNode;
}) {
  const titreId = useId();
  const envoi = state.phase === 'saving';
  return (
    <section className="grid gap-3" aria-labelledby={titreId} data-admin-member-section={name}>
      <h2 id={titreId} className="px-1 text-body font-semibold" style={{ color: INK }}>
        {titre}
      </h2>
      <form
        className={`${GLASS_CARD_CLASS} grid gap-5 p-5`}
        style={GLASS_CARD_EDGE}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty === true && !envoi) onSave?.();
        }}
      >
        {children}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <AdminFormStatus
            phase={state.phase}
            text={state.phase === 'saving' ? translateAdmin(language, 'admin.section.saving') : state.phase === 'idle' ? '' : state.message}
            data={{ 'data-admin-section-state': state.phase }}
          />
          {dirty === null ? null : (
            <AdminButton
              type="submit"
              tone={saveTone}
              disabled={!dirty || envoi}
              label={`${saveLabel ?? translateAdmin(language, 'admin.edit.save')} — ${titre}`}
              data={{ 'data-admin-section-save': name }}
            >
              {saveLabel ?? translateAdmin(language, 'admin.edit.save')}
            </AdminButton>
          )}
        </div>
      </form>
    </section>
  );
}
