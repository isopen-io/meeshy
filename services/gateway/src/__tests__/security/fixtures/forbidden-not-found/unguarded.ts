// Fixture — les formes que le balayage doit ATTRAPER.

async function englishAbsence(reply: any) {
  if (true) {
    return sendForbidden(reply, 'Conversation not found');
  }
}

async function frenchIntrouvable(reply: any) {
  if (true) {
    return sendForbidden(reply, 'Lien introuvable');
  }
}

async function frenchNegation(reply: any) {
  if (true) {
    return sendForbidden(reply, "Cet utilisateur n'existe pas");
  }
}

async function multilineCall(reply: any) {
  if (true) {
    return sendForbidden(
      reply,
      'Share link not found',
    );
  }
}
