# Agoré — Architecture

**Document ID:** AG-ARCH-003  
**Version:** 0.1  
**Status:** Working technical reference  
**Last reviewed:** 10 October 2026

## 1. Purpose

This document describes Agoré's current application architecture, major components, data-access patterns, and security boundaries.

It is intended to guide ongoing development and prevent inconsistent implementation as the platform grows.

This is a snapshot of the repository structure, not a claim that every feature has passed functional, security, or production-readiness testing.

## 2. Architectural direction

Agoré uses a modular Next.js application backed by Supabase.

The current direction is to maintain a modular monolith: related product capabilities remain within one application and share a consistent authentication, data-access, and security foundation.

The architecture should support:

- A global social platform rather than a region-specific or institution-specific application.
- Clear boundaries between public content and private user data.
- Consistent identity and authorisation across posts, profiles, and conversations.
- Independent evolution of product capabilities without premature microservices.
- Reliable migration, testing, deployment, and incident-response processes.
- Future growth without requiring avoidable architectural rewrites.

### Core principles

1. **Server-side authority:** Sensitive operations must be authorised on the server.
2. **Least privilege:** Components should receive only the access they require.
3. **Explicit access control:** Authentication alone does not grant access to every resource.
4. **Data integrity:** Validate inputs and enforce important invariants at appropriate layers.
5. **Defence in depth:** Application checks supplement database permissions and other security controls.
6. **Incremental evolution:** Prefer small, reviewable changes over broad rewrites.

## 3. Technology stack

The repository currently uses the following technologies:

| Component | Technology | Responsibility |
|---|---|---|
| Application framework | Next.js App Router | Routing, rendering, server components, and API handlers |
| UI | React | Interactive application interface |
| Language | TypeScript | Application code and type checking |
| Styling | Tailwind CSS | Layout and visual presentation |
| Authentication | Supabase Auth | User authentication and session identity |
| Database | Supabase PostgreSQL | Persistent application data |
| Database client | Supabase JavaScript SDK | Database access through authorised clients |
| Server-rendered authentication | `@supabase/ssr` | Cookie-aware server and browser clients |
| Request validation | Zod | Runtime validation of supported API inputs |
| Icons | `lucide-react` | Interface iconography |
| Web-push support | `web-push` | Server-side web-push integration |
| Hosting | Vercel | Application deployment and hosting |

Dependency versions are maintained in `package.json` and should be treated as the source of truth.

## 4. System overview

The current architecture follows this general flow:

```text
User's browser
      |
      v
Next.js application
      |
      +--> React pages and components
      |
      +--> API route handlers
      |       |
      |       +--> Authentication and authorisation
      |       +--> Input validation
      |       +--> Business rules
      |       +--> Data access
      |       +--> Response handling
      |
      +--> Supabase browser/server clients
      |       |
      |       +--> Supabase Auth
      |       +--> PostgreSQL and database policies
      |       +--> Supabase Storage
      |
      +--> Privileged server-only operations
      |       |
      |       +--> Service-role client
      |       +--> Explicit server-side access checks
      |
      +--> Web-push integration
              |
              +--> Browser push subscriptions
              +--> Push delivery through the server
```

This diagram is conceptual. The precise path taken by an operation depends on its implementation.

## 5. Application structure

### 5.1 User interface and pages

Pages are organised under the `app/` directory.

Important page locations include:

| Path | Responsibility |
|---|---|
| `app/page.tsx` | Public landing page |
| `app/home/` | Home feed |
| `app/app/explore/` | Discovery interface |
| `app/create/` | Post creation |
| `app/profile/` | Profiles and profile editing |
| `app/messages/` | Conversation list and conversation views |
| `app/post/` | Individual post views |
| `app/notifications/` | Notification interface |
| `app/settings/` | Account and application settings |
| `app/auth/` | Authentication interface |
| `app/onboarding/` | Initial profile and account setup |
| `app/support/` | User-facing support |
| `app/staff/support/` | Staff support interface |

