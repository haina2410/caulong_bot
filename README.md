# Cầu Lông Messenger Bot

A Facebook Messenger chatbot that helps badminton groups organise matches, track attendees, and split costs fairly. It uses the unofficial [`facebook-chat-api`](https://github.com/Schmavery/facebook-chat-api), the Kysely query builder, and PostgreSQL.

## Features

- `cl create` starts a new meetup for the current group chat and records the organiser
- `cl add <name>` adds or updates a participant, handling names with spaces and diacritics
- `cl date dd/mm/yy` sets the meetup date (Vietnam local time)
- `cl venue <google_maps_url>` stores a court location link
- `cl <name> pay <amount> [note]` records a rounded-up (nearest thousand) payment with an optional note
- `cl end` closes the meetup once planning is done
- `cl summary` shows participants, payments, rounded shares, and who needs to settle amounts with the organiser

## Requirements

- Node.js 22+ (Corepack enabled) and PNPM 10+
- PostgreSQL 14+

## Setup

1. Install dependencies:

   ```sh
   corepack pnpm install
   ```

2. Copy the example environment file and fill in your credentials:

   ```sh
   cp .env.example .env
   ```

   | Variable | Description |
   | --- | --- |
   | `DATABASE_URL` | Postgres connection string (e.g. `postgres://user:pass@localhost:5432/caulong_bot`) |
   | `PGSSL` | Set to `true` for managed Postgres that requires TLS |
   | `FB_APPSTATE_PATH` | Path to a saved Facebook appState JSON file (preferred) |
   | `FB_EMAIL` / `FB_PASSWORD` | Legacy login fallback when appState is not available |

3. Start a local Postgres instance and ensure the database referenced in `DATABASE_URL` exists.

## Development

- Type-check and build:

  ```sh
  corepack pnpm build
  ```

- Lint:

  ```sh
  corepack pnpm lint
  ```

- Run in watch mode (auto restarts on file changes):

  ```sh
  corepack pnpm start:dev
  ```

The bot waits for `SIGINT`/`SIGTERM` (Ctrl+C) to exit cleanly.

## Command Flow

1. `create` ensures there is only one planning meetup per chat and automatically enlists the organiser.
2. `add`, `pay`, `date`, and `venue` mutate the meetup only while it is in `planning` status.
3. Payments are normalised to the nearest thousand and stored with notes.
4. `summary` produces a transfer list showing positive balances (organiser receives) and negative balances (participants owe).

## VS Code Tasks

Two ready-to-use tasks live in `.vscode/tasks.json`:

- **Build bot** – runs `corepack pnpm build`
- **Start bot (dev)** – runs `corepack pnpm start:dev`

Both tasks rely on Corepack so you do not need a globally installed `pnpm`.

## Troubleshooting

- If Messenger login fails, refresh your `appState` export or enable 2FA app passwords.
- When running in development, ensure the Facebook account stays logged-in; otherwise `facebook-chat-api` may require cookies revalidation.
- For TLS-enabled Postgres, set `PGSSL=true`; for local instances leave it `false`.
