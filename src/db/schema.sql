-- Wine Cellar MCP — initial schema.
--
-- The wiki is the source of truth (ADR-0001). Every constraint below upholds a rule
-- recorded in business-docs/wiki; where this file and the wiki disagree, the wiki is
-- right and this file is the bug. Decisions this schema depends on:
--
--   ADR-0015  closed enumerations are database types; body/tannin/acidity share one type
--   ADR-0016  a non-vintage wine has no vintage; the identity key is NULLS NOT DISTINCT
--   ADR-0017  deletion is a status; email is unique only among living accounts
--   ADR-0018  token hash is unique, live label is unique per user, scopes is never empty
--   ADR-0019  bottles are held as lots; stock is status = 'in_cellar'
--   ADR-0020  stated bounds are CHECK constraints as well as Zod schemas
--   ADR-0021  wine_search matches a stored tsvector plus trigram indexes
--
-- Requires Postgres 15 or newer, for NULLS NOT DISTINCT (ADR-0016).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email (ADR-0017)
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram search (ADR-0021)

-- ---------------------------------------------------------------------------
-- Types (ADR-0015)
--
-- These are the closed enumerations of business-docs/wiki/shared/data-types.md.
-- Adding a value is a migration, deliberately. The TypeScript unions in
-- src/types.ts and each tool's Zod schema must stay identical to these.
-- ---------------------------------------------------------------------------

CREATE TYPE user_role     AS ENUM ('admin', 'member', 'guest');
CREATE TYPE user_status   AS ENUM ('active', 'suspended', 'deleted');  -- ADR-0017
CREATE TYPE wine_type     AS ENUM ('red', 'white', 'rose', 'sparkling',
                                   'orange', 'dessert', 'fortified');
CREATE TYPE sweetness     AS ENUM ('bone_dry', 'dry', 'off_dry', 'medium_sweet', 'sweet');
CREATE TYPE cellar_status AS ENUM ('in_cellar', 'drunk', 'gifted');
CREATE TYPE audit_action  AS ENUM ('user_created', 'user_role_changed', 'user_status_changed',
                                   'user_deleted', 'token_issued', 'token_revoked');

-- ADR-0015: one type for body, tannin and acidity. Declaration order IS the scale
-- order, which is what lets palate fit be a distance computed in SQL. A NULL is an
-- absent measurement, never a scale position (ADR-0006) — normal for tannin on whites.
CREATE TYPE intensity AS ENUM ('low', 'medium_minus', 'medium', 'medium_plus', 'high');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email       citext      NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role        user_role   NOT NULL DEFAULT 'member',
  status      user_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ADR-0017: a soft-deleted account releases its address. Consequence: email is not a
-- stable identifier for a person across time. users.id is; audit_log stores the id.
CREATE UNIQUE INDEX users_email_live_uniq ON users (email) WHERE status <> 'deleted';

-- Supports the last-active-admin guard. The guard itself still needs SELECT ... FOR
-- UPDATE to be safe against concurrent suspensions — an open question in the wiki,
-- NOT resolved by this index.
CREATE INDEX users_active_admins ON users (id) WHERE role = 'admin' AND status = 'active';

CREATE TABLE api_tokens (
  id            uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ADR-0012: only the SHA-256 hash is ever stored. bytea, not hex text, so the
  -- length check below actually means something (ADR-0018).
  token_hash    bytea NOT NULL,
  token_last4   text  NOT NULL CHECK (length(token_last4) = 4),
  label         text  NOT NULL CHECK (length(label) BETWEEN 1 AND 64),
  -- NULL = inherit the user's role in full. Never an empty array (ADR-0018).
  -- A scope that exceeds the user's role is rejected at issuance AND intersected at
  -- every use, so a surplus scope can never lie dormant and activate on promotion.
  scopes        text[],
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT api_tokens_hash_len        CHECK (octet_length(token_hash) = 32),
  CONSTRAINT api_tokens_scopes_nonempty CHECK (scopes IS NULL OR cardinality(scopes) > 0)
);

-- ADR-0018: makes the auth lookup provably single-row.
CREATE UNIQUE INDEX api_tokens_hash_uniq ON api_tokens (token_hash);

-- ADR-0018: one live token per client label, so revoking Gemini leaves Claude working.
-- Scoped to unrevoked rows, so a revoked label can be reissued under the same name.
CREATE UNIQUE INDEX api_tokens_label_uniq
  ON api_tokens (user_id, lower(label)) WHERE revoked_at IS NULL;

