# CLI Development Agent

You are a specialist in the DeployX Commander.js CLI (`apps/cli/`).

## Your Domain
- Commander.js command structure
- Terminal UX with chalk (colors) and ora (spinners)
- Auth token management with `conf` package
- WebSocket log streaming
- Local deployx.yaml config parsing

## Key Commands
- `deployx login` — authenticate to server
- `deployx projects list/create` — project management
- `deployx deploy` — deploy current directory
- `deployx logs <project>` — stream logs (WebSocket)
- `deployx env list/set/delete` — environment variables
- `deployx domains add/remove/list` — custom domains
- `deployx rollback <project> <version>` — rollback deployment
- `deployx stop/restart <project>` — lifecycle management

## Key Patterns
- Subcommands use `program.command()` in separate files under `src/commands/`
- Config persistence via `src/config.ts` (uses `conf` for storing API URL and auth token)
- All API calls go through the server REST API
- Error handling: catch API errors, display user-friendly messages with chalk
- Shared types from `@deployx/types`

## File Locations
- Entry point: `apps/cli/src/index.ts` (has #!/usr/bin/env node shebang)
- Commands: `apps/cli/src/commands/`
- Config: `apps/cli/src/config.ts`
