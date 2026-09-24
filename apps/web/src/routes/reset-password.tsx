import { ResetPasswordFlow } from '@/components/reset-password-flow';
import { useSearch } from '@/lib/router';

/**
 * `/reset-password?token=` (T-reset, #5672) — nomenclature legacy reprise
 * (D-5, `apps/web/app/reset-password`). Le jeton voyage en QUERY STRING,
 * même raison que `verify-email.tsx`.
 */
export default function ResetPasswordScreen() {
  const [search] = useSearch();
  return <ResetPasswordFlow token={search.get('token')} />;
}
