
# Agoré

**People first. Conversation at the center.**

Agoré is a social platform built around people, content, and communication. Designed for a global audience, Agoré brings meaningful connections, public conversations, and private communication into one connected space.

> **Development status:** Agoré V1 is under active development. The V1 authentication scope is email and password plus Google OAuth. Sign in with Apple is deferred and is not part of V1. Features, integrations, and configuration may remain incomplete until verified.

## Product direction

Agoré is being built around the following capabilities:

- **Profiles and identity** — personal profiles and tools for self-expression.
- **Social graph** — follow people, manage connections, and control unwanted interactions.
- **Posts and engagement** — share content and participate through replies, reactions, and reposts.
- **Messaging** — private conversations and member-based group chats.
- **Discovery** — explore people and public content.
- **Notifications** — in-app activity and web-push notification capabilities.
- **Trust, safety, and control** — reporting workflows, privacy settings, and account-level controls.

These describe the product scope and direction. They do not guarantee that every capability is complete or production-ready.

## Principles

- **People first:** Keep relationships and conversation central to the experience.
- **Global by design:** Build for a worldwide audience, not a single school, city, or region.
- **User agency:** Give people meaningful control over their social experience.
- **Safer participation:** Treat privacy, moderation, and abuse prevention as core product requirements.
- **Room to grow:** Maintain a modular foundation without introducing unnecessary architectural complexity.

## Technology

The application currently uses:

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Supabase for authentication, database access, and related backend services
- `web-push` for web-push notification integration

## Run locally

### Requirements

- Node.js 20.9 or later
- npm
- A Supabase project configured for Agoré

### Installation

Clone the repository and install its dependencies:

```bash
git clone https://github.com/JJTGG/Agore.git
cd Agore
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Populate `.env.local` with the values for your development environment.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-side key for trusted operations. Never expose it to browser code. |
| `VAPID_SUBJECT` | Contact URI or application URL identifying the web-push sender. |
| `VAPID_PUBLIC_KEY` | Public VAPID key for web push. |
| `VAPID_PRIVATE_KEY` | Private VAPID key for web push. Keep it secret. |

To generate a VAPID key pair, run:

```bash
npx web-push generate-vapid-keys
```

Configure the VAPID values when working with web-push functionality.

### Database setup

The canonical location for new SQL migrations is `supabase/migrations/`.

One historical support-workflow migration remains under `app/supabase/migrations/`. The repository and database migration histories must be reconciled before that file is moved, duplicated, or applied. Do not assume the files in Git prove that the live database has the corresponding changes.

Follow [the database and migration guide](./docs/database-and-migrations.md) before making schema or policy changes.

Use a separate development Supabase project. Do not blindly apply migrations to production, reset a remote production database, or alter migration history just to clear a discrepancy.

### Start development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful checks

```bash
npm run typecheck
npm run build
```

Run these after configuring the required environment variables. A successful type check or build does not, by itself, verify authentication, database permissions, uploads, messaging, or push notifications end to end.

## Security

- Never commit `.env.local`, service-role keys, VAPID private keys, or other secrets.
- Keep privileged Supabase operations on the server.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `NEXT_PUBLIC_*` variable.
- Keep authentication, authorisation, account-status checks, and database access controls in place as registration becomes public.
- Test database and configuration changes in development before applying them to production.
- Treat this as pre-release software; do not assume that all features or safeguards are complete.

## License and ownership

Agoré is proprietary software. No permission to copy, modify, redistribute, host, or commercially deploy its source code is granted by this repository without prior written permission, except where applicable law provides otherwise.

The Agoré name, logo, wordmark, icons, and other brand assets are not licensed for reuse through this repository. Third-party dependencies remain subject to their respective licenses.

See [LICENSE](./LICENSE).
