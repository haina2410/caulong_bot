import 'dotenv/config';

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

import login from 'facebook-chat-api';
import { z } from 'zod';

const credentialsSchema = z.object({
  FB_EMAIL: z.string().min(1, 'Set FB_EMAIL in your environment'),
  FB_PASSWORD: z.string().min(1, 'Set FB_PASSWORD in your environment'),
  FB_APPSTATE_PATH: z.string().optional(),
});

type LoginApprovalError = Error & {
  error?: string;
  continue?: (code: string) => void;
};

function isLoginApprovalError(error: unknown): error is LoginApprovalError {
  console.log('Checking if error is LoginApprovalError:', error);
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as LoginApprovalError).error === 'login-approval' &&
    typeof (error as LoginApprovalError).continue === 'function'
  );
}

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function promptForCode(rl: readline.Interface): Promise<string> {
  return await new Promise((resolve) => {
    const ask = () => {
      rl.question('Enter the 2FA code: ', (answer) => {
        const trimmed = answer.trim();
        if (!trimmed) {
          console.log('Code cannot be empty. Please try again.');
          ask();
          return;
        }
        resolve(trimmed);
      });
    };

    ask();
  });
}

async function loginWithTwoFactorSupport(credentials: {
  email: string;
  password: string;
}): Promise<import('facebook-chat-api').Api> {
  const rl = createReadline();

  console.log('Logging in to Facebook...');

  try {
    return await new Promise((resolve, reject) => {
      const attempt = () => {
        login(
          { ...credentials },
          (error: LoginApprovalError | null, api: import('facebook-chat-api').Api | undefined) => {
            if (error) {
              console.error('Login error:', error);
              if (isLoginApprovalError(error)) {
                console.log('Two-factor authentication required.');

                void promptForCode(rl)
                  .then((code) => {
                    error.continue?.(code);
                  })
                  .catch((promptError) => {
                    reject(promptError);
                  });
                return;
              }

              reject(error);
              return;
            }

            if (!api) {
              reject(new Error('Login failed: API instance missing.'));
              return;
            }

            resolve(api);
          },
        );
      };

      attempt();
    });
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const env = credentialsSchema.parse(process.env);

  const credentials = {
    email: env.FB_EMAIL,
    password: env.FB_PASSWORD,
  };

  const api = await loginWithTwoFactorSupport(credentials);

  const appState = api.getAppState();
  const outputPath = env.FB_APPSTATE_PATH ?? path.resolve(process.cwd(), '.fbappstate.json');
  const resolvedOutput = path.resolve(outputPath);

  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, JSON.stringify(appState, null, 2), 'utf8');

  console.log(`Saved app state to ${resolvedOutput}`);
}

void main().catch((error) => {
  console.error('Failed to create app state:', error);
  process.exitCode = 1;
});
