/**
 * `ResetPasswordForm` est une surface d'AUTHENTIFICATION, et elle vivait sans
 * témoin : le sien s'est perdu dans une réorganisation, et rien ne l'a signalé —
 * une couverture qui disparaît ne casse aucun gate (#7487).
 *
 * Ce fichier n'est PAS la reprise du témoin de janvier 2026. Celui-ci testait un
 * composant qui a huit mois de moins ; rejouer ses assertions contre le code
 * d'aujourd'hui donnerait soit du rouge sans signal, soit du vert qui ne prouve
 * rien. L'ancien a servi d'INVENTAIRE — il disait QUELLE surface avait une
 * couverture — jamais de source à copier.
 *
 * Ce qui est tenu ici est ce qu'un formulaire de réinitialisation doit à la
 * personne qui l'ouvre, en commençant par ses refus : un jeton absent, un jeton
 * refusé par le serveur, deux mots de passe qui divergent, un second facteur
 * réclamé. Sur une surface d'authentification, le chemin heureux est le cas le
 * moins intéressant — c'est quand elle refuse qu'elle protège.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

/**
 * Le service réel est ESPIONNÉ, pas remplacé. Deux raisons, et la seconde n'est
 * visible qu'à l'exécution :
 *
 * 1. `PasswordStrengthMeter`, monté par le formulaire, appelle trois autres
 *    méthodes du même service (`calculatePasswordStrength`,
 *    `getPasswordStrengthLabel`, `getPasswordStrengthColor`). Une fabrique qui
 *    énumère trois exports à la main les rend `undefined` — un double PARTIEL
 *    perd en silence tout ce que le module gagne (`apps/web/CLAUDE.md`).
 * 2. `passwordResetService` est un SINGLETON de classe, donc `{ ...instance }`
 *    ne copie que ses propriétés propres : les méthodes vivent sur le prototype
 *    et disparaissent du double. Étendre ne suffisait donc pas non plus.
 *
 * `jest.spyOn` laisse l'instance et son prototype intacts, et ne détourne que
 * les trois portes par lesquelles ce composant parle au réseau.
 */
import { passwordResetService } from '@/services/password-reset.service';

const verifyToken = jest.spyOn(passwordResetService, 'verifyToken');
const resetPassword = jest.spyOn(passwordResetService, 'resetPassword');
const validatePasswordStrength = jest.spyOn(passwordResetService, 'validatePasswordStrength');

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

/**
 * `t` est défini UNE fois, hors du hook. Le vrai `useI18n` le mémorise
 * (`useCallback`, `use-i18n.ts:142`), et l'effet de vérification du jeton
 * l'a dans ses dépendances : un double qui recrée `t` à chaque rendu rejoue cet
 * effet sans fin, `setIsVerifying(true)` ramène l'écran « Verifying reset
 * link… », et le formulaire disparaît sous la frappe.
 *
 * Le symptôme accuse alors le composant d'un défaut que le produit n'a pas.
 * Un double doit reproduire les PROPRIÉTÉS du vrai — ici la stabilité
 * d'identité — pas seulement sa signature.
 */
const t = (_key: string, fallback?: string) => fallback ?? _key;
const i18n = { t };
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => i18n,
}));

/**
 * Le store est réel dans l'idée mais piloté ici : `requires2FA` est ce que le
 * composant lit pour décider s'il réclame un second facteur, et c'est le
 * discriminant de deux des cas ci-dessous.
 */
let requires2FA = false;
let storeDouble = makeStoreDouble();

function makeStoreDouble() {
  return {
    requires2FA,
    setRequires2FA: (v: boolean) => { requires2FA = v; },
    setPasswordReset: jest.fn(),
    setError: jest.fn(),
    setSuccessMessage: jest.fn(),
    setIsResettingPassword: jest.fn(),
  };
}

