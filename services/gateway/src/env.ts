import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables in order of priority:
// 1. .env.local (highest priority - local development overrides)
// 2. .env (base configuration)

const envPath = path.resolve(process.cwd(), '.env');
const envLocalPath = path.resolve(process.cwd(), '.env.local');

// Load base .env first
const baseConf = dotenv.config({ path: envPath });

// Then load .env.local which will override base values
let localConf;
if (fs.existsSync(envLocalPath)) {
  localConf = dotenv.config({ path: envLocalPath });
} else {
}

export default localConf || baseConf;
