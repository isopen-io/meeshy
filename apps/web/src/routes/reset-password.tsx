import { ResetPasswordFlow } from '@/components/reset-password-flow';
import { useEmailLinkSearch } from '@/lib/links/email-link-search';

/**
 * `/reset-password` (T-reset, #5672) — nomenclature legacy reprise (D-5,
 * `apps/web/app/reset-password`). Le jeton voyage dans le FRAGMENT du lien
 * (`#token=`, #10859), relevé par `useEmailLinkSearch` ; l'ancien `?token=`
 * reste lu pendant la transition.
 */
export default function ResetPasswordScreen() {
  const search = useEmailLinkSearch();
  return <ResetPasswordFlow token={search.get('token')} />;
}