/**
 * Même exigence de stabilité que pour `t` ci-dessus, et pour la même raison :
 * `setRequires2FA` figure dans les dépendances de l'effet de vérification. Un
 * double qui reconstruit son objet à chaque rendu donne une nouvelle identité à
 * chaque fonction, rejoue l'effet sans fin et fait disparaître le formulaire.
 * L'objet est donc figé pour la durée d'un test, et reconstruit entre deux.
 */
jest.mock('@/stores/password-reset-store', () => ({
  usePasswordResetStore: () => storeDouble,
}));

const STRONG = 'Correct-Horse-9';

const renderForm = (token = 'jeton-valide') => render(<ResetPasswordForm token={token} />);

/** Le formulaire n'apparaît qu'une fois le jeton vérifié. */
const waitForForm = () => screen.findByLabelText(/New Password/i);

/**
 * `fireEvent.change` plutôt qu'une frappe caractère par caractère : les champs
 * sont contrôlés et `PasswordStrengthMeter` se recalcule à chaque valeur, ce qui
 * remplace le nœud sous la frappe — `userEvent.type` n'y déposait que la
 * première lettre. Ce qu'on veut exercer ici est la VALIDATION d'une valeur
 * saisie, pas la mécanique de saisie elle-même.
 */
const fill = (field: HTMLElement, value: string) =>
  fireEvent.change(field, { target: { value } });

const submit = () => fireEvent.click(screen.getByRole('button', { name: /Reset Password/i }));

beforeEach(() => {
  jest.clearAllMocks();
  requires2FA = false;
  storeDouble = makeStoreDouble();
  validatePasswordStrength.mockReturnValue({ isValid: true, errors: [] });
  verifyToken.mockResolvedValue({ success: true, valid: true });
  resetPassword.mockResolvedValue({ success: true });
});

describe('ResetPasswordForm — ce qu’il refuse', () => {
  it('sans jeton, ne demande rien au serveur et ne montre aucun champ', async () => {
    renderForm('');

    expect(await screen.findByText(/Reset token is missing/i)).toBeInTheDocument();
    expect(verifyToken).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/New Password/i)).not.toBeInTheDocument();
  });

  it('sur un jeton refusé, montre la raison du serveur et propose d’en redemander un', async () => {
    verifyToken.mockResolvedValue({ success: true, valid: false, error: 'Ce lien a expiré' });

    renderForm();

    expect(await screen.findByText('Ce lien a expiré')).toBeInTheDocument();
    expect(screen.queryByLabelText(/New Password/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Request New Reset Link/i })).toBeInTheDocument();
  });

  it('sur une vérification qui échoue, refuse le formulaire plutôt que de l’ouvrir', async () => {
    verifyToken.mockRejectedValue(new Error('réseau injoignable'));

    renderForm();

    expect(await screen.findByText(/Failed to verify reset token/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/New Password/i)).not.toBeInTheDocument();
  });

  it('si les deux mots de passe divergent, n’envoie RIEN au serveur', async () => {
    renderForm();

    fill(await waitForForm(), STRONG);
    fill(screen.getByLabelText(/Confirm/i), 'autre-chose');
    submit();

    // Le produit prévient DEUX fois, et c'est voulu : une mention en ligne sous
    // le champ dès que les valeurs divergent, puis l'alerte de soumission.
    // `findAllByText` plutôt que `findByText`, qui échouerait sur cette richesse.
    const warnings = await screen.findAllByText(/Passwords do not match/i);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('si le mot de passe est jugé faible, sert la raison du service et n’envoie rien', async () => {
    validatePasswordStrength.mockReturnValue({
      isValid: false,
      errors: ['Au moins 12 caractères', 'Au moins un chiffre'],
    });
    renderForm();

    fill(await waitForForm(), 'court');
    fill(screen.getByLabelText(/Confirm/i), 'court');
    submit();

    expect(await screen.findByText(/Au moins 12 caractères. Au moins un chiffre/i)).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });
});

