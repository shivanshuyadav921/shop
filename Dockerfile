ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY libs ./libs
COPY services ./services
RUN npm ci

FROM deps AS builder
ARG SERVICE_NAME
COPY tsconfig.json ./
RUN test -n "$SERVICE_NAME"
RUN npm run build --workspace @shop/common-utils
RUN npm run build --workspace @shop/${SERVICE_NAME}

FROM node:${NODE_VERSION} AS runtime
ARG SERVICE_NAME
ENV NODE_ENV=production
ENV SERVICE_NAME=${SERVICE_NAME}
WORKDIR /app
RUN addgroup -S shop && adduser -S shop -G shop
COPY package.json package-lock.json ./
COPY libs ./libs
COPY services ./services
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/libs/common-utils/dist ./libs/common-utils/dist
COPY --from=builder /app/services/${SERVICE_NAME}/dist ./services/${SERVICE_NAME}/dist
USER shop
EXPOSE 3000
CMD ["sh", "-c", "node services/${SERVICE_NAME}/dist/index.js"]
