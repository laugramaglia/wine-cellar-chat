// Secrets are not part of wrangler.jsonc, so they are declared here and merged into the
// generated Env. Set with: npx wrangler secret put BOOTSTRAP_SECRET
declare global {
  interface Env {
    /** Gate for POST /bootstrap and POST /reset. Absent until `wrangler secret put`
     *  has run, so every read still checks for an empty value. */
    BOOTSTRAP_SECRET: string;
  }
}

export {};
