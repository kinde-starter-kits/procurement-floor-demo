import {httpRouter} from 'convex/server';
import {registerRoutes} from '@kinde-oss/kinde-convex-agent-auth';
import {components} from './_generated/api';

// Mounts the component's HTTP routes. This exposes POST /agent/verify —
// bearer-token introspection returning the verifyCaller result — which the
// Node search route calls to resolve the caller's org from its token.
// /agent/elevation/respond returns 501 (no authorizeApprover hook yet).
const http = httpRouter();
registerRoutes(http, components.agentAuth);

export default http;
