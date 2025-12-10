// Script pour vérifier le nombre de listeners sur le ZMQ client
const { ZMQSingleton } = require('./src/services/zmq-translation-client-singleton');

async function checkListeners() {
  try {
    
    const zmqClient = await ZMQSingleton.getInstance();
    
    
    // Vérifier les listeners
    const translationCompletedListeners = zmqClient.listenerCount('translationCompleted');
    const translationErrorListeners = zmqClient.listenerCount('translationError');
    
    
    if (translationCompletedListeners > 1) {
    } else {
    }
    
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

checkListeners();

