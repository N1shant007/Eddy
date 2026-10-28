import { ApiBackend } from './api';

/** the one backend: the Eddy server (Firestore + Cloud Storage + Gemini) */
export function makeBackend() {
  return new ApiBackend();
}
