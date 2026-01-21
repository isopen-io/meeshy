const { MongoClient } = require('mongodb');

async function checkSegments() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    const db = client.db('meeshy');
    
    const attachment = await db.collection('MessageAttachment').findOne({
      _id: '696fa4bb99c187348614a699'
    });
    
    console.log('=== TRANSCRIPTION ===');
    console.log('Text:', attachment.transcription?.text?.substring(0, 50) + '...');
    console.log('Nombre de segments:', attachment.transcription?.segments?.length);
    console.log('\n=== PREMIERS 3 SEGMENTS ===');
    attachment.transcription?.segments?.slice(0, 3).forEach((seg, i) => {
      console.log(`Segment ${i}:`, JSON.stringify(seg, null, 2));
    });
    
  } finally {
    await client.close();
  }
}

checkSegments().catch(console.error);
