// Recovery automatique pour chunks obsoletes apres un deploiement
// Recharge la page UNE SEULE FOIS si un chunk est manquant
(function () {
  var KEY = '__meeshy_chunk_reload';
  var now = Date.now();

  function isStaleDeploymentError(msg) {
    return (
      msg.indexOf('Loading chunk') !== -1 ||
      msg.indexOf('ChunkLoadError') !== -1 ||
      msg.indexOf('Failed to find Server Action') !== -1
    );
  }

  function tryReload() {
    if (!sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, String(now));
      window.location.reload();
    }
  }

  window.addEventListener('error', function (e) {
    if (isStaleDeploymentError(e.message || '')) {
      tryReload();
    }
  });

  window.addEventListener('unhandledrejection', function (e) {
    var msg = (e.reason && e.reason.message) || '';
    if (isStaleDeploymentError(msg)) {
      tryReload();
    }
  });

  // Nettoyer le flag apres 30s pour permettre un nouveau reload au prochain deploiement
  var prev = sessionStorage.getItem(KEY);
  if (prev && now - Number(prev) > 30000) {
    sessionStorage.removeItem(KEY);
  }
})();
