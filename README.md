# StoreIt

StoreIt is a cloud file storage and sharing web app, similar in spirit to
Google Drive. Users sign in with a one-time code sent to their email, upload
files, browse them by type, and share individual files with other users by
email address. Files are stored in Appwrite and are only reachable through the
app's own authenticated endpoints.

> **Origin.** The project started from the JavaScript Mastery
> "Storage Management Solution" tutorial
> ([JavaScript-Mastery-Pro/storage_management_solution](https://github.com/JavaScript-Mastery-Pro/storage_management_solution)).
> It has since been audited and reworked: access control, private file
> delivery, upload progress, validation, dependency security updates,
> automated tests and a reproducible backend setup. See
> [What changed](#what-changed-from-the-tutorial-version).

## Features

- **Passwordless sign-in.** Sign up or sign in with a 6-digit email OTP
  (Appwrite email tokens). Wrong or expired codes show a clear error; resend
  has a cooldown.
- **Uploads with real progress.** Drag and drop or pick files. Each upload
  shows a progress bar driven by actual upload events and can be cancelled.
  Files are limited to 50 MB, checked in the browser and enforced again on the
  server.
- **Browse and organise.** Dashboard with storage usage by category and
  recent files; pages for Documents, Images, Media and Others with search and
  sorting (date, name, size); rename and delete.
- **Sharing.** Owners share a file with one or more email addresses and can
  revoke access. Recipients see shared files in their lists and can view or
  download them, but cannot rename, re-share or delete them.
- **Private file delivery.** The storage bucket is private. Files are
  streamed through `/api/files/[id]`, which checks the session and the
  owner/recipient list on every request.
- **Responsive UI** for desktop and mobile.

## Tech stack

- **Next.js 15** (App Router, server actions, route handlers) with **React 19**
  and **TypeScript**
- **Appwrite Cloud**: Auth (email OTP), Databases, Storage, via the
  `node-appwrite` server SDK
- **Tailwind CSS**, **shadcn/ui** (Radix UI), **React Hook Form** + **Zod**,
  **Recharts**, **react-dropzone**
- **Vitest** (unit tests) and **Playwright** (end-to-end tests)

## Architecture

```
Browser ──► Next.js (App Router)
             ├─ Server components / server actions   lib/actions/*.ts
             │    sign-in, files list, rename, share, delete
             ├─ POST /api/files          upload (multipart, XHR progress)
             └─ GET  /api/files/[id]     view / ?download=1
                        │
                        ▼  node-appwrite with a server-side API key
                   Appwrite: Auth · Database (users, files) · Storage bucket
```

- All Appwrite access happens on the server through the TablesDB and Storage
  APIs. The API key (`NEXT_APPWRITE_KEY`) is never sent to the browser, and
  the tables and the bucket grant no client permissions.
- The session is an httpOnly, `SameSite=Strict` cookie holding the Appwrite
  session secret. `getCurrentUser()` validates it with Appwrite on every
  request.
- Access rules live in `lib/file-access.ts`: owners can do everything; users
  listed in a file's `users` array (by email) can read it. Every server action
  and route handler loads the file document on the server and checks these
  rules. IDs, names and extensions sent by the client are not trusted.
- `/api/files/[id]` renders only passive types inline (images, PDF, audio,
  video, plain text). Everything else (HTML, SVG, scripts, unknown types) is
  forced to download. Responses carry `nosniff` and a `sandbox` CSP, so
  uploaded content cannot run script in the app's origin.

Data model (created by `npm run setup:appwrite`):

| Table | Columns |
| --- | --- |
| `users` | `fullName`, `email`, `avatar`, `accountId` (Appwrite user id) |
| `files` | `name`, `type`, `extension`, `size`, `url`, `bucketFileId`, `accountId`, `owner` → users (many-to-one), `users` (emails shared with) |

## Getting started

### Prerequisites

- **Node.js 20.9 or newer.** Tested on Node 24 LTS (see `.nvmrc`) and
  Node 26. Older `node-appwrite` releases (up to v22) fail on recent Node
  versions with `fetch failed`; this project uses v28, which works.
- An [Appwrite Cloud](https://cloud.appwrite.io) project (the free plan is
  enough).

### 1. Install

```bash
nvm use            # Node 24
npm ci
```

If your shell exports `NODE_ENV=production`, unset it for development
(`unset NODE_ENV`). Otherwise npm skips dev dependencies and `next dev`
misbehaves.

### 2. Configure Appwrite

1. Create a project in Appwrite Cloud. From **Settings**, copy the **API
   Endpoint** and **Project ID**.
2. Create an API key (**Overview → API Keys**) with these scopes:
   - Auth: `users.read`, `users.write`, `sessions.write`
   - Database: all scopes
   - Storage: all scopes
3. Copy `.env.example` to `.env.local` and fill in the endpoint, project ID
   and API key.
4. Create the database, collections, indexes and private bucket:

   ```bash
   npm run setup:appwrite
   ```

   The script is idempotent and writes the resource IDs into `.env.local`.

Email OTP sign-in must be enabled under **Auth → Settings** (it is on by
default).

### 3. Run

```bash
npm run dev                  # http://localhost:3000
# or a production build
npm run build && npm start
```

## Testing

```bash
npm test                     # unit tests (Vitest)
npm run typecheck            # TypeScript
npm run lint                 # ESLint
npm run build                # production build (fails on type/lint errors)

npm run build
npm run test:e2e             # public/security browser tests (Playwright)
E2E_LIVE=1 npm run test:e2e  # + full workflow against your Appwrite project
```

- Playwright uses its bundled Chromium (`npx playwright install chromium`), or
  your installed Chrome with `E2E_CHANNEL=chrome`.
- The live workflow creates throwaway `@example.com` users through the
  admin API, then covers: OTP sign-in (wrong and correct code), upload,
  server-side size and empty-file limits, view and download headers, access
  denied for other users and anonymous requests, forced download of HTML,
  sharing (including invalid emails), recipient permissions, search, sort,
  rename (including path-like names), revoking a share, delete and sign-out.
  `workflow-extra.spec.ts` adds: a code cannot be reused, empty and oversized
  files are rejected in the browser without an upload request, directory
  components are stripped from uploaded names, sharing with a second person
  keeps the first (and removing one keeps the other), dashboard usage, and
  mobile navigation without horizontal overflow.
  The suites delete their users and files afterwards. The sign-in step makes
  Appwrite send one OTP email to the test `@example.com` address.

## What changed from the tutorial version

Security:

- Rename, share and delete server actions now require a signed-in owner. Before,
  any caller could modify or delete any file by ID.
- The upload derives the owner from the session instead of trusting
  client-supplied IDs, and validates name and size on the server.
- Files are served through an authenticated route from a private bucket.
  Before, they used public Appwrite URLs, so anyone with a link could read
  any file.
- Uploaded HTML/SVG are no longer rendered inline from the app's origin.
- Upgraded Next.js 15.0.2 → 15.5.27 and React 19 RC → 19.0.8 to fix
  published advisories, including the React Server Components RCE.
- Removed `"use server"` from the Appwrite client module, so the admin
  client factory is no longer exposed as a server action.
- Stopped logging OTP codes and account IDs in the browser console.
- Added security headers. Session cookies are `Secure` in production.

Bugs:

- Sharing replaced the existing recipient list, and removing one recipient
  could wipe it. It now adds and removes correctly.
- Upload failures were silent and the "progress" was a looping GIF. Uploads
  now show real progress, errors, cancel and a refresh on completion.
- Sign-in for an unknown email did nothing; the error now says so. OTP
  errors and resend are surfaced.
- Opening a file's action menu also opened the file in a new tab.
- Storage usage counted only the first 25 files. Type pages always showed
  "Total: 0 MB".
- Unknown routes like `/foo` showed Documents; they now 404. Sorting dropped
  the search query.
- Type and lint errors were hidden by `ignoreBuildErrors`. They are fixed,
  and the build now enforces them.
- `convertFileSize(size, 0)` ignored the requested 0 decimals ("2.0 GB").

## Known limitations

- Video and audio are served as complete files without HTTP range requests.
  Playback works, but seeking in large videos downloads the whole file first.
- Files pass through the Next.js server and are buffered in memory (up to
  50 MB per upload or download). This suits a demo or small deployment, not
  heavy traffic.
- Sharing is by email address. A recipient sees the file once they have a
  StoreIt account with that email. There are no public share links.
- The 2 GB quota on the dashboard is a display figure; it is not enforced.
- Sign-in reveals whether an email has an account (a deliberate UX choice).
  Brute-force protection for OTP codes relies on Appwrite's rate limits.
- `next lint` is deprecated in Next.js 15.5 and will need migrating to the
  ESLint CLI before upgrading to Next.js 16.
- `npm audit` still reports the PostCSS copy bundled inside Next.js 15.5
  (it only processes this project's own CSS at build time; the fix requires
  Next.js 16) and advisories in dev/test tooling (Vitest, ESLint
  dependencies) that need breaking major upgrades. None ship to the browser.

## License

No license has been chosen, so all rights are reserved by default. The project
began as a reworked copy of the JavaScript Mastery tutorial listed under
*Origin*. At the time of writing that upstream repository could not be reached
(HTTP 404) and no explicit license for it could be confirmed, so the licensing
of the inherited code is unverified. Confirm the upstream terms before choosing
an open-source license for this project.
