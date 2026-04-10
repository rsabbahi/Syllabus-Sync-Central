# SyllabusSync — replit.md

## Overview

SyllabusSync is a student workflow management web application. It helps students unify their courses, deadlines, and grades in one place. Core features include:

- **Course management**: Create or join courses using a code/section system
- **Syllabus parsing**: Upload a PDF syllabus; the server extracts text and uses OpenAI to auto-generate assignments and tasks
- **Grade tracker**: Enter scores per assignment and see live current grade and "what-if" projections
- **Calendar**: Aggregated deadline view with iCal export and Google Calendar deep-link support
- **Task manager**: Personal to-do list (auto-generated from syllabi or manually created)
- **User profile**: Avatar (emoji preset or file upload), university, bio

The app uses **Replit Auth** (OpenID Connect) for authentication. All app routes are protected and tied to the authenticated user's ID.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Full-Stack Layout

The project is a **monorepo** with three top-level areas:

| Directory | Purpose |
|-----------|---------|
| `client/` | React SPA (Vite) |
| `server/` | Express API server (Node, TypeScript, ESM) |
| `shared/` | Schema, route definitions, and type contracts shared by both sides |

In development, Vite runs as middleware inside Express (see `server/vite.ts`). In production, Vite builds to `dist/public/` and Express serves it as static files.

### Frontend Architecture

- **React 18** with **Wouter** for client-side routing (lightweight alternative to React Router)
- **TanStack Query (React Query v5)** for all server state — fetching, caching, mutations, and invalidation
- **shadcn/ui** component library (Radix UI primitives + Tailwind CSS) for all UI elements
- Custom hand-rolled components (`Button`, `Input`, `Layout`, `LoadingScreen`) supplement shadcn where needed
- **Tailwind CSS** with CSS custom properties for theming (light/dark mode via `darkMode: ["class"]`)
- Fonts: Inter (body) and Plus Jakarta Sans (display headings), loaded from Google Fonts
- Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`

**Page structure** (all protected by `ProtectedRoute`):
- `/` → Dashboard (tasks + upcoming deadlines)
- `/courses` → Course directory (create / join)
- `/courses/:id` → Course detail (assignments tab + syllabus upload tab)
- `/calendar` → Monthly calendar view
- `/tracker` → Grade tracker
- `/profile` → User profile editor
- `/login` → Public login page (redirects to `/api/login` which is Replit Auth)

### Backend Architecture

- **Express.js** server (`server/index.ts`) — single HTTP server, also used for Vite HMR websocket in dev
- **Route registration** in `server/routes.ts` — applies `isAuthenticated` middleware to all `/api/*` app routes before handlers
- **Storage layer** (`server/storage.ts`) — `IStorage` interface with a PostgreSQL implementation via Drizzle ORM; all DB access goes through this abstraction
- **PDF parsing**: `pdf-parse` (loaded via CommonJS `createRequire` workaround since the project is ESM)
- **OpenAI integration**: Used on the syllabus upload endpoint to parse extracted PDF text into structured assignment/task data

**Replit integrations** live under `server/replit_integrations/`:
- `auth/` — Replit OIDC (OpenID Connect) via `openid-client` + Passport.js; session stored in Postgres (`sessions` table via `connect-pg-simple`)
- `chat/` — Chat conversation storage + OpenAI chat completions routes
- `audio/` — Voice recording/playback + OpenAI Whisper (speech-to-text) + TTS streaming routes
- `image/` — OpenAI image generation routes
- `batch/` — Generic batch processing utility with rate limiting (`p-limit`) and retries (`p-retry`)

### Data Storage

- **PostgreSQL** (provisioned via `DATABASE_URL` env var)
- **Drizzle ORM** with `drizzle-kit` for schema management (`db:push` script)
- Schema defined in `shared/schema.ts`

**Key tables:**

| Table | Description |
|-------|-------------|
| `sessions` | Express session store (required by Replit Auth) |
| `users` | User profiles (id, email, name, avatar, university, bio) |
| `courses` | Course records (code, name, section, term, createdBy) |
| `course_students` | Many-to-many: users enrolled in courses |
| `syllabi` | Uploaded syllabus files (fileUrl, rawText, parsedContent JSON) |
| `assignments` | Assignment records per course (name, type, dueDate, weight, maxScore) |
| `user_grades` | Per-user grade entries for assignments |
| `tasks` | Personal to-do items (auto-generated or manual) |
| `conversations` | Chat conversation records |
| `messages` | Chat messages per conversation |

### Authentication & Authorization

- **Replit Auth** (OIDC) — users log in via `/api/login`, which redirects to Replit's OIDC provider
- Sessions are persisted in the `sessions` Postgres table; TTL is 1 week
- The `isAuthenticated` middleware checks `req.user` (set by Passport) and returns `401` if missing
- All app API route groups (`/api/courses`, `/api/assignments`, `/api/grades`, `/api/tasks`, `/api/profile`, `/api/calendar`, `/api/syllabi`) require authentication
- User identity is always taken from `req.user.claims.sub` (never from request body)

### API Design

Routes are defined as a typed `api` object in `shared/routes.ts` using Zod schemas for inputs and responses. Client hooks (`client/src/hooks/`) reference these same path constants and schemas, giving end-to-end type safety without a separate codegen step.

URL parameters are interpolated via a `buildUrl()` helper (e.g., `/api/courses/:id` → `/api/courses/42`).

### Build System

- **Development**: `tsx server/index.ts` — Vite runs as Express middleware
- **Production build**: custom `script/build.ts` runs Vite for the client, then esbuild for the server (bundling an allowlist of server deps for faster cold starts, externalizing the rest)
- Output: `dist/public/` (client), `dist/index.cjs` (server)

---

## External Dependencies

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Express session signing secret |
| `REPL_ID` | Replit deployment ID (used for OIDC client ID) |
| `ISSUER_URL` | OIDC issuer (defaults to `https://replit.com/oidc`) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API key (via Replit AI Integrations) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI base URL override (Replit proxy) |

### Third-Party Services

| Service | Usage |
|---------|-------|
| **Replit Auth (OIDC)** | User authentication and identity |
| **OpenAI API** | Syllabus parsing (GPT), chat completions, image generation, voice (Whisper + TTS) — all routed through Replit AI Integrations proxy |
| **PostgreSQL** | Primary database (sessions, users, courses, assignments, grades, tasks, conversations) |
| **Google Fonts** | Inter and Plus Jakarta Sans typefaces |
| **Google Calendar** | Deep-link URL generation for adding events (no OAuth required) |

### Key NPM Packages

| Package | Role |
|---------|------|
| `drizzle-orm` / `drizzle-kit` | ORM and schema migrations |
| `pg` | PostgreSQL client |
| `connect-pg-simple` | Postgres-backed Express session store |
| `openid-client` + `passport` | Replit OIDC authentication |
| `multer` | Multipart file upload handling (syllabi, avatars) |
| `pdf-parse` | PDF text extraction |
| `openai` | OpenAI SDK |
| `@tanstack/react-query` | Server state management on the client |
| `wouter` | Lightweight React router |
| `@radix-ui/*` + `shadcn/ui` | Accessible UI primitives |
| `tailwindcss` | Utility-first CSS |
| `date-fns` | Date formatting and arithmetic |
| `zod` | Runtime schema validation (shared between client and server) |
| `p-limit` + `p-retry` | Concurrency control and retry logic for batch AI calls |
| `memoizee` | OIDC config caching |
| `nanoid` | Unique ID generation |