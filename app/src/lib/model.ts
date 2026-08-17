import { createOpenAI } from '@ai-sdk/openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';

// Injected by OpenChoreo from the model + vector-store resource outputs. Read with
// fallbacks (not thrown) so the module can be imported during `next build`, when the
// runtime env is not yet present; validated per request via assertConfigured().
export const PROJECT_ENDPOINT = (process.env.FOUNDRY_PROJECT_ENDPOINT ?? '').replace(/\/+$/, '');
export const MODEL = process.env.MODEL_DEPLOYMENT ?? 'gpt-5-mini';
export const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID ?? '';

export function assertConfigured(): void {
  const missing: string[] = [];
  if (!PROJECT_ENDPOINT) missing.push('FOUNDRY_PROJECT_ENDPOINT');
  if (!VECTOR_STORE_ID) missing.push('VECTOR_STORE_ID');
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`);
}

// Keyless auth: the service principal (AZURE_CLIENT_ID / AZURE_TENANT_ID /
// AZURE_CLIENT_SECRET) comes from the platform secret store. getBearerTokenProvider
// caches the Entra token and only refreshes when it is close to expiry.
const credential = new DefaultAzureCredential();
export const getFoundryToken = getBearerTokenProvider(credential, 'https://ai.azure.com/.default');

// Foundry speaks the OpenAI-compatible surface at {project-endpoint}/openai/v1.
// apiKey can only be a static string, so a fresh bearer is set per request in fetch.
export const foundry = createOpenAI({
  baseURL: `${PROJECT_ENDPOINT}/openai/v1`,
  apiKey: 'entra',
  fetch: async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${await getFoundryToken()}`);
    return fetch(input, { ...init, headers });
  },
});

// file_search is only available on the Responses API.
export const chatModel = foundry.responses(MODEL);