CREATE INDEX api_tokens_by_user ON api_tokens (user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Preferences
--
-- ADR-0017: cascades on soft and hard delete alike.
-- ADR-0020: jsonb columns default to their empty shapes, so a user who has never
-- written preferences reads back the same shape as everyone else.
-- ---------------------------------------------------------------------------

CREATE TABLE user_prefs (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  likes       jsonb NOT NULL DEFAULT '{"grapes":[],"regions":[],"styles":[]}',
  dislikes    jsonb NOT NULL DEFAULT '{"grapes":[],"regions":[],"styles":[]}',
  avoid       jsonb NOT NULL DEFAULT '[]',
  budget_min  numeric(10,2) CHECK (budget_min >= 0),
  budget_max  numeric(10,2) CHECK (budget_max >= 0),
  sweetness   sweetness,
  body        intensity,
  tannin      intensity,
  acidity     intensity,
  notes       text CHECK (notes IS NULL OR length(notes) <= 4000),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prefs_budget_order   CHECK (budget_min IS NULL OR budget_max IS NULL
                                         OR budget_min <= budget_max),
  CONSTRAINT prefs_likes_shape    CHECK (jsonb_typeof(likes)    = 'object'),
  CONSTRAINT prefs_dislikes_shape CHECK (jsonb_typeof(dislikes) = 'object'),
  CONSTRAINT prefs_avoid_shape    CHECK (jsonb_typeof(avoid)    = 'array')
);

-- No currency is recorded for budget_min/budget_max. That is an open question in the
-- wiki, not an oversight here: see business-docs/wiki/features/preferences/decisions.md.

-- ---------------------------------------------------------------------------
-- Catalogue
--
-- ADR-0008: a wine carries no ownership, quantity, price paid or drink window.
-- Every field except name is optional — a wine from a blurry photo may be nothing
-- but { name, producer } and must still be storable, findable and recommendable.
-- ---------------------------------------------------------------------------

CREATE TABLE wines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  producer       text CHECK (producer IS NULL OR length(producer) BETWEEN 1 AND 300),
  vintage        smallint CHECK (vintage BETWEEN 1800 AND 2100),   -- NULL = NV (ADR-0016)
  country        text CHECK (country   IS NULL OR length(country)   <= 100),
  region         text CHECK (region    IS NULL OR length(region)    <= 200),
  subregion      text CHECK (subregion IS NULL OR length(subregion) <= 200),
  wine_type      wine_type,
  grapes         text[] NOT NULL DEFAULT '{}',
  abv            numeric(4,2)  CHECK (abv BETWEEN 0 AND 100),   -- percent by volume
  sweetness      sweetness,
  body           intensity,
  tannin         intensity,
  acidity        intensity,
  avg_price      numeric(10,2) CHECK (avg_price >= 0),          -- currency: open question
  style_tags     text[] NOT NULL DEFAULT '{}',
  food_pairings  text[] NOT NULL DEFAULT '{}',
  tasting_notes  text CHECK (tasting_notes IS NULL OR length(tasting_notes) <= 8000),
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- ADR-0021: generated, not trigger-maintained, so it can never fall out of sync with
  -- the row. 'simple' rather than 'english' because the corpus is multilingual proper
  -- nouns. Weights make a wine NAMED Malbec outrank one that merely mentions it.
  search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')),          'A') ||
    setweight(to_tsvector('simple', coalesce(producer, '')),      'A') ||
    setweight(to_tsvector('simple', coalesce(region, '')),        'B') ||
    setweight(to_tsvector('simple', coalesce(subregion, '')),     'B') ||
    setweight(to_tsvector('simple', coalesce(country, '')),       'C') ||
    setweight(to_tsvector('simple', coalesce(tasting_notes, '')), 'D')
  ) STORED
);

-- ADR-0016: NULLS NOT DISTINCT is what makes this constrain non-vintage wines. Without
-- it a null never equals a null, so every NV upsert would insert again.
--
-- The lookup in the wine_upsert path MUST use `vintage IS NOT DISTINCT FROM $3`.
-- A plain `=` misses the row this index would refuse to duplicate, turning a merge
-- into a constraint violation. That is the trap ADR-0016 exists to prevent.
CREATE UNIQUE INDEX wines_identity_uniq
  ON wines (lower(producer), lower(name), vintage) NULLS NOT DISTINCT;

CREATE INDEX wines_search        ON wines USING gin (search_tsv);
CREATE INDEX wines_name_trgm     ON wines USING gin (name     gin_trgm_ops);
CREATE INDEX wines_producer_trgm ON wines USING gin (producer gin_trgm_ops);
CREATE INDEX wines_grapes        ON wines USING gin (grapes);
CREATE INDEX wines_pairings      ON wines USING gin (food_pairings);
CREATE INDEX wines_style_tags    ON wines USING gin (style_tags);
CREATE INDEX wines_type_price    ON wines (wine_type, avg_price);
CREATE INDEX wines_region_lower  ON wines (lower(region));

