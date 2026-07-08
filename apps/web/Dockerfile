FROM node:23-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL
ARG VITE_PROXY_URL
ARG VITE_GIT_COMMIT
ENV VITE_API_URL=$VITE_API_URL VITE_PROXY_URL=$VITE_PROXY_URL VITE_GIT_COMMIT=$VITE_GIT_COMMIT
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
