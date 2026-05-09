# Configuration Editor Context

This directory contains the web-based configuration editor for the ByteBell ingestion engine.

## Purpose

Provides a visual interface for managing system-wide configuration settings (Mongo, Neo4j, Redis, API Keys, etc.) without requiring direct manual editing of JSON files.

## Components

- `configRoute.ts`: Express router handling `GET /config` (serving the UI) and `POST /config/save` (applying updates).
- `configEditorTemplate.ts`: Assembles the final HTML page.
- `configEditorStyles.ts`: CSS styles for the glassmorphic dark theme.
- `configEditorScripts.ts`: Client-side JavaScript for form handling, validation, and API communication.

## Contract

- **Consumption**: Used by `packages/server/src/routes.ts` to expose configuration endpoints.
- **Dependencies**: Relies on `@bb/config` for reading and writing configuration values and `@bb/types` for the `Config` enum and validation rules.
- **UI State**: Interactive elements are rendered via Vanilla JS to ensure zero-dependency portability within the server's build.

## State Management

- All configuration changes made via the `POST /config/save` endpoint are persisted atomically to the local `~/.bytebell/config.json` via the `@bb/config` writer.
- Required fields (e.g., database URIs) are highlighted in the UI if empty to ensure the environment is fully provisioned.
