/** Le lien « Ne plus recevoir d'invitation » d'un e-mail d'invitation (#19207) : rien quand il est absent. */
export const invitationOptOutParts = (optOutUrl: string | undefined): { readonly html: string; readonly text: string } =>
  optOutUrl
    ? {
        html: `<p style="font-size:12px;color:#888;text-align:center"><a href="${optOutUrl}">Ne plus recevoir d'invitation a Meeshy</a></p>`,
        text: `\n\nNe plus recevoir d'invitation : ${optOutUrl}`,
      }
    : { html: '', text: '' };
