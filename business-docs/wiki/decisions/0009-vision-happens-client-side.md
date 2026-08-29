---
adr: 0009
title: Vision happens client-side; the server never sees images
status: accepted
date: 2026-08-29
affects:
  - wine-catalog
supersedes:
superseded_by:
source: README.md:11
---

# ADR-0009 — Vision happens client-side; the server never sees images

**Decision.** The connected agent reads the label and sends structured fields. The server accepts no image upload and stores no image of any kind.

## Context

The product's entry path starts with a photo of a bottle. The obvious design uploads it and runs OCR server-side — which means image storage, a vision model bill, a media pipeline, and a new class of user data to protect.

Every MCP client on the other end already has vision and web search.

## Decision

Vision and enrichment are the client's job (`README.md:11`, `README.md:34`). Image upload or storage of any kind is explicitly out of scope (`README.md:33`). Tools take structured fields only.

## Consequences

- No blob storage, no vision costs, no image retention policy, no images in the trust boundary.
- Quality of extraction becomes the client's property and will vary between Claude, Gemini, and a custom agent. The server cannot improve it.
- The server cannot re-process an old photo when extraction improves, because it never had one.
- Pairs with [[ADR-0007]]: extraction quality varies, so the merge must be conservative.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Upload images, OCR server-side | Storage, cost, and a whole category of user data, to duplicate what every client already does. |
| Accept an image URL and fetch it | Server-side fetch of user-supplied URLs, for the same duplicated capability. |

## Where this is enforced

Tool input schemas in `src/tools/` accept no binary or URL image field (planned). Cite as `ADR-0009`.
