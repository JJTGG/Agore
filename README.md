
# Agoré

**People first. Conversation at the center.**

Agoré is a social platform built around people, content, and communication. It is being developed to bring profiles, public conversations, social connections, discovery, and private messaging into one connected experience.

Agoré is designed for a global audience, with an emphasis on user agency, privacy, security, and safer participation.

> **Development status:** Agoré is pre-release software under active development. Features described in this README represent the project's scope and implementation direction; they are not a guarantee that every feature is complete, stable, or production-ready.

## Product direction

Agoré is being built around the following capabilities:

- **Profiles and identity** — personal profiles and tools for self-expression.
- **Social connections** — following, blocking, and managing interactions.
- **Posts and engagement** — sharing content and participating through comments, reactions, and reposts.
- **Messaging** — private conversations and group chats.
- **Discovery** — finding people and exploring public content.
- **Notifications** — in-app activity and supported web-push functionality.
- **Privacy and safety** — privacy settings, reporting workflows, access controls, and account-level safeguards.
- **Support** — workflows for handling user assistance and reports.
- **Account management** — authentication, onboarding, recovery, and user preferences.

The implementation of each capability must be assessed against the current source code and verified behavior rather than inferred from its presence in the roadmap.

## Principles

Agoré follows these product and engineering principles:

1. **People first.** Relationships and meaningful conversations remain central to the experience.
2. **Global by design.** Build for a worldwide audience rather than a single institution, city, or region.
3. **User agency.** Give users meaningful control over their accounts, interactions, and privacy settings.
4. **Privacy by design.** Restrict access to personal information and distinguish public content from private data.
5. **Safer participation.** Treat reporting, moderation, abuse prevention, and account security as core requirements.
6. **Server-side authority.** Enforce authentication, authorisation, and sensitive business rules on trusted server-side paths.
7. **Least privilege.** Grant each component and user only the access needed to perform its function.
8. **Incremental development.** Prefer small, reviewable changes over unnecessary rewrites or premature architectural complexity.

## Technology stack

Agoré currently uses:

| Technology | Purpose |
|---|---|
| Next.js App Router | Application framework, routing, rendering, and API handlers |
| React | User interface |
| TypeScript | Application language and type checking |
| Tailwind CSS | Styling and responsive layouts |
| Supabase Auth | Authentication and session identity |
| Supabase PostgreSQL | Persistent application data |
| Supabase JavaScript SDK | Database access |
| `@supabase/ssr` | Cookie-aware server and browser clients |
| Zod | Runtime input validation |
| `web-push` | Web-push integration |
| Vercel | Application hosting and deployment |
| GitHub Actions | Automated checks and continuous integration |

Dependency versions are maintained in `package.json` and `package-lock.json`.

## Authentication and account lifecycle

The V1 authentication scope is:

- Email and password.
- Google OAuth.

**Sign in with Apple is deferred and is not part of V1.**

The account lifecycle includes registration, authentication, session management, onboarding, password recovery, and account-status checks.

Authentication and authorisation are separate requirements. A valid session does not automatically grant access to every profile, message, report, administrative function, or database record.

Sensitive operations must validate the authenticated user's identity, enforce the relevant permissions, and respect account restrictions.

## Privacy, community standards, and legal information

Agoré's public-facing rules and disclosures are part of the product, not merely internal documentation.

The legal and community information area is being developed around these routes:

| Route | Purpose |
|---|---|
| `/guidelines` | Community standards and acceptable behaviour |
| `/terms` | Terms governing use of the service |
| `/privacy` | Information about personal-data processing and privacy rights |

The shared layout for this area is located at `app/(legal)/layout.tsx`.

A layout alone does not create these pages. Each route requires its own page implementation, accurate content, working navigation, and deployment verification before it can be considered available to users.

The internal document at `docs/privacy-policy.md` is a **draft for review**, not an approved legal policy. It contains unresolved publication requirements, including confirmation of the responsible operator's legal identity, the minimum permitted age, retention practices, international data transfers, and operational privacy procedures.

Public policy content must accurately reflect Agoré's actual behaviour and configuration. Legal pages should not promise safeguards, rights-handling procedures, or data practices that have not been established and verified.

For support, contact [agore.support@gmail.com](mailto:agore.support@gmail.com).

For security vulnerabilities, follow [SECURITY.md](./SECURITY.md).

## Repository structure

The main directories and files include:

| Path | Purpose |
|---|---|
| `app/` | Pages, layouts, API routes, and application flows |
| `components/` | Shared interface and application components |
| `lib/` | Shared libraries, data access, security, and business logic |
| `supabase/migrations/` | Canonical location for new database migrations |
| `docs/architecture.md` | Architecture and engineering reference |
| `docs/database-and-migrations.md` | Database-change and migration procedures |
| `docs/privacy-policy.md` | Internal privacy-policy draft |
| `SECURITY.md` | Security vulnerability reporting policy |
| `.github/workflows/` | GitHub Actions workflows |
| `.env.example` | Environment-variable template |
| `package.json` | Dependency manifest and project scripts |
| `package-lock.json` | Locked dependency tree |

