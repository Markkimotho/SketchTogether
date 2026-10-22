# ── Stage 1: install all dependencies ────────────────────────────────────────
# better-sqlite3 requires native compilation.
# We install build tools here and carry only the compiled output forward.
FROM node:22-alpine AS deps

RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++

WORKDIR /app
COPY package*.json ./
# Install everything — tsx is a devDep but needed at runtime via server.ts
RUN npm ci

# ── Stage 2: build Next.js and generate Prisma client ────────────────────────
FROM deps AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Runtime shared libraries needed by better-sqlite3
RUN apk add --no-cache \
    libc6-compat

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Next.js build output
COPY --from=builder /app/.next          ./.next
COPY --from=builder /app/public         ./public

# All node_modules (includes tsx, prisma adapter, native binaries)
COPY --from=builder /app/node_modules   ./node_modules

# Prisma generated client
COPY --from=builder /app/generated      ./generated

# Prisma schema + migrations (used by bootstrap logic in server.ts)
COPY --from=builder /app/prisma/schema.prisma    ./prisma/schema.prisma
COPY --from=builder /app/prisma/migrations       ./prisma/migrations

# Server and config source (tsx compiles these at startup)
COPY --from=builder /app/server.ts       ./server.ts
COPY --from=builder /app/lib             ./lib
COPY --from=builder /app/next.config.ts  ./next.config.ts
COPY --from=builder /app/tsconfig.json   ./tsconfig.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json    ./package.json

# Ensure the prisma data directory exists for the SQLite file
RUN mkdir -p /app/prisma

EXPOSE 3000

# Use the locally installed tsx binary directly (avoids npx lookup overhead)
CMD ["node_modules/.bin/tsx", "server.ts"]
