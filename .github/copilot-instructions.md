# Copilot Instructions for pnpm-settings-migrator

## Project Overview

This is a **single-purpose CLI migration tool** that moves pnpm configuration from legacy locations (`package.json` pnpm field, `.npmrc` file) to the modern `pnpm-workspace.yaml` format. The tool is designed for one-time execution in pnpm workspaces.

## Architecture Pattern

**Core-Utils-CLI Structure**:

- `src/core.ts` - Main migration logic with file parsing/writing
- `src/cli.ts` - CAC-based command line interface
- `src/utils/` - Specialized utilities (fs operations, npmrc parsing, color output)
- Type definitions in `src/types.ts` with strong typing for all config formats

## Key Implementation Details

### File Processing Strategy

- Uses `detect-indent` to preserve existing indentation in JSON/YAML files
- Employs `yaml` library's Document API for precise YAML manipulation
- All file operations go through wrapper functions (`fsReadFile`, `fsWriteFile`) that handle encoding and trailing newlines consistently

### Configuration Migration Logic

The tool merges settings from multiple sources with this precedence:

1. Existing `pnpm-workspace.yaml` (preserved)
2. `package.json` pnpm field
3. `.npmrc` pnpm settings (using `PNPM_SETTINGS_FIELDS` constant)
4. Optional: `package.json` resolutions → pnpm overrides

### Unique Patterns

- **Negative CLI options**: Uses `--no-clean-npmrc` style flags (handled by CAC automatically)
- **Field mapping**: `PNPM_SETTINGS_FIELDS` array defines which .npmrc keys are pnpm-related
- **Case conversion**: npmrc kebab-case keys → camelCase for pnpm settings
- **Safe operations**: Always checks file existence before reading; preserves files when no migration needed

## Development Workflows

### Build System

- **tsdown** (not tsc) for dual-build: library (`src/index.ts`) + CLI (`src/cli.ts`)
- `bin.mjs` wrapper imports built `dist/cli.js`
- Use `pnpm start` for development (tsx), `pnpm build` for production

### Testing Strategy

Currently minimal (placeholder test) - integration tests would require fixture directories with sample `package.json`/`.npmrc`/`pnpm-workspace.yaml` files.

### Dependencies of Note

- `@pnpm/types` for official pnpm type definitions
- `@ntnyq/utils` for utilities like `pick()`
- `pathe` instead of node:path for cross-platform paths
- `defu` for deep merging with precedence

## Code Conventions

- **Explicit exports**: Each module exports specific functions/types (no default exports except configs)
- **Error handling**: Uses consola for user-friendly logging, throws for CLI error handling
- **Type safety**: Strong typing with interfaces for all config file formats
- **Path handling**: Always use `resolve()` for absolute paths from cwd
