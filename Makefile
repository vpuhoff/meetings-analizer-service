# Meetings Analyzer Service - Makefile
# Frontend: Firebase Hosting | Backend: Cloudflare Worker

.PHONY: help install dev build clean deploy-worker deploy-frontend deploy-firestore deploy-all logs

# Default target
help:
	@echo "Meetings Analyzer Service - Available commands:"
	@echo ""
	@echo "  make install          - Install npm dependencies"
	@echo "  make dev              - Start local dev server (port 8080)"
	@echo "  make build            - Build production frontend"
	@echo "  make clean            - Clean build artifacts"
	@echo ""
	@echo "  make deploy-worker    - Deploy Cloudflare Worker"
	@echo "  make deploy-frontend  - Deploy frontend to Firebase Hosting"
	@echo "  make deploy-firestore - Deploy Firestore security rules"
	@echo "  make deploy-all       - Deploy Worker + Frontend + Firestore"
	@echo ""
	@echo "  make logs             - View Worker logs"
	@echo "  make secrets          - List Worker secrets"
	@echo "  make set-secret       - Set GEMINI_API_KEY secret (prompts for value)"
	@echo ""

# Development
install:
	npm install

dev:
	npm run dev

# Build
build:
	npm run build

clean:
	rm -rf dist/

# Deployments
PROJECT_ID = gen-lang-client-0937773369

deploy-worker:
	npx wrangler deploy src/worker.ts

deploy-frontend: build
	npx firebase deploy --only hosting --project $(PROJECT_ID)

deploy-firestore:
	npx firebase deploy --only firestore:rules --project $(PROJECT_ID)

deploy-all: deploy-worker deploy-frontend deploy-firestore
	@echo "All components deployed successfully!"

# Cloudflare Worker management
logs:
	npx wrangler tail

secrets:
	npx wrangler secret list

set-secret:
	@echo "Setting GEMINI_API_KEY secret..."
	@read -p "Enter GEMINI_API_KEY: " key; \
	npx wrangler secret put GEMINI_API_KEY <<< "$$key"

# Git helpers
git-push:
	git add -A
	@read -p "Enter commit message: " msg; \
	git commit -m "$$msg" && git push origin main

# Full reset (use with caution)
reset: clean
	rm -rf node_modules/
	npm install
