/**
 * Le courriel « Mot de passe oublié » — extrait d'`EmailService.ts` par #6642.
 *
 * ## Pourquoi il part
 *
 * `EmailService.ts` dépasse le seuil de 1000 lignes du cliquet de taille, et le
 * dépôt interdit d'ajouter à un fichier hors budget : on extrait d'abord, on
 * ajoute ensuite (directive 2026-09-02). Le lot qui fait dire « définir » à un
 * compte sans mot de passe devait faire grandir ce gabarit — c'est donc le
 * gabarit qui sort, avec le type de sa charge.
 *
 * ## Deux intentions, un seul gabarit
 *
 * `'reset'` — le compte a un mot de passe : le courriel est celui d'avant, mot
 * pour mot. `'set'` — le compte n'en a jamais eu (inscription par e-mail seul,
 * #6424) : sujet, titre, intro et bouton disent « définir ». L'expiration et la
 * mention « ignorer » sont communes : la variante ne surcharge que ce qui
 * diffère, pour qu'aucune phrase n'existe en deux exemplaires.
 *
 * Ce module COMPOSE. `EmailService` garde ce qui ENVOIE et ce qui HABILLE
 * (styles, pied de page), qu'il lui remet.
 *
 * @module services/email/password-reset-email
 */

import type { EmailTranslations } from './translations';

export type PasswordEmailIntent = 'reset' | 'set';

export type PasswordResetEmailData = {
  to: string;
  name: string;
  resetLink: string;
  expiryMinutes: number;
  language?: string;
  /**
   * Ce que le lien permet, lu sur le COMPTE par l'appelant : `'set'` quand il
   * n'a pas de mot de passe, `'reset'` sinon. Requis — le gabarit n'a pas à
   * deviner l'état d'un compte qu'il ne lit pas.
   */
  intent: PasswordEmailIntent;
};

export type PasswordResetEmailFrame = {
  readonly translations: EmailTranslations;
  readonly baseStyles: string;
  readonly footerHtml: string;
  readonly footerText: string;
};

export type ComposedEmail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

const copyFor = (t: EmailTranslations, intent: PasswordEmailIntent): EmailTranslations['passwordReset'] =>
  intent === 'set' ? { ...t.passwordReset, ...t.passwordSet } : t.passwordReset;

export function composePasswordResetEmail(
  data: PasswordResetEmailData,
  frame: PasswordResetEmailFrame
): ComposedEmail {
  const t = frame.translations;
  const copy = copyFor(t, data.intent);
  const expiry = copy.expiry.replace('{minutes}', data.expiryMinutes.toString());

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${frame.baseStyles}</style></head><body><div class="container"><div class="header"><h1>🔐 ${copy.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${copy.intro}</p><div style="text-align:center"><a href="${data.resetLink}" class="button">${copy.buttonText}</a></div><div class="warning"><strong>⚠️</strong><ul style="margin:10px 0;padding-left:20px"><li>${expiry}</li><li>${copy.ignoreNote}</li></ul></div><p>${t.common.footer}</p></div><div class="footer">${frame.footerHtml}</div></div></body></html>`;
  const text = `${copy.title}\n\n${t.common.greeting} ${data.name},\n\n${copy.intro}\n\n${data.resetLink}\n\n${expiry}\n\n${copy.ignoreNote}\n\n${t.common.footer}\n\n${frame.footerText}`;

  return { subject: copy.subject, html, text };
}
