FROM oven/bun:1.1 AS base
WORKDIR /app

# Install the Docker CLI so the Athena sandbox (run_code tool) can spawn
# isolated containers via the mounted Docker socket. Only the CLI is needed —
# the daemon runs on the host. gVisor (runsc) runtime provides kernel isolation.
RUN apt-get update -qq && apt-get install -y -qq docker.io && rm -rf /var/lib/apt/lists/*

# Install deps
COPY package.json bunfig.toml ./
COPY prisma ./prisma
RUN bun install
RUN bunx prisma generate

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Ensure data + uploads dirs exist
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

# Run migrations on container start, then start server
CMD ["sh", "-c", "bunx prisma migrate deploy && bun src/index.ts"]
