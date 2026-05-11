import AWS from '@aws-sdk/client-secrets-manager';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
// Fetch secret key from secrets manager
// dotenv.config();
// const region = process.env.AWS_REGION || 'us-west-1'
// const SecretsManager = new AWS.SecretsManager({ region });
// const result = await SecretsManager.getSecretValue({
//   SecretId: process.env.AWS_FIREBLOCKS_SECRETS_MANAGER_ID,
// });
// export const secretKey = result.SecretString
// Export the path to the secret key file instead of the content
// FireblocksWeb3Provider will read the file itself
export const secretKeyPath = path.resolve('./src/api/secrets/fireblocks_secret.key');

// Also export the content in case it's needed elsewhere
export const secretKey = await fs.readFileSync(
  secretKeyPath,
  'utf8'
);

