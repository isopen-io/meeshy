import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionDirectory } from '@/components/admin/section-directory';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { interpretRole } from '@/lib/admin/interpret/enums';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import { AdminDashboardPanel } from '@/routes/admin-dashboard';

/**
 * **L'ESPACE D'ADMINISTRATION** (#6432, #8876) — directive porteur 2026-09-14 :
 * « c'est ici qu'on livre un accès à la page d'administration à la v2 ».
 *
 * ## Fail-closed, et sans oracle
 *
 * La décision d'entrer ne vient PAS de la session — `SessionUser` ne projette
 * pas `role` — mais du serveur : `GET /me/permissions`, lue par
 * `useAdminReach` (la même lecture que le menu et les Réglages). Tant que la
 * réponse n'est pas là, `AdminSectionScreen` rend un squelette, jamais le refus
 * (montrer « accès refusé » puis le contenu ferait clignoter une accusation) ;
 * une réponse refusée mène au même endroit que « pas le droit », sans dire
 * lequel des deux.
 *
 * ## Ce que le hub montre
 *
 * L'en-tête (le rôle SERVI, dit en mots — plus « Votre rôle : BIGBOSS »), le
 * panneau du tableau de bord (`admin-dashboard.tsx`, que son lot remplace), puis
 * le répertoire des sections rangées par groupe. Une section pas encore prête
 * n'a pas de tuile (loi 4).
 */
export default function AdminScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="dashboard" language={language} title={translate(language, 'admin.title')} back="list">
      {(reach) => (
        <div className="grid gap-6">
          <AdminPageHeader
            language={language}
            title={translate(language, 'admin.title')}
            subtitle={translateAdmin(language, 'admin.kit.hub.signedAs', { role: interpretRole(reach.role, language).label })}
          />
          <AdminDashboardPanel language={language} />
          <AdminSectionDirectory language={language} reach={reach} />
        </div>
      )}
    </AdminSectionScreen>
  );
}
