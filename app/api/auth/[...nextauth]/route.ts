// Auth.js exposes handlers as { GET, POST }; this route file just
// destructures and re-exports them so Next can pick them up.
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