The existence of a route does not establish that its complete user journey is functional or production-ready.

### 5.2 API route handlers

Application endpoints are implemented under `app/api/`.

Major groups include:

- `auth/` — invitation validation and related authentication flows.
- `posts/` — post operations, media, reactions, reposts, and reports.
- `comments/` — comment operations.
- `profile/` — profile and avatar operations.
- `users/` and `search/` — user-related and discovery operations.
- `conversations/` — direct and group conversations, membership, messages, attachments, and voice messages.
- `notifications/` and `push/` — in-app notifications and web-push support.
- `onboarding/` — profile and onboarding completion.
- `support/` and `staff/` — support cases and staff workflows.

Each handler must enforce the access rules for its own operation. A frontend control or hidden navigation item is not an authorisation boundary.

### 5.3 Shared libraries

The `lib/` directory contains shared infrastructure:

| Path | Responsibility |
|---|---|
| `lib/supabase/browser.ts` | Browser Supabase client |
| `lib/supabase/server.ts` | Cookie-aware server Supabase client |
| `lib/supabase/admin.ts` | Privileged server-only Supabase client |
| `lib/supabase/proxy.ts` | Session update and refresh logic |
| `lib/auth/invite.ts` | Invitation assertion functionality |
| `lib/messaging/conversation-access.ts` | Shared conversation-access rules |
| `lib/security/rate-limit.ts` | Rate-limiting utilities |
| `lib/notifications.ts` | Shared notification functionality |
| `lib/push.ts` | Web-push functionality |
| `lib/activity/visibility.ts` | Activity visibility logic |
| `lib/support/staff-auth.ts` | Staff support authorisation |

Reusable access-control rules should be centralised where appropriate. Security-sensitive rules must remain explicit and testable rather than being duplicated inconsistently across routes.

## 6. Authentication and session management

Supabase Auth is the identity foundation.

The current implementation uses cookie-aware Supabase clients and a root-level `proxy.ts` that delegates session handling to `lib/supabase/proxy.ts`.

The application must distinguish between:

- **Authentication:** establishing which user is making the request.
- **Authorisation:** determining whether that user may perform the requested action.
- **Onboarding:** determining whether a signed-in account has completed the required setup.
- **Account status:** determining whether the account is permitted to use the application.
- **Invitation eligibility:** enforcing the private-access requirement while it remains enabled.

The current V0 sign-in scope is:

1. Email and password.
2. Google OAuth.
3. Sign in with Apple.

OAuth provider configuration and enablement must be verified in Supabase before those methods are treated as operational.

The invitation gate is temporary product policy for V0. Removing it after V0 must not remove unrelated safeguards such as rate limiting, account-status checks, input validation, or abuse prevention.

## 7. Data-access architecture

Agoré uses separate Supabase client patterns for different execution contexts.

### 7.1 Browser client

`lib/supabase/browser.ts` creates the browser client using the public Supabase URL and publishable key.

The browser client must not contain service-role credentials or other server secrets.

Database Row Level Security (RLS) policies must enforce the database permissions intended for authenticated users. A user-controlled client request must never be assumed trustworthy merely because it originated from the application UI.

### 7.2 Server client

`lib/supabase/server.ts` creates a server client that reads and updates the relevant authentication cookies.

Use this client for normal user-scoped operations where database policies should enforce access.

API handlers must still validate inputs, handle authentication failures, and enforce application-level rules.

### 7.3 Privileged server client

`lib/supabase/admin.ts` creates a client using `SUPABASE_SERVICE_ROLE_KEY`.

This client is restricted to trusted server-side operations. Service-role access can bypass normal RLS protections, so each privileged operation must independently enforce the necessary authorisation and resource-access rules.

Requirements:

