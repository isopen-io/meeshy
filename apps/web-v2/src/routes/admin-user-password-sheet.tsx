import { useState } from 'react';

import { Sheet } from '@/components/sheet';
import { GENERATED_PASSWORD_LENGTH, generateStrongPassword, resetAdminUserPassword } from '@/lib/api/admin-user-password';
import { apiDeps } from '@/lib/api/deps';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { portailDuNavigateur, type PortailPartage } from '@/lib/view/invitation';
import { ActionButton } from '@/routes/link-page-parts';

/**
 * **RÉINITIALISER LE MOT DE PASSE D'UN MEMBRE** (#6819) — la feuille, ouverte
 * depuis sa fiche.
 *
 * ## Le secret s'affiche AVANT d'être appliqué
 *
 * L'administrateur doit le TRANSMETTRE. S'il n'apparaissait qu'après
 * l'application, un geste raté — fenêtre fermée, réseau coupé au mauvais
 * moment — laisserait un compte dont personne ne connaît le mot de passe, et
 * la seule issue serait une seconde réinitialisation. On génère donc d'abord,
 * on laisse copier, on applique ensuite.
 *
 * ## Il ne vit que dans l'état de cette feuille
 *
 * Jamais dans le cache des requêtes — qui est persisté dans `localStorage`
 * (`query-client.ts`) — ni dans une réponse décodée : la route ne rend qu'un
 * message, et le port ne prétend rien en tirer. Le secret disparaît avec la
 * feuille.
 *
 * ## Le portail est INJECTÉ
 *
 * `portailDuNavigateur()` par défaut, mais remplaçable : c'est ce qui rend la
 * copie mesurable sans navigateur, et ce qui empêche un témoin de se contenter
 * d'affirmer que `navigator.clipboard` existe. Le contrat vient de
 * `@/lib/view/invitation` — l'espace NEUTRE, pas celui des liens : on réutilise
 * l'abstraction partagée, jamais l'emballage dont le nom démentirait l'usage.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

type Copie = 'none' | 'copied' | 'failed';

export function AdminUserPasswordSheet({
  userId,
  language,
  onClose,
  onAnnounce,
  portail = portailDuNavigateur(),
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onAnnounce: (texte: string) => void;
  readonly portail?: PortailPartage;
}) {
  // Généré UNE fois à l'ouverture : re-tirer à chaque rendu donnerait un
  // secret différent de celui que l'administrateur vient de copier.
  const [motDePasse] = useState(() => generateStrongPassword(GENERATED_PASSWORD_LENGTH));
  const [copie, setCopie] = useState<Copie>('none');
  const [envoi, setEnvoi] = useState(false);

  async function copier() {
    if (portail.copier === undefined) {
      setCopie('failed');
      return;
    }
    try {
      await portail.copier(motDePasse);
      setCopie('copied');
      onAnnounce(translate(language, 'admin.password.copied'));
    } catch {
      setCopie('failed');
    }
  }

  async function appliquer() {
    if (envoi) return;
    setEnvoi(true);
    const resultat = await resetAdminUserPassword({ ...apiDeps, userId, newPassword: motDePasse });
    setEnvoi(false);

    onAnnounce(translate(language, resultat.ok ? 'admin.password.done' : 'admin.password.failed'));
    if (resultat.ok) onClose();
  }

  return (
    <Sheet title={translate(language, 'admin.password.title')} onClose={onClose}>
      <div className="grid gap-4 px-4 pb-6">
        <p
          className="rounded-card px-4 py-3 text-caption"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', color: 'var(--color-danger)' }}
        >
          {translate(language, 'admin.password.warn')}
        </p>

        <div className="grid gap-2">
          <p
            data-admin-password
            className="select-all break-all rounded-card px-4 py-3 text-body font-semibold"
            style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', color: INK }}
          >
            {motDePasse}
          </p>
          <p className="text-caption" style={{ color: INK2 }}>
            {translate(language, 'admin.password.generated')}
          </p>
        </div>

        <ActionButton tone="secondary" onClick={() => void copier()}>
          {translate(language, copie === 'copied' ? 'admin.password.copied' : 'admin.password.copy')}
        </ActionButton>

        <div className="grid gap-2 pt-2">
          <ActionButton tone="danger" disabled={envoi} onClick={() => void appliquer()}>
            {translate(language, 'admin.password.apply')}
          </ActionButton>
          <ActionButton tone="secondary" onClick={onClose}>
            {translate(language, 'common.cancel')}
          </ActionButton>
        </div>
      </div>
    </Sheet>
  );
}
