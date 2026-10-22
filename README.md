# SketchTogether

A real-time collaborative drawing canvas. Draw together from any device — iPad, tablet, laptop, phone. Supports stylus pens with pressure sensitivity and palm rejection.

Built with Next.js 15, Socket.io, Prisma 7, and react-konva.

---

## Features

- Real-time collaboration — see others draw stroke by stroke
- Pencil, pen, brush, calligraphy, eraser, line, shapes, text, select tools
- Stylus support — pressure sensitivity, tilt-based calligraphy, palm rejection
- 6 canvas surfaces: plain, kraft, watercolor, newsprint, parchment, blackboard
- Gridlines, dot grid, and lined overlays
- Layer management with lock/visibility controls
- Version history — save and revert canvas snapshots
- Live chat per room
- Infinite canvas with pan and zoom
- Rustic paper aesthetic

---

## Run locally

```bash
npm install
npm run db:generate   # generate Prisma client (required on first run)
npm run dev
```

Opens at `http://localhost:3000`. Do not use `next dev` — the custom `server.ts` is required for Socket.io.

> **Note:** The server auto-bootstraps the SQLite database on first start by applying any pending migration SQL, so `prisma migrate dev` is not required for local development.

---

## Docker

**Requirements:** Docker Desktop (or Docker Engine + Compose)

**Build:**

```bash
npm run docker:build
# or: docker build -t sketchtogether:latest .
```

**Run:**

```bash
npm run docker:run
# or: docker compose up
```

Opens at `http://localhost:3000`. Canvas data persists in a named Docker volume (`sketchtogether-data`).

**Docker versions used:**

- Base image: `node:22-alpine`
- Node.js: 22 (LTS)
- npm: 10

---

## Get a public link (share with anyone)

There are three ways depending on your setup:

### Option 1 — Quick share with ngrok (easiest, no domain needed)

Install [ngrok](https://ngrok.com), then while the container is running:

```bash
ngrok http 3000
```

ngrok gives you a public HTTPS URL like `https://abc123.ngrok-free.app` that anyone can open. Works instantly, no server needed.

### Option 2 — VPS / cloud server (self-hosted, permanent)

1. Spin up a server (DigitalOcean Droplet, Linode, Hetzner, AWS EC2, etc.) — a $6/mo instance is enough
2. Install Docker on it
3. Copy your project or clone from git
4. Run `docker compose up -d`
5. Point your domain's DNS A record to the server's IP
6. Set up nginx (or Caddy) as a reverse proxy with SSL

Example Caddy config (auto HTTPS):

```
sketchtogether.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Your public link: `https://sketchtogether.yourdomain.com`

### Option 3 — Kubernetes (production, scalable)

> Note: SQLite requires `replicas: 1`. For multi-replica deployments, migrate to PostgreSQL.

**Prerequisites:**

- A Kubernetes cluster (DigitalOcean, GKE, EKS, etc.)
- `kubectl` configured to point at your cluster
- nginx-ingress controller installed
- cert-manager installed for automatic TLS

**Setup:**

1. Edit [k8s/ingress.yaml](k8s/ingress.yaml) — replace `sketchtogether.yourdomain.com` with your domain
2. Edit [k8s/cert-issuer.yaml](k8s/cert-issuer.yaml) — replace `you@yourdomain.com` with your email
3. Push your image to a registry (Docker Hub, GHCR, etc.):
   ```bash
   docker tag sketchtogether:latest yourusername/sketchtogether:latest
   docker push yourusername/sketchtogether:latest
   ```
4. Update the image field in [k8s/deployment.yaml](k8s/deployment.yaml)
5. Apply everything:
   ```bash
   npm run k8s:apply
   # or: kubectl apply -f k8s/
   ```
6. Point your domain's DNS to the cluster's load balancer IP (`kubectl get svc -n ingress-nginx`)

cert-manager will automatically issue a Let's Encrypt TLS cert. Your public link: `https://sketchtogether.yourdomain.com`

**ngrok is the quickest way to test if you just want to share with someone now.** The VPS route is the best long-term option for a permanent public link.

---

## Tech stack

- **Frontend**: Next.js 15, React 19, react-konva (Konva.js), Radix UI, Framer Motion
- **Real-time**: Socket.io 4 (WebSocket + polling fallback)
- **Backend**: Node.js 22, custom HTTP server (`server.ts`)
- **Database**: SQLite via Prisma 7 with `@prisma/adapter-better-sqlite3`
- **Styling**: Tailwind CSS 3
- **Container**: Docker (`node:22-alpine`), Docker Compose
- **Orchestration**: Kubernetes manifests in `k8s/`

---

## Database

Prisma client is generated to `generated/prisma/` (configured in `prisma/schema.prisma`).

```bash
npm run db:generate  # generate Prisma client from schema
npm run db:migrate   # create and apply a new migration
npm run db:studio    # open Prisma Studio GUI
```

SQLite database is stored at `prisma/dev.db` locally, or in a Docker volume / Kubernetes PVC in production.

### Schema

| Model | Description |
|---|---|
| `Room` | A shared canvas session with persistent canvas state |
| `Layer` | Named layers per room with lock/visibility state |
| `Version` | Labelled canvas snapshots for version history |
| `ChatMessage` | Per-room chat messages |

---

## Socket.io events

| Event | Direction | Description |
|---|---|---|
| `room:join` | client → server | Join a room by ID with a display name |
| `room:state` | server → client | Full room state on join (canvas, layers, versions, chat) |
| `room:user-joined` | server → clients | Notifies others when a user joins |
| `room:user-count` | server → client | Current user count in the room |
| `draw:stroke-start` | client ↔ server | Broadcast stroke start to other users |
| `draw:stroke-update` | client ↔ server | Broadcast incremental stroke points |
| `draw:stroke-end` | client ↔ server | Finalise stroke and persist to DB |
| `canvas:clear` | client ↔ server | Clear the canvas for all users |
| `cursor:move` | client ↔ server | Broadcast live cursor position |
| `layer:update` | client ↔ server | Sync layer changes across users |
| `version:save` | client → server | Save a named version snapshot |
| `version:restore` | client → server | Restore canvas to a saved version |
| `chat:message` | client ↔ server | Send/receive chat messages |