-- ---------------------------------------------------------------------------
-- Cellar
--
-- ADR-0019: a row is a LOT — bottles of one wine acquired together. There is
-- deliberately no UNIQUE (user_id, wine_id): two purchases at two prices, in two
-- places, closing at two times are two rows. Partial gifting splits a lot, and the
-- closed half keeps its count as the record of what left the cellar.
-- ---------------------------------------------------------------------------

CREATE TABLE cellar_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ADR-0019: RESTRICT, not CASCADE. The shared catalogue may not drop a wine
  -- somebody owns, and no tool deletes wines today — which is exactly when to
  -- make it impossible.
  wine_id        uuid NOT NULL REFERENCES wines(id) ON DELETE RESTRICT,
  quantity       integer NOT NULL DEFAULT 1,
  purchase_price numeric(10,2) CHECK (purchase_price >= 0),
  purchase_date  date,
  location       text CHECK (location IS NULL OR length(location) <= 200),
  drink_from     date,
  drink_until    date,
  status         cellar_status NOT NULL DEFAULT 'in_cellar',
  notes          text CHECK (notes IS NULL OR length(notes) <= 4000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- ADR-0020: an inverted window silently breaks both ready_to_drink and drink_soon.
  CONSTRAINT cellar_window_order CHECK (drink_from IS NULL OR drink_until IS NULL
                                        OR drink_from <= drink_until),

  -- ADR-0019, AS AMENDED 2026-08-29. There is deliberately no constraint forcing a
  -- closed lot to hold zero bottles, and the amendment was forced by writing the code.
  -- A gifted lot has to record HOW MANY bottles were gifted — that record is the whole
  -- reason partial gifting splits a row instead of decrementing one — and a CHECK
  -- demanding quantity = 0 on a closed row makes it unrepresentable. The original
  -- ADR's two clauses could not both stand; the split won.
  --
  -- What replaces it is a query rule rather than a column rule: STOCK IS
  -- status = 'in_cellar'. Every read that counts bottles must filter on it, and the
  -- partial indexes below exist so that filter is hard to forget.
  CONSTRAINT cellar_quantity_non_negative CHECK (quantity >= 0)
);

CREATE INDEX cellar_by_user ON cellar_items (user_id, status);
CREATE INDEX cellar_by_wine ON cellar_items (user_id, wine_id) WHERE status = 'in_cellar';
CREATE INDEX cellar_window  ON cellar_items (user_id, drink_until) WHERE status = 'in_cellar';

-- ---------------------------------------------------------------------------
-- Reviews
--
-- Deliberately NO unique constraint on (user_id, wine_id): whether one user may
-- review the same wine twice is an open product question, and it decides what
-- "avg 92 over 4 reviews" counts. See ADR-0020 and the reviews feature page.
-- ---------------------------------------------------------------------------

CREATE TABLE reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wine_id          uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  -- ADR-0020: enforced here AND in Zod. Aggregate ratings are shown to users as fact
  -- in the engine's reason strings, so the range must be guaranteed, not validated.
  rating           smallint NOT NULL CHECK (rating BETWEEN 1 AND 100),
  drank_on         date,
  occasion         text CHECK (occasion  IS NULL OR length(occasion)  <= 200),
  body_text        text CHECK (body_text IS NULL OR length(body_text) <= 8000),
  would_buy_again  boolean,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reviews_by_wine ON reviews (wine_id, created_at DESC);
CREATE INDEX reviews_by_user ON reviews (user_id, created_at DESC);
-- Personal history is 0.20 of the score: the caller's past ratings of this wine,
-- its grape, its region, its producer.
CREATE INDEX reviews_history ON reviews (user_id, wine_id) INCLUDE (rating);

-- ---------------------------------------------------------------------------
-- Audit log
--
-- Administrative actions only. Catalogue writes, cellar mutations, reviews and
-- DENIED permission checks leave no trail — a known gap, recorded in the wiki.
-- Tokens are never written here, in plaintext or hashed (ADR-0012).
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action          audit_action NOT NULL,
  target_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_by_target ON audit_log (target_user_id, created_at DESC);
CREATE INDEX audit_by_actor  ON audit_log (actor_user_id,  created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER t_users        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_user_prefs   BEFORE UPDATE ON user_prefs   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_wines        BEFORE UPDATE ON wines        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_cellar_items BEFORE UPDATE ON cellar_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_reviews      BEFORE UPDATE ON reviews      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
