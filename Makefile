.PHONY: dev dev-web dev-api dev-proxy dev-host lint lint-web lint-api lint-proxy format format-web format-api format-proxy test test-web test-api test-proxy build build-web build-api build-proxy start start-web start-api start-proxy start-host

dev:
	@echo "Starting proxy + api + web (development)..."
	@set -a; [ -f .env.development ] && . .env.development; set +a; \
	trap 'kill 0' EXIT; \
	$(MAKE) dev-proxy & \
	$(MAKE) dev-api & \
	$(MAKE) dev-web & \
	wait

dev-web:
	set -a; [ -f .env.development ] && . .env.development; set +a; \
	cd apps/web && pnpm dev

dev-api:
	set -a; [ -f .env.development ] && . .env.development; set +a; \
	cd apps/api && go run ./cmd/server

dev-proxy:
	set -a; [ -f .env.development ] && . .env.development; set +a; \
	cd apps/proxy && go run . -log-level debug

LOCAL_IP := $(shell ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

dev-host:
	@echo "Starting on https://$(LOCAL_IP):5173 ..."
	@set -a; [ -f .env.development ] && . .env.development; \
	VITE_API_URL="https://$(LOCAL_IP):8080/api"; \
	VITE_PROXY_URL="https://$(LOCAL_IP):9999"; \
	ALLOW_ORIGIN="https://$(LOCAL_IP):5173"; \
	HTTPS_CERT="$(CURDIR)/.certs/dev.pem"; \
	HTTPS_KEY="$(CURDIR)/.certs/dev-key.pem"; \
	TLS_CERT_FILE="$(CURDIR)/.certs/dev.pem"; \
	TLS_KEY_FILE="$(CURDIR)/.certs/dev-key.pem"; \
	set +a; \
	trap 'kill 0' EXIT; \
	cd apps/web && pnpm dev --host & \
	cd apps/api && go run ./cmd/server & \
	cd apps/proxy && go run . -log-level debug & \
	wait

lint: lint-web lint-api lint-proxy

lint-web:
	cd apps/web && pnpm lint

lint-api:
	cd apps/api && golangci-lint run ./...

lint-proxy:
	cd apps/proxy && go vet ./...

format: format-web format-api format-proxy

format-web:
	cd apps/web && pnpm format

format-api:
	cd apps/api && gofmt -s -w .

format-proxy:
	cd apps/proxy && gofmt -s -w .

test: test-web test-api test-proxy

test-web:
	cd apps/web && pnpm test

test-api:
	cd apps/api && go test ./...

test-proxy:
	cd apps/proxy && go test ./...

build: build-web build-api build-proxy

build-web:
	cd apps/web && pnpm build

build-api:
	cd apps/api && CGO_ENABLED=0 go build -o bin/server ./cmd/server

build-proxy:
	cd apps/proxy && go build -o bin/proxy .

start:
	@echo "Starting proxy + api + web (production)..."
	@set -a; [ -f .env.production ] && . .env.production; \
	$(MAKE) build && \
	set +a; \
	trap 'kill 0' EXIT; \
	$(MAKE) start-proxy & \
	$(MAKE) start-api & \
	$(MAKE) start-web & \
	wait

start-web:
	set -a; [ -f .env.production ] && . .env.production; set +a; \
	cd apps/web && pnpm preview

start-api:
	set -a; [ -f .env.production ] && . .env.production; set +a; \
	cd apps/api && ./bin/server

start-proxy:
	set -a; [ -f .env.production ] && . .env.production; set +a; \
	cd apps/proxy && ./bin/proxy -log-level info

start-host:
	@echo "Building and starting on https://$(LOCAL_IP):4173 ..."
	@set -a; [ -f .env.production ] && . .env.production; \
	VITE_API_URL="https://$(LOCAL_IP):8080/api"; \
	VITE_PROXY_URL="https://$(LOCAL_IP):9999"; \
	ALLOW_ORIGIN="https://$(LOCAL_IP):4173"; \
	HTTPS_CERT="$(CURDIR)/.certs/dev.pem"; \
	HTTPS_KEY="$(CURDIR)/.certs/dev-key.pem"; \
	TLS_CERT_FILE="$(CURDIR)/.certs/dev.pem"; \
	TLS_KEY_FILE="$(CURDIR)/.certs/dev-key.pem"; \
	$(MAKE) build && \
	set +a; \
	trap 'kill 0' EXIT; \
	cd apps/web && pnpm preview --host & \
	cd apps/api && ./bin/server & \
	cd apps/proxy && ./bin/proxy -log-level info & \
	wait
