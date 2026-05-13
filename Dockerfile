ARG NODE_VERSION=20-bookworm-slim

FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV CI=true
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY libs/common-utils/package.json ./libs/common-utils/package.json
COPY libs/compliance-engine/package.json ./libs/compliance-engine/package.json
COPY libs/crypto-vault/package.json ./libs/crypto-vault/package.json
COPY libs/distributed-transactions/package.json ./libs/distributed-transactions/package.json
COPY libs/fraud-detection/package.json ./libs/fraud-detection/package.json
COPY libs/ledger-core/package.json ./libs/ledger-core/package.json
COPY services/analytics-service/package.json ./services/analytics-service/package.json
COPY services/audit-service/package.json ./services/audit-service/package.json
COPY services/auth-service/package.json ./services/auth-service/package.json
COPY services/compliance-service/package.json ./services/compliance-service/package.json
COPY services/fraud-service/package.json ./services/fraud-service/package.json
COPY services/invoice-service/package.json ./services/invoice-service/package.json
COPY services/ledger-service/package.json ./services/ledger-service/package.json
COPY services/payment-service/package.json ./services/payment-service/package.json
COPY services/wallet-service/package.json ./services/wallet-service/package.json
RUN npm ci

FROM deps AS builder
ARG SERVICE_NAME
COPY tsconfig.json ./
COPY libs ./libs
COPY services ./services
RUN test -n "$SERVICE_NAME"
RUN npm run build --workspace @shop/common-utils
RUN npm run build --workspace @shop/${SERVICE_NAME}

FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY libs/common-utils/package.json ./libs/common-utils/package.json
COPY libs/compliance-engine/package.json ./libs/compliance-engine/package.json
COPY libs/crypto-vault/package.json ./libs/crypto-vault/package.json
COPY libs/distributed-transactions/package.json ./libs/distributed-transactions/package.json
COPY libs/fraud-detection/package.json ./libs/fraud-detection/package.json
COPY libs/ledger-core/package.json ./libs/ledger-core/package.json
COPY services/analytics-service/package.json ./services/analytics-service/package.json
COPY services/audit-service/package.json ./services/audit-service/package.json
COPY services/auth-service/package.json ./services/auth-service/package.json
COPY services/compliance-service/package.json ./services/compliance-service/package.json
COPY services/fraud-service/package.json ./services/fraud-service/package.json
COPY services/invoice-service/package.json ./services/invoice-service/package.json
COPY services/ledger-service/package.json ./services/ledger-service/package.json
COPY services/payment-service/package.json ./services/payment-service/package.json
COPY services/wallet-service/package.json ./services/wallet-service/package.json
RUN npm ci --omit=dev

FROM node:${NODE_VERSION} AS runtime
ARG SERVICE_NAME
ENV NODE_ENV=production
ENV SERVICE_NAME=${SERVICE_NAME}
WORKDIR /app
RUN groupadd --system shop && useradd --system --gid shop shop
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/package-lock.json ./package-lock.json
COPY --from=prod-deps /app/libs ./libs
COPY --from=prod-deps /app/services ./services
COPY --from=builder /app/libs/common-utils/dist ./libs/common-utils/dist
COPY --from=builder /app/services/${SERVICE_NAME}/dist ./services/${SERVICE_NAME}/dist
USER shop
EXPOSE 3000
CMD ["sh", "-c", "node services/${SERVICE_NAME}/dist/src/index.js"]
