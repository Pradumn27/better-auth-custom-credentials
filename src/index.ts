export { credentialsPlugin } from './server';
export type {
  CredentialsPluginOptions,
  VerifyFn,
  VerifyResult,
} from './server';

export {
  extendAuthClientWithCredentials,
  signInWithCredentials,
} from './client';
