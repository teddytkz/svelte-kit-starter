# Auth API

> HTTP reference for the JWT auth endpoints. Endpoints live under `/api/auth/*` and accept/return JSON. Success responses set an `auth` cookie; errors do not.

**Last updated:** 2026-06-17
**Base URL (dev):** `http://127.0.0.1:5173`
**Content type:** `application/json` for all request and response bodies.
**Auth cookie:** see [Cookies](#cookies).

---

## Cookies

The session rides in a single cookie:

| Attribute | Value | Notes |
|-----------|-------|-------|
| Name | `auth` | |
| Value | HS256 JWT | Payload: `{ sub: <userId>, username, iat, exp }` |
| `HttpOnly` | yes | Not readable from JavaScript |
| `SameSite` | `Lax` | Sent on top-level navigations; not on cross-site sub-requests |
| `Path` | `/` | |
| `Secure` | yes in prod (`NODE_ENV=production`), no in dev | In dev the cookie works on `http://localhost` |
| `Max-Age` | `604800` (7 days) | Refreshed on every successful login |

> Never read or write the `auth` cookie from client JavaScript — the API endpoints return the same user data via `GET /api/auth/me`.

---

## `POST /api/auth/register`

Create a new account and sign the user in.

**Auth required:** No.

### Request body

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `username` | string | yes | `^[a-z0-9_-]{3,32}$` (case-insensitive, normalized to lower-case server-side) |
| `password` | string | yes | ≥ 8 characters |
| `name` | string | yes | 1–255 characters, trimmed |
| `email` | string | yes | Matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`; lower-cased server-side |

### Response codes

| Status | Body | When |
|--------|------|------|
| `201 Created` | `{ user: PublicUser }` | New user created. `Set-Cookie: auth=…; HttpOnly; SameSite=Lax; Path=/` |
| `400 Bad Request` | `{ error: string }` | Invalid JSON, or one of the four validation rules failed |
| `409 Conflict` | `{ error: "Username already taken" }` | `username` already exists (pre-check or unique-key race) |
| `500 Internal Server Error` | `{ error: "Internal server error" }` | Database / hashing failure |

`PublicUser` shape: `{ id: number, username: string, name: string, email: string }`.

### Example

```bash
curl -i -X POST http://127.0.0.1:5173/api/auth/register \
    -H 'Content-Type: application/json' \
    -d '{"username":"alice","password":"hunter22","name":"Alice","email":"alice@example.com"}'
```

```http
HTTP/1.1 201 Created
Set-Cookie: auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…; HttpOnly; SameSite=Lax; Path=/
Content-Type: application/json

{
  "user": {
    "id": 1,
    "username": "alice",
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

### Error example

```json
{ "error": "Password must be at least 8 characters" }
```

---

## `POST /api/auth/login`

Exchange a username + password for a session cookie.

**Auth required:** No (a valid existing session is left untouched).

### Request body

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `username` | string | yes | Same regex as `register` |
| `password` | string | yes | Non-empty (1+ characters) |

### Response codes

| Status | Body | When |
|--------|------|------|
| `200 OK` | `{ user: PublicUser }` | Credentials valid. `Set-Cookie: auth=…; HttpOnly; SameSite=Lax; Path=/` |
| `400 Bad Request` | `{ error: "Invalid username or password" }` | Body missing/malformed, or `username` fails the regex |
| `401 Unauthorized` | `{ error: "Invalid username or password" }` | Username not found, **or** password mismatch — same body to prevent enumeration |
| `500 Internal Server Error` | `{ error: "Internal server error" }` | Database / hashing failure |

> The 400 and 401 messages are identical. Login never tells the client which side failed. The "user not found" path also runs a dummy `bcrypt.compare` against `DUMMY_BCRYPT_HASH` so response times are indistinguishable from the "wrong password" path.

### Example

```bash
curl -i -c cookies.txt -X POST http://127.0.0.1:5173/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"alice","password":"hunter22"}'
```

```http
HTTP/1.1 200 OK
Set-Cookie: auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…; HttpOnly; SameSite=Lax; Path=/
Content-Type: application/json

{
  "user": {
    "id": 1,
    "username": "alice",
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

### Error example

```json
{ "error": "Invalid username or password" }
```

---

## `GET /api/auth/me`

Return the currently authenticated user, or `{ user: null }` if the request is anonymous.

**Auth required:** No — but you only get a populated `user` if you send a valid `auth` cookie. The endpoint exists precisely so clients can probe "am I signed in?" without triggering a redirect.

### Request

No body. Send the `auth` cookie (`Cookie: auth=<token>`) to identify the session.

### Response codes

| Status | Body | When |
|--------|------|------|
| `200 OK` | `{ user: PublicUser }` | Valid session |
| `401 Unauthorized` | `{ user: null }` | Missing cookie, expired token, bad signature, or token's `sub` does not match any user |

### Example

```bash
curl -i -b cookies.txt http://127.0.0.1:5173/api/auth/me
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "user": {
    "id": 1,
    "username": "alice",
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

### Error example

```json
{ "user": null }
```

---

## `POST /api/auth/logout`

Clear the session cookie. Idempotent — safe to call when there is no session.

**Auth required:** No. Calling `logout` without a session still returns `200` and a `Set-Cookie` that clears any stale cookie.

### Request

No body. Sending the `auth` cookie is optional.

### Response codes

| Status | Body | When |
|--------|------|------|
| `200 OK` | `{ ok: true }` | Always. `Set-Cookie: auth=; Max-Age=0; Path=/` to clear the cookie |

### Example

```bash
curl -i -b cookies.txt -X POST http://127.0.0.1:5173/api/auth/logout
```

```http
HTTP/1.1 200 OK
Set-Cookie: auth=; Max-Age=0; Path=/
Content-Type: application/json

{ "ok": true }
```

---

## Cross-references

- Design record: [planning/login-jwt-auth.md](../planning/login-jwt-auth.md)
- Security hardening pass: [planning/fix-review-findings.md](../planning/fix-review-findings.md)
- User-facing setup + browser flow: [auth.md](../auth.md)
- Server helpers: [`src/lib/server/auth.ts`](../../src/lib/server/auth.ts)
- `?next=` validator: [`src/lib/safe-next.ts`](../../src/lib/safe-next.ts)