- Never expose the service-role key to the browser.
- Never place it in a `NEXT_PUBLIC_*` environment variable.
- Do not use privileged access merely to avoid fixing normal database permissions.
- Verify user identity, resource ownership, conversation membership, and other relevant permissions before accessing or changing protected data.
- Return only the minimum data required by the caller.
- Log failures without exposing secrets or private message content.

Any change to a privileged data-access path should receive explicit security review.

## 8. Core domain boundaries

### Identity and profiles

Profiles represent application identity, including public-facing profile information and account-specific settings.

Account category and verification status are separate concepts. Being classified as an organisation must not, by itself, confer a verification badge or privileged permissions.

### Social graph

Following, blocking, and related relationship data determine social interactions and influence which users and content may be surfaced.

Blocking rules must be enforced consistently across applicable APIs, not merely hidden in the interface.

### Content

Posts, comments, reactions, reposts, and associated media form the content domain.

Write operations must validate payloads and check permissions. Deleted or unavailable content must be handled consistently by all relevant retrieval paths.

### Messaging

Conversations are distinct from community spaces. The current model supports direct and group conversation types.

Membership, group administration, blocking, message access, attachment access, and read-status operations require appropriate authorisation.

Message and media endpoints must not disclose private conversation data to non-members.

### Notifications

Notifications and web-push subscriptions are separate concerns.

In-app notification creation, notification retrieval, push subscription management, and delivery must each have clearly defined permissions and failure handling.

A push-delivery failure must not automatically imply that the underlying application event failed.

### Support and staff tools

User support cases are distinct from public reports and content moderation.

Staff endpoints must verify staff authority on the server. A client-provided role, account category, or hidden admin interface is not sufficient evidence of permission.

Support-case content should be accessible only to authorised participants and staff members.

## 9. Security requirements

Changes to the application should preserve the following requirements.

### Request validation

- Validate request bodies, query parameters, path identifiers, and relevant uploaded-file metadata.
- Reject malformed or unsupported inputs.
- Apply sensible size and pagination limits.
- Use Zod or an appropriate equivalent at API boundaries.

### Authorisation

- Authenticate protected requests server-side.
- Verify access to the specific record or resource being requested.
- Enforce conversation membership before returning private conversation data.
- Apply account-status, blocking, reporting, and staff-permission rules wherever relevant.
- Never trust user-supplied user IDs or roles as proof of authority.

### Files and media

- Validate supported media types, file sizes, and other relevant metadata.
- Apply appropriate storage access policies.
- Prefer controlled or time-limited access for private media.
- Prevent one user from retrieving another user's private files through predictable storage paths.
- Avoid logging signed URLs or credentials unnecessarily.

### Abuse protection

- Use rate limits for sensitive and abuse-prone operations.
- Protect authentication, onboarding, invitations, messaging, search, reporting, and upload endpoints as appropriate.
- Consider automated abuse, enumeration, spam, and account-creation attacks.
- Ensure limits behave consistently across instances where distributed deployment requires shared state.

### Secrets and errors

- Keep all secrets in the hosting provider's server-side environment configuration.
- Never commit credentials, tokens, private keys, or real user secrets.
- Avoid returning internal database errors or implementation details to users.
- Log operational failures in a controlled manner without collecting unnecessary sensitive information.

These requirements describe the intended security posture; they do not assert that every endpoint has already been audited against them.

## 10. Database changes and migrations

Database schema and policy changes must be reviewable, repeatable, and safe to deploy.

The repository currently contains migration files in both:

- `supabase/migrations/`
- `app/supabase/migrations/`

This split is a known documentation and workflow concern. Before creating or applying further migrations, the project should establish one canonical migration directory and document the history-reconciliation process.

Until that is resolved:

- Do not assume every migration is automatically applied by the deployment pipeline.
- Do not blindly execute every SQL file in both directories.
- Inspect migration contents and ordering before applying changes.
- Test schema, policy, and data changes against a separate development project.
- Verify the resulting database state before deploying application code that depends on it.
- Document any manual production changes so they can be reconciled with migration history.

