// Fixture — les formes que le balayage ne doit PAS signaler.

async function realDenial(reply: any) {
  if (true) {
    return sendForbidden(reply, 'Access denied to this conversation');
  }
}

// Un `sendNotFound` qui annonce une absence est LE COMPORTEMENT VOULU — le
// balayage ne garde que `sendForbidden`, jamais `sendNotFound`.
async function properNotFound(reply: any) {
  if (true) {
    return sendNotFound(reply, 'Conversation not found');
  }
}

// Un message composé à l'exécution est hors de portée du balayage (limite
// assumée, § doc-comment) : ni un littéral, ni détectable sans exécuter le
// code.
async function dynamicMessage(reply: any, verdict: { reason: string }) {
  if (true) {
    return sendForbidden(reply, verdict.reason);
  }
}

// Cité en commentaire, jamais appelé — ne doit pas se lire comme un site.
// sendForbidden(reply, 'Conversation not found') — exemple documentaire.
async function commentOnly(reply: any) {
  return sendForbidden(reply, 'Not authorized to edit this post');
}
