import { axe } from 'jest-axe';

import { documentDuChoix, SAISIE_VIDE } from '@/app/(public)/chat/[lien]/choix-vue';
import { documentDuLienIntrouvable } from '@/app/(public)/chat/[lien]/membre-vue';
import type { CleDeLien } from '@/lib/api/guest-session';
import type { ApercuDeJonction, Refus } from '@/lib/api/invite';

/**
 * Gate B (§ 9.5) sur L'ÉTAT CHOIX de `/chat/:lien`, dans chacun de ses états
 * PEINTS : « 0 violation `axe` `serious`/`critical` ». Le document COMPLET,
 * tel que le gestionnaire le sert — la modale ouverte sur le cadre inerte, le
 * formulaire nominal, un lien qui exige courriel et date de naissance, un 409
 * qui pré-remplit, un 400 sur un champ, un 400 en bandeau, un refus du lien qui
 * retire le formulaire, un lien clos avant tout choix, et le lien inconnu.
 * jsdom n'a ni mise en page ni couleurs calculées : le CONTRASTE est mesuré
 * au navigateur (`e2e/visual/v3-join.spec.ts`, quatre colonnes de thème).
 */

const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

const ecris = (html: string): void => {
  document.open();
  document.write(html);
  document.close();
};

const APERCU: ApercuDeJonction = {
  lien: 'mshy_lagos' as CleDeLien,
  nom: 'Équipe Lagos',
  description: 'Le canal des opérations.',
  conversationId: 'c1',
  requireNickname: true,
  requireAccount: false,
  requireEmail: false,
  requireBirthday: false,
  languesAutorisees: [],
  participants: 12,
  droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true },
};

const refus = (statut: number, code: string, message: string | null = null, suggestion: string | null = null): Refus => ({
  genre: 'refus',
  statut,
  code,
  message,
  suggestion,
});

type Attributs = Partial<Omit<Parameters<typeof documentDuChoix>[0], 'apercu' | 'clos'>> & { readonly apercu?: ApercuDeJonction; readonly clos?: string | null };

const choix = (attributs: Attributs = {}): string =>
  documentDuChoix({
    segment: 'lagos-q1',
    apercu: APERCU,
    langueProposee: 'fr',
    saisie: SAISIE_VIDE,
    refus: null,
    clos: null,
    maintenant: 0,
    ...attributs,
  });

describe('l’état CHOIX face à axe', () => {
  it.each<[string, string]>([
    ['nominal — la modale sur le cadre inerte', choix()],
    ['un lien qui exige courriel et date de naissance', choix({ apercu: { ...APERCU, requireEmail: true, requireBirthday: true } })],
    ['409 — le pseudo libre pré-rempli, le champ en refus', choix({ saisie: { ...SAISIE_VIDE, pseudo: 'ibrahim' }, refus: refus(409, 'USERNAME_TAKEN_IN_CONVERSATION', 'pris', 'ibrahim2') })],
    [
      '400 — le courriel manque, dit sur son champ',
      choix({
        apercu: { ...APERCU, requireEmail: true },
        refus: refus(400, "L'email est obligatoire pour rejoindre cette conversation", "L'email est obligatoire pour rejoindre cette conversation"),
      }),
    ],
    ['400 — sans champ désigné, en bandeau', choix({ refus: refus(400, 'Données invalides', 'Données invalides') })],
    ['403 — refus du lien, formulaire retiré', choix({ refus: refus(403, 'ACCOUNT_REQUIRED', 'refus') })],
    ['409 LINK_EXHAUSTED — refus du lien, formulaire retiré', choix({ refus: refus(409, 'LINK_EXHAUSTED', 'refus') })],
    ['un lien qui exige un compte', choix({ apercu: { ...APERCU, requireAccount: true } })],
    ['clos avant tout choix', choix({ clos: 'LINK_EXPIRED' })],
    ['un lien que personne ne connaît', documentDuLienIntrouvable()],
  ])('ne porte aucune violation grave — %s', async (_nom, html) => {
    ecris(html);
    expect(await graves()).toEqual([]);
  });

  it('0 violation sur la modale CLOSE — un lien refusé par l’aperçu, sans aperçu', async () => {
    ecris(
      documentDuChoix({
        segment: 'lagos-q1',
        apercu: null,
        clos: 'LINK_MAX_USES',
        langueProposee: 'fr',
        saisie: SAISIE_VIDE,
        refus: null,
        maintenant: 0,
      }),
    );
    expect(document.querySelector('dialog[open]')?.getAttribute('aria-labelledby')).toBe('titre-du-choix');
    expect(document.querySelector('#titre-du-choix')?.textContent).toBe('Ce lien est fermé');
    expect(document.querySelector('dialog details.droits')).toBeNull();
    expect(await graves()).toEqual([]);
  });

  it('rougit sur un document dont la structure est fautive', async () => {
    ecris('<html><body><div tabindex="0"><img src="x"></div></body></html>');
    expect(await graves()).not.toEqual([]);
  });

  it('nomme la modale par le lien et la décrit par la question', () => {
    ecris(choix());
    const dialogue = document.querySelector('dialog');
    expect(dialogue?.getAttribute('aria-labelledby')).toBe('titre-du-choix');
    expect(document.getElementById('titre-du-choix')?.textContent).toBe('Équipe Lagos');
    expect(document.getElementById(dialogue?.getAttribute('aria-describedby') ?? '')?.textContent).toContain('anonyme');
  });

  it('lie chaque champ à son étiquette, et un refus à son champ', () => {
    ecris(choix({ apercu: { ...APERCU, requireEmail: true }, refus: refus(409, 'USERNAME_TAKEN_IN_CONVERSATION', 'pris', 'tolu2') }));
    ['pseudo', 'langue', 'courriel'].forEach((nom) => {
      expect(document.querySelector(`label[for="${nom}"]`)).not.toBeNull();
      expect(document.getElementById(nom)).not.toBeNull();
    });
    const pseudo = document.getElementById('pseudo');
    expect(pseudo?.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(pseudo?.getAttribute('aria-describedby') ?? '')?.getAttribute('role')).toBe('alert');
  });
});

/**
 * LE CADRE DERRIÈRE LA MODALE NE PROPOSE AUCUNE DESTINATION DE MEMBRE
 * (correction de revue de #5034). Il est composé par `corpsDuFil` avec une
 * `Porte` de MEMBRE FACTICE (`choix-vue.ts` › `cadre()`) : les gardes de rôle
 * de la vue du fil y sont donc AVEUGLES, et les deux ronds de destination de
 * l'en-tête — « Médias » (#4525) et « Partager » (#5034) — s'y rendaient pour
 * un visiteur SANS session, vers des adresses de membre qui ne répondent que
 * par `/login`. `corpsDuFil(…, { cadre: true })` les tait désormais à la
 * source.
 */
describe('l’état CHOIX ne rend aucun contrôle de membre dans son cadre', () => {
  it('ne propose ni « Médias » ni « Partager » à un visiteur sans session', () => {
    const html = choix();
    expect(html).not.toContain('class="medias"');
    expect(html).not.toContain('class="partager"');
    expect(html).not.toContain('?lien"');
    expect(html).not.toContain('/medias"');
  });

  it('garde le cadre lui-même — le titre du lien, derrière la modale', () => {
    expect(choix()).toContain('Équipe Lagos');
  });
});
