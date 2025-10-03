# Cầu Lông Bot

A modular badminton meetup assistant that ships with Facebook Messenger and Telegram adapters backed by a shared command core. The architecture allows plugging in additional transports (such as Discord) as they are implemented. It uses the unofficial [`facebook-chat-api`](https://github.com/Schmavery/facebook-chat-api), the Kysely query builder, and PostgreSQL.

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

   | Variable                   | Description                                                                         |
   | -------------------------- | ----------------------------------------------------------------------------------- |
   | `DATABASE_URL`             | Postgres connection string (e.g. `postgres://user:pass@localhost:5432/caulong_bot`) |
   | `PGSSL`                    | Set to `true` for managed Postgres that requires TLS                                |
   | `PLATFORM`                 | Target transport: `messenger` (default), `discord`, or `telegram`                   |
   | `FB_APPSTATE_PATH`         | Path to a saved Facebook appState JSON file (preferred when `PLATFORM=messenger`)   |
   | `FB_EMAIL` / `FB_PASSWORD` | Legacy login fallback when appState is not available (Messenger only)               |
   | `DISCORD_TOKEN`            | Bot token for the future Discord adapter (leave blank unless experimenting)         |
   | `TELEGRAM_TOKEN`           | Bot token from BotFather (required when `PLATFORM=telegram`)                        |

3. Start a local Postgres instance and ensure the database referenced in `DATABASE_URL` exists.

### Platform status

- **Messenger** – fully wired using `facebook-chat-api` and the shared command handler.
- **Telegram** – running on long-polling via `node-telegram-bot-api`; reacts to `cl ` commands posted in group chats where the bot is present.
- **Discord** – scaffold only for now; command routing is not implemented yet.

### Telegram setup

1. Talk to [@BotFather](https://t.me/BotFather) and create a bot. Copy the provided token into `TELEGRAM_TOKEN`.
2. Set `PLATFORM=telegram` in your environment. Restart the bot after changing the platform.
3. Add the bot to your Telegram group and disable privacy mode via BotFather if you want it to see plain messages (`/setprivacy -> Disable`).
4. Use the usual `cl ...` commands inside the group. The bot replies to the original message so the context stays clear.

### Generate appState (one-time setup)

Use the dedicated login script to exchange your email/password for an `appState` file that the bot can reuse later without storing your password:

```sh
corepack pnpm run login
```

The script expects `FB_EMAIL` and `FB_PASSWORD` in your environment (they can live in `.env`). If `FB_APPSTATE_PATH` is set, the generated file is written there; otherwise it defaults to `.fbappstate.json` in the project root. When two-factor authentication is enabled, the CLI will prompt you for the verification code and continue automatically.

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

- Reset the database (truncates all tables):

  ```sh
  corepack pnpm db:reset
  ```

- Seed demo data:

  ```sh
  corepack pnpm db:seed
  ```

## Docker

Build the production image (includes a compiled `dist/`):

```sh
docker build -t caulong-bot .
```

Run the container, mounting your `.env` for configuration:

```sh
docker run --rm --env-file .env caulong-bot
```

If you prefer overriding a single variable on the command line:

```sh
docker run --rm -e PLATFORM=telegram -e TELEGRAM_TOKEN=xxx caulong-bot
```

The container uses `node dist/index.js` as its entrypoint.

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
