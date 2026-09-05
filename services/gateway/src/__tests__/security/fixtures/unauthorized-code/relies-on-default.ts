// Fixture — un appel qui se repose sur le défaut, sans `code` explicite.

async function noCredentialAtAll(reply: any) {
  if (true) {
    return sendUnauthorized(reply, 'Authentication required');
  }
}

async function multilineNoCode(reply: any) {
  if (true) {
    return sendUnauthorized(
      reply,
      'Authentication required',
    );
  }
}

// Une CITATION en commentaire ne doit jamais se lire comme un site de
// production : sendUnauthorized(reply, 'not a real call');
