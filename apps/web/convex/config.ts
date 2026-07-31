import {query} from './_generated/server';
import {authzMode} from './authz';

// The authorization mode, read from the deployment env server-side. The UI shows
// this — it is never a client toggle that fakes the mode.
export const mode = query({
  args: {},
  handler: async () => ({mode: authzMode()})
});
