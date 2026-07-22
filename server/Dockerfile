FROM oven/bun:1.1 AS base
WORKDIR /app

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
