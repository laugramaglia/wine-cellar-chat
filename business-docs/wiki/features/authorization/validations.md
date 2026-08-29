---
feature: authorization
page: validations
status: stub
source_of_truth: wiki
code_refs:
  - README.md:110
  - README.md:147
updated: 2026-08-29
---

# Authorization — validations

Authorization validates one thing about the caller and several things about its own configuration. The configuration checks are the interesting ones: two of them are guaranteed by the type system, and the rest are not guaranteed at all.

| Input | Rule | Enforced where | Message on failure |
| --- | --- | --- | --- |
| tool being called | its declared permission must be in `props.permissions` | every handler, before doing any work (`README.md:135-136`) | `Permission denied: '{tool}' requires '{permission}'; your role is '{role}'.` |
| tool being listed | same check, applied as a filter | `tools/list` (`README.md:132-133`) | none — the tool is simply absent |
| every registered tool | must have an entry in `TOOL_PERMISSIONS` | the type system — a missing entry fails to compile (`README.md:147-148`, `README.md:414`) | compile error |
| `token.scopes` at issuance | must be a subset of that user's permissions | `token_create` (`README.md:224-225`) — owned by [[token-administration-index]] | **not specified** |
| `token.scopes` at use | intersected with the role's set, so it can only narrow | the resolution step (`README.md:332`) | none — narrowing is silent |

## Client vs server

The usual client/server split does not apply: **the client is an untrusted MCP client operated by a language model, and none of it is a validation surface.**

| Rule | Client | Server |
| --- | --- | --- |
| Which tools are offered | receives the filtered list — an affordance only | filters (`README.md:132`) |
| Whether a call is permitted | nothing. A client can call any tool name it likes | **the boundary** — every handler re-checks (`README.md:135-137`) |
| Which user's data is touched | nothing to send: no non-admin tool accepts a `user_id` (`README.md:154-156`) | structural, from `props` (`README.md:336`) |

The single rule that makes this safe is stated as a prohibition: **a tool must never rely on having been hidden** (`README.md:136-137`). See [ADR-0010](../../decisions/0010-two-layer-permission-enforcement.md) and [[security]].

## Not validated

Five real gaps. The first is the one to fix.

### 1. A token scope naming a permission its user's role lacks — undefined, with security consequences

`README.md:114` states the invariant: *a token can only ever narrow what its user's role allows, never widen it.* `README.md:332` gives the mechanism: an intersection, which does narrow by construction. **But nothing says what should happen to the surplus scope.** Two readings are both consistent with the text:

| Reading | Behaviour | Consequence |
| --- | --- | --- |
| Ignore it | the intersection silently drops it | `api_tokens.scopes` and `token_list` (`README.md:229`) report a permission the token does not have. Worse, if the user is *later promoted*, the surplus scope activates — a token issued to a member with `admin:users` in its scopes becomes an admin token the moment `user_update` changes the role, with nobody having decided that |
| Reject it | the token, or the `token_create` call, fails | the invariant is enforced at the boundary where a human is present |

The second reading is almost certainly intended — `README.md:225` calls `scopes` a "subset of that user's permissions" — but the check is only implied at issuance, and nothing says whether it is re-checked at use, nor what happens to a token whose user's role was narrowed after issuance. **Until this is decided, the safe implementation is both: validate the subset at `token_create` and intersect at every use.** Recorded in [[divergences]].

### 2. `ROLE_PERMISSIONS` has no completeness guarantee

[ADR-0011](../../decisions/0011-a-missing-permission-is-a-type-error.md) makes `TOOL_PERMISSIONS` exhaustive over the tool-name union, so a tool cannot exist without a permission. Nothing equivalent is stated for the role side (`README.md:147-148` covers only the tool map).

A new `Permission` can therefore be added, wired to a tool, and assigned to no role at all — producing a tool that compiles, lists for nobody, and can be called by nobody. It fails closed, which is the right direction, but it fails silently. The ADR names this itself: *"A `Permission` added without assigning it to a role is still possible; this ADR closes the tool side only."*

### 3. Whether an admin's own permissions can be narrowed by scopes

The matrix (`README.md:116-128`) treats `admin` as a column like any other, and `README.md:325` offers "optional `scopes` narrower than the user's role" without exception. The formula at `README.md:332` has no special case. So the answer is *yes* by implication — a scoped admin token can be a `catalog:read`-only token.

It is never said, and it is the kind of thing an implementer special-cases "for safety". A scoped admin token is a genuinely useful thing (an admin connecting a throwaway client); if it is intended, it should be stated.

### 4. `users.role` outside the enum

No behaviour is defined for a role value not in `admin | member | guest` (`README.md:58`). `role_permissions()` receiving an unknown role could return the empty set (fail closed), throw (fail loudly), or fall through to a default (fail open — catastrophic). Nothing says which. There is no stated database `CHECK` constraint either; the enum is given as a comment on the schema (`README.md:57-58`).

### 5. An empty, non-null `scopes` array

`scopes text[]` is nullable, and `null` means "inherit the role in full" (`README.md:63-64`). An empty array is a distinct, valid value whose intersection is the empty set — a token that can call nothing and lists nothing. No rule forbids creating one and no message explains one. See [[authorization-states]].

## Not validated, and correctly so

**Nothing about tool arguments is authorized.** Each tool declares exactly one permission (`README.md:112`); there is no field-level or value-level check. Ownership is not validated either, because it cannot be violated: the caller is read from `props`, never from input (`README.md:336`). That is [[security]]'s structural rule, and it is stronger than a validation.