/**
 * Le champ du second facteur porte `required` et `pattern="[0-9]{6}"` : c'est la
 * validation NATIVE du navigateur qui refuse la soumission en premier, et la
 * garde applicative de `validateForm` n'est un second rideau qu'au cas où la
 * soumission arrive tout de même (remplissage automatique, navigateur
 * permissif, `requestSubmit` programmatique).
 *
 * Les deux niveaux sont donc exercés séparément : par le CLIC, qui doit être
 * arrêté sans qu'aucune requête ne parte ; puis par une soumission DIRECTE, qui
 * contourne la validation native et doit rencontrer le message applicatif. Ne
 * tester que le clic laisserait la garde applicative sans témoin ; ne tester que
 * la soumission directe mentirait sur ce que vit l'utilisateur.
 */
describe('ResetPasswordForm — le second facteur', () => {
  /**
   * Le double du store ne re-rend pas sur `setRequires2FA` : on pose l'état
   * AVANT le montage, ce que le composant lirait de toute façon au rendu qui
   * suit la vérification du jeton.
   */
  const armTwoFactor = () => {
    requires2FA = true;
    storeDouble = makeStoreDouble();
    verifyToken.mockResolvedValue({ success: true, valid: true, requires2FA: true });
  };

  const formOf = (field: HTMLElement) => field.closest('form') as HTMLFormElement;

  const fillBothPasswords = async () => {
    const password = await waitForForm();
    fill(password, STRONG);
    fill(screen.getByLabelText(/Confirm/i), STRONG);
    return password;
  };

  it('sans code, le clic ne fait rien partir au serveur', async () => {
    armTwoFactor();
    renderForm();

    await fillBothPasswords();
    submit();

    await waitFor(() => expect(screen.getByLabelText(/2FA Code/i)).toBeInTheDocument());
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('sans code, la garde applicative le dit si la soumission arrive quand même', async () => {
    armTwoFactor();
    renderForm();

    const password = await fillBothPasswords();
    fireEvent.submit(formOf(password));

    expect(await screen.findByText(/2FA code is required/i)).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("refuse un code qui n'a pas six chiffres", async () => {
    armTwoFactor();
    renderForm();

    const password = await fillBothPasswords();
    fill(screen.getByLabelText(/2FA Code/i), '1234');
    fireEvent.submit(formOf(password));

    expect(await screen.findByText(/2FA code must be 6 digits/i)).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('accepte un code à six chiffres et le transmet', async () => {
    armTwoFactor();
    renderForm();

    const password = await fillBothPasswords();
    fill(screen.getByLabelText(/2FA Code/i), '123456');
    fireEvent.submit(formOf(password));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledTimes(1));
    expect(resetPassword).toHaveBeenCalledWith(
      expect.objectContaining({ twoFactorCode: '123456' }),
    );
  });
});

describe('ResetPasswordForm — ce qu’il accepte', () => {
  it('transmet le jeton et le mot de passe, et rend la main à l’hôte', async () => {
    const onSuccess = jest.fn();
    render(<ResetPasswordForm token="jeton-valide" onSuccess={onSuccess} />);

    fill(await waitForForm(), STRONG);
    fill(screen.getByLabelText(/Confirm/i), STRONG);
    submit();

    await waitFor(() => expect(resetPassword).toHaveBeenCalledTimes(1));
    expect(resetPassword).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'jeton-valide', newPassword: STRONG, confirmPassword: STRONG }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it('sur un refus du serveur, montre sa raison et laisse le formulaire ouvert', async () => {
    resetPassword.mockResolvedValue({ success: false, error: 'Ce mot de passe a déjà servi' });
    renderForm();

    fill(await waitForForm(), STRONG);
    fill(screen.getByLabelText(/Confirm/i), STRONG);
    submit();

    expect(await screen.findByText('Ce mot de passe a déjà servi')).toBeInTheDocument();
    expect(screen.getByLabelText(/New Password/i)).toBeInTheDocument();
  });
});
