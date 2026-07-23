import {handleAuth} from '@kinde-oss/kinde-auth-nextjs/server';

// Kinde's login / logout / register / callback endpoints:
//   /api/auth/login, /api/auth/logout, /api/auth/register, /api/auth/kinde_callback
export const GET = handleAuth();
