import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [/* googleAI() */], // Temporarily disabled as we are not using AI features yet
  model: 'googleai/gemini-2.0-flash',
});
