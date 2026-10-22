# SketchTogether - Self-Hosted Drawing App


## Overview

**SketchTogether** is a self-hosted, real-time collaborative drawing app inspired by the tactile feel of traditional paper. You run it yourself, you own the data, and you can share a link with anyone to draw together on the same canvas.

The project began from a personal vision to create digital art tools that capture the look and feel of old paper — rustic, textured, with that unbeatable roughness you can almost feel through the screen.

## Key Features

### Drawing Tools

- **Pencil, Ink Pen, Brush** - Multiple drawing styles
- **Calligraphy Tool** - Artistic text and strokes
- **Eraser** - Non-destructive erasing
- **Line & Shapes** - Basic geometric drawing
- **Text Tool** - Add text to your canvas
- **Pressure Sensitivity** - Full stylus and Apple Pencil support with real pressure detection
- **Palm Rejection** - Resting your hand won't leave unwanted marks

### Canvas Surfaces

Multiple paper textures to choose from:

- Aged paper
- Kraft paper
- Watercolour paper
- Newsprint
- Old parchment
- Blackboard

### Canvas Overlays

- Ruled lines
- Square grid
- Dot grid

### Collaboration Features

- **Real-time Sync** - See others drawing live on the same canvas
- **Layers** - Independent layers for sketch, ink, and details
- **Version History** - Save named checkpoints and revert instantly
- **Chat Panel** - Communicate while drawing without leaving the canvas
- **Room-based Sharing** - Copy a link and share your canvas with anyone

### Device Support

- iPad with Apple Pencil
- Android tablets with stylus
- Laptops and MacBooks
- Phones
- Full touch support with gesture controls

## Technology Stack

| Component          | Technology                                       |
| ------------------ | ------------------------------------------------ |
| **Frontend**       | Next.js with React                               |
| **Real-time Sync** | Socket.io                                        |
| **Database**       | SQLite (file-based, no external DB required)     |
| **Backend**        | Node.js                                          |
| **Deployment**     | Docker, Docker Compose, Kubernetes               |
| **TLS/HTTPS**      | Caddy (self-hosted) or cert-manager (Kubernetes) |

## Getting Started

### Local Development

Clone and run locally:

```bash
git clone https://github.com/Markkimotho/SketchTogether.git
cd SketchTogether
npm install
npm run dev
```

Open `http://localhost:3000` in your browser and start drawing.

### Docker Deployment

For a cleaner setup with everything bundled:

```bash
# Build the image
docker build -t sketchtogether:latest .

# Run with Docker Compose
docker compose up
```

Access at `http://localhost:3000`. Canvas data persists in a Docker volume across restarts.

## Sharing & Hosting

### Instant Public Link (ngrok)

For quick temporary sharing:

```bash
ngrok http 3000
```

Get an instant public HTTPS link (e.g., `https://abc123.ngrok-free.app`) to share with collaborators. No domain, no server setup needed.

### Self-Hosted VPS

For permanent public access:

1. Spin up a VPS (Hetzner, DigitalOcean, Linode, etc.)
2. Install Docker
3. Clone the repo and run `docker compose up -d`
4. Point your domain at the server IP
5. Set up Caddy for automatic HTTPS:

```caddy
sketchtogether.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Access your drawing app at `https://sketchtogether.yourdomain.com`

### Kubernetes Production Deployment

The repo includes complete Kubernetes manifests covering:

- Deployment with replicas
- Persistent volume for SQLite database
- ClusterIP service for internal routing
- Nginx ingress with WebSocket headers
- cert-manager for automatic Let's Encrypt TLS

```bash
# Update domain in k8s/ingress.yaml, then apply:
kubectl apply -f k8s/
```

## How to Use

### Getting Started

1. Open the app and click "New Canvas"
2. Your browser URL is your room link — copy and share it
3. Anyone opening the link joins your canvas in real-time

### Drawing

- **Select a tool** from the toolbar (top on desktop, left side on mobile)
- **Pick colors** from the color swatch or use the color picker
- **Adjust stroke size** to your preference
- **Use stylus/Apple Pencil** with pressure sensitivity on tablets (no setup needed)

### Workspace Panels (Right Side)

| Panel       | Features                                         |
| ----------- | ------------------------------------------------ |
| **Layers**  | Add, rename, lock, hide layers independently     |
| **History** | Save named versions and revert to any checkpoint |
| **Canvas**  | Change surface texture and grid overlays         |
| **Chat**    | Message collaborators without leaving the canvas |

### Navigation

- **Pan**: Hand tool or two-finger gesture on touch
- **Zoom**: Scroll on desktop or pinch on touch
- **Reset View**: Crosshair button (bottom right) to fit canvas on screen

## Architecture Highlights

- **No external database required** — SQLite keeps everything local
- **No cloud dependencies** — Run it completely offline if needed
- **Real-time synchronization** — Socket.io ensures instant collaboration
- **Self-contained** — Docker image bundles everything needed
- **Scalable** — Kubernetes manifests for production deployments
- **Open Source** — Full source code, MIT License

## Contributing

The project is completely free and open-source. Contributions welcome! Open pull requests for bug fixes, features, or improvements.

## Getting Help

For setup issues, feature requests, or to share feedback, reach out through GitHub or open an issue in the repository.

## Repository

[View on GitHub](https://github.com/Markkimotho/SketchTogether)

---

**Enjoy drawing together!** 🎨