The existence of a file or route does not, on its own, establish that its functionality is complete or production-ready.

## Configuration and secrets

Agoré uses environment variables for its Supabase connection and optional web-push functionality.

The supported environment-variable names are documented in `.env.example`.

| Variable | Purpose | Handling |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public application configuration |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | Public application configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-side Supabase access | Secret; server-side use only |
| `VAPID_SUBJECT` | Contact or application identity for web push | Configuration |
| `VAPID_PUBLIC_KEY` | Public web-push key | Public key |
| `VAPID_PRIVATE_KEY` | Private web-push key | Secret |

Not every variable is required for every feature or build. Configure the values appropriate to the environment and functionality being tested.

Security requirements:

- Never commit real secrets or populated local environment files.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` through browser code or a `NEXT_PUBLIC_*` variable.
- Never publish `VAPID_PRIVATE_KEY`.
- Do not paste credentials, access tokens, or private keys into issues, pull requests, or public documentation.
- Use a separate development environment for testing changes that could affect real users or data.

## Database and migrations

The canonical directory for new SQL migrations is:

`supabase/migrations/`

One historical support-workflow migration remains in `app/supabase/migrations/`. The repository and the actual Supabase database migration history must be reconciled before that file is moved, duplicated, or applied.

A migration file in Git is not proof that its SQL has been applied to the live database. Likewise, a successful SQL execution does not, by itself, prove that the intended schema and permissions are correct.

Before database changes are treated as ready for production:

1. Confirm the exact Supabase project being examined.
2. Compare repository migrations with the database's actual migration history.
3. Review affected tables, constraints, functions, grants, and Row Level Security policies.
4. Verify changes in a development environment.
5. Review production changes and recovery requirements before applying them.
6. Verify the resulting schema and application behaviour.

Do not reset a production database or alter migration history merely to clear an unexplained discrepancy.

Follow [the Database and Migration Guide](./docs/database-and-migrations.md) before changing the schema or applying migrations.

## Development and verification

### GitHub-first workflow

The repository supports a browser-based workflow for editing files, reviewing diffs, committing changes, and opening pull requests through GitHub.

**You do not need a local terminal to make or commit changes through GitHub's web or mobile interface.** The local-development instructions below are optional and apply only to contributors who choose to run the application on their own computer.

### Optional local development

For contributors who choose to run Agoré locally, the general requirements are:

- Node.js 22, matching the current CI environment.
- npm.
- A Supabase project configured for the functionality being tested.

After obtaining the repository and configuring the required environment variables, the available package scripts include:

| Script | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm test` | Run the configured regression tests |
| `npm run typecheck` | Run TypeScript checks |
| `npm run build` | Build the production application |
| `npm run start` | Start the production build |

The project may require environment configuration before development or production builds can succeed. Consult `.env.example` and the relevant technical documentation.

A successful build or type check does not prove that authentication, database permissions, messaging, uploads, notifications, or other end-to-end user journeys work correctly.

### Automated checks

GitHub Actions is configured to run the primary validation checks for pull requests targeting `main`.

The current CI workflow includes:

- Dependency installation and lockfile consistency checks.
- Configured regression tests.
- TypeScript checking.
- A production build.
- A dependency audit that rejects high and critical vulnerabilities.

A passing CI run is evidence that these automated checks completed successfully for the tested commit. It is not a substitute for functional testing, a security review, privacy-policy verification, or confirmation that the deployed application behaves correctly.

Always inspect the results associated with the exact commit or pull request being reviewed.

## Security

Security-sensitive changes must preserve the relevant boundaries across the interface, server, and database.

Requirements include:

- Validate request payloads and reject malformed or unsupported input.
- Enforce authentication and authorisation on the server.
- Apply Row Level Security and appropriate database permissions.
- Verify resource ownership and conversation membership where required.
- Restrict privileged operations and service-role credentials.
- Protect private profiles, messages, attachments, reports, and account data.
- Apply appropriate rate limits and abuse-prevention controls.
- Avoid returning private information in error responses or unnecessary logs.
- Test access-control changes against both authorised and unauthorised users.

A hidden interface control is not an authorisation boundary. A public endpoint must not be assumed safe merely because it is difficult to discover.

Agoré is pre-release software. Do not assume every feature or safeguard has passed production-readiness testing.

For vulnerability reporting instructions, see [SECURITY.md](./SECURITY.md).

## Documentation

The following documents provide further technical context:

- [Architecture Guide](./docs/architecture.md)
- [Database and Migration Guide](./docs/database-and-migrations.md)
- [Security Policy](./SECURITY.md)

The documentation should be updated alongside material changes to application behaviour, infrastructure, security controls, and operational procedures.

When documentation and implementation disagree, verify the current source code and actual system behaviour before treating either description as authoritative.

## License and ownership

Agoré is proprietary software. No permission to copy, modify, redistribute, host, or commercially deploy its source code is granted by this repository without prior written permission, except where applicable law provides otherwise.

The Agoré name, logo, wordmark, icons, and other brand assets are not licensed for reuse through this repository.

Third-party dependencies remain subject to their respective licenses.

See [LICENSE](./LICENSE).