The dedicated database and migration guide should define the approved workflow.

## 11. Environment configuration

The repository provides `.env.example` as the starting point for local configuration.

Current environment variables include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_SUBJECT`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

Actual required variables depend on the feature and execution path being used.

Local values belong in `.env.local`. Production values must be configured through the hosting environment.

Environment files containing secrets must remain untracked and must never be copied into public documentation.

## 12. Deployment and runtime

The application is hosted on Vercel and connected to Supabase.

A normal change should follow this lifecycle:

1. Review the proposed change and its affected application and database boundaries.
2. Implement it in a small, reviewable change.
3. Run type checking and the production build.
4. Test relevant authentication, authorisation, and user-facing flows.
5. Apply database changes using the approved migration process, when required.
6. Deploy through the configured GitHub/Vercel workflow.
7. Verify the deployed result and inspect relevant runtime logs.
8. Record unresolved issues and any necessary follow-up.

A successful deployment or build is not proof that a user journey works end to end.

Changes involving both code and database schema require particular attention to deployment ordering and compatibility.

## 13. Testing strategy

Testing should be layered.

### Static checks

```bash
npm run typecheck
npm run build
```

### Functional tests

Prioritise end-to-end verification of:

- Authentication and onboarding.
- Profile creation, editing, and avatar retrieval.
- Feed loading and post creation.
- Comments, reactions, reposts, and blocking.
- Direct messages, group conversations, and attachments.
- Notifications and push subscriptions.
- Reporting and support-case workflows.
- Settings, account status, and permissions.

### Security tests

Verify that:

- Anonymous requests cannot access protected resources.
- Users cannot access another user's private data by changing an identifier.
- Non-members cannot read protected conversations or attachments.
- Privileged endpoints reject unauthorised users.
- Invalid payloads and excessive requests are handled safely.
- RLS policies behave as expected independently of frontend controls.

Record whether each check is automated, manually verified, or still outstanding.

## 14. Architectural risks and open decisions

The following items require continuing attention:

1. **Migration standardisation:** Establish one authoritative migration workflow and reconcile the two existing directories.
2. **Privileged-client usage:** Audit every service-role operation for explicit access checks.
3. **Feature completeness:** Validate end-to-end behaviour instead of treating route existence as proof of readiness.
4. **Media access:** Confirm upload, metadata, storage policy, signing, and rendering paths work together.
5. **Notification delivery:** Test event creation, in-app retrieval, subscriptions, and actual push delivery independently.
6. **Abuse resistance:** Review rate-limit coverage and resource-intensive endpoints.
7. **Operational readiness:** Establish appropriate backups, incident procedures, monitoring, and recovery verification.
8. **Authentication expansion:** Configure and test Google and Apple OAuth before announcing availability.

Open decisions must be resolved through explicit engineering decisions rather than undocumented assumptions.

## 15. Change management

When introducing a new major capability:

1. Define its domain responsibility and data ownership.
2. Identify the affected routes, components, tables, storage objects, and permissions.
3. Decide which operations use normal user-scoped access and which genuinely require privileged access.
4. Define validation, failure behaviour, abuse protection, and relevant observability.
5. Update the appropriate tests and documentation.
6. Verify the deployment and any migration effects.

New capabilities should extend the existing architecture where practical. Introduce separate services only when there is a demonstrated need that the modular monolith cannot reasonably meet.

## 16. Related documents

- `README.md` — project overview and local setup.
- `LICENSE` — proprietary software notice.
- `SECURITY.md` — vulnerability reporting and responsible testing.
- `docs/database-and-migrations.md` — planned database and migration guide.

Other product, policy, quality, and operational documentation should be maintained as those documents are created and reviewed.

---

**Document maintenance:** Update this document when architectural boundaries, core infrastructure, privileged access patterns, or migration practices change. Keep statements about current implementation distinct from future design requirements.