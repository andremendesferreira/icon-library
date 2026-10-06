# =============================================================================
# ICON-LIBRARY
# Static page served by a dependency-free Node.js server
# =============================================================================

FROM node:24-slim

# Apply Debian security updates
RUN apt-get update \
 && apt-get upgrade -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy application source code
COPY --chown=node:node package.json ./
COPY --chown=node:node scripts/server.js ./scripts/server.js
COPY --chown=node:node public/ ./public/

# Switch to non-root user
USER node

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

# Healthy while the page answers (the slim image has no curl/wget)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "scripts/server.js"]
