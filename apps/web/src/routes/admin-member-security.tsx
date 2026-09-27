import type { AdminDeps } from '@/lib/api/admin';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { setAdminUserTwoFactor } from '@/lib/api/admin-user-verifications';
import { apiDeps } from '@/lib/api/deps';
import { adminMoment } from '@/lib/admin/format';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Bascule, INK, INK2, MemberSection, SectionButton, useMemberWrite } from './admin-member-parts';

/**
 * **LA SÉCURITÉ D'UN MEMBRE** (#8289) — trois gestes IMMÉDIATS, aucun
 * brouillon : il n'y a rien à « enregistrer d'un bloc » ici.
 *
 * - le MOT DE PASSE : la feuille des quatre niveaux (#8051), centrée ;
 * - le SECOND FACTEUR : désarmer est toujours offert (c'est le seul chemin de
 *   récupération d'un appareil perdu) ; armer l'est quand un téléphone est
 *   renseigné, et la passerelle le refuse pour une application jamais
 *   appairée — armer sans secret enfermerait le membre dehors ;
 * - les SESSIONS : leur nombre, et l'onglet Sécurité qui les liste et les
 *   révoque une à une.
 */
export function AdminMemberSecuritySection({
  membre,
  language,
  sessions,
  onAnnounce,
  onOpenPassword,
  onOpenSessions,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  /** Le nombre de sessions actives servi par `…/stats`, `null` tant qu'il ne l'est pas. */
  readonly sessions: number | null;
  readonly onAnnounce: (texte: string) => void;
  readonly onOpenPassword: () => void;
  readonly onOpenSessions: () => void;
  readonly deps?: AdminDeps;
}) {
  const ecriture = useMemberWrite({ userId: membre.id, language, onAnnounce });
  const telephone = membre.phoneNumber !== '';
  const armable = membre.twoFactorEnabled || telephone;

  return (
    <MemberSection name="security" titre={translateAdmin(language, 'admin.tab.security')} language={language} dirty={null} state={ecriture.state}>
      <div className="flex flex-wrap items-center justify-between gap-3" data-admin-security="password">
        <div className="min-w-0">
          <p className="text-body" style={{ color: INK }}>
            {translateAdmin(language, 'admin.password.field')}
          </p>
          {membre.lastPasswordChange === null ? null : (
            <p className="text-caption" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.meta.passwordChanged')} {adminMoment(membre.lastPasswordChange, language)}
            </p>
          )}
        </div>
        <SectionButton tone="danger" data={{ 'data-admin-password-open': '' }} onClick={onOpenPassword}>
          {translateAdmin(language, 'admin.password.title')}
        </SectionButton>
      </div>

      <div data-admin-security="two-factor">
        <Bascule
          id="admin-member-two-factor"
          label={translateAdmin(language, 'admin.user.twoFactor')}
          actif={membre.twoFactorEnabled}
          disabled={!armable || ecriture.state.phase === 'saving'}
          hint={translateAdmin(language, telephone ? 'admin.security.twoFactorHint' : 'admin.security.twoFactorNeedsPhone')}
          onBascule={(enabled) => void ecriture.run(() => setAdminUserTwoFactor({ ...deps, userId: membre.id, enabled }))}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" data-admin-security="sessions">
        <p className="text-body" style={{ color: INK }}>
          {translateAdmin(language, 'admin.stats.activeSessions')}
          {sessions === null ? null : (
            <span className="ms-2 font-semibold tabular-nums" data-admin-sessions-count={String(sessions)}>
              {sessions.toLocaleString(language)}
            </span>
          )}
        </p>
        <SectionButton data={{ 'data-admin-sessions-open': '' }} onClick={onOpenSessions}>
          {translateAdmin(language, 'admin.security.sessionsOpen')}
        </SectionButton>
      </div>
    </MemberSection>
  );
}
