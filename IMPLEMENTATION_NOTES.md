# Helping Hands – Backend + Authentication Upgrade

This archive keeps the existing frontend and adds:
- SQLite database file: `helping_hands.db`
- Account registration/login with password hashing (Node `crypto.scrypt`)
- 7-day bearer sessions
- User profile loaded from the database
- Server-side validation for name, email and phone
- Authenticated book/clothes donation, borrow and volunteer submissions
- User-linked records in the database
- Community updates API
- Existing public community item/volunteer data retained

## Important note about the live Render database
The supplied Render URL returned HTTP 503 when this archive was prepared, and the original project has no secure database-export endpoint. Therefore the live server's private SQLite file could not be downloaded. The included database is reconstructed from the database schema and seed/community data contained in the supplied project. It is not claimed to be a byte-for-byte copy of the private Render database.

## Run locally
1. Install Node.js.
2. Open this folder in VS Code terminal.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Main modified files
- `server.js` – authentication, sessions, validation, APIs, profile summary, safe page serving.
- `db.js` – users/sessions/user_id fields and community table plus existing data.
- `helping_hands.db` – included SQLite database.
- `login.html` – real login + hidden/show password.
- `register.html` – real account registration + validation.
- `profile.html` – database-backed user information and activity.
- `public/app.js` – auth token forwarding and universal input validation.
- `package.json` – start script and backend dependencies.

## Exact important code locations
- `server.js:16-27` validation rules.
- `server.js:29-55` password hashing, token generation and authentication middleware.
- `server.js:72-118` registration/login/logout/profile APIs.
- `server.js:138+` authenticated donation API.
- `server.js:157+` authenticated volunteer API.
- `server.js:169+` authenticated borrow API.
- `server.js:197-198` community/notification APIs.
- `db.js:28-47` users and sessions tables.
- `db.js:49+` existing item/volunteer/borrow/donation tables with user ownership.
- `public/app.js:1853+` auth token forwarding and browser-side validation.

## Render
The server reads `process.env.PORT`. Deploy this folder as a Node web service with start command:
`npm start`

SQLite on an ordinary ephemeral web-service filesystem is not a durable production database. If the Render service is restarted/redeployed and you need guaranteed persistence, move the database to a persistent disk or a managed database service.
