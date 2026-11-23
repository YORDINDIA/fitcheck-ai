#!/bin/bash

# FitCheck AI - Development Server Runner
# Runs both backend (FastAPI) and frontend (Vite) servers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# PIDs for cleanup
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"

    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo -e "${BLUE}Stopping backend server (PID: $BACKEND_PID)...${NC}"
        kill "$BACKEND_PID" 2>/dev/null || true
    fi

    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo -e "${BLUE}Stopping frontend server (PID: $FRONTEND_PID)...${NC}"
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi

    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    echo -e "${GREEN}All servers stopped.${NC}"
}

trap cleanup EXIT
trap 'exit 130' SIGINT
trap 'exit 143' SIGTERM

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   FitCheck AI - Development Server    ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Start Backend Server
echo -e "${BLUE}Starting Backend Server (FastAPI)...${NC}"
echo -e "${YELLOW}Backend URL: http://localhost:8000${NC}"
echo -e "${YELLOW}API Docs: http://localhost:8000/api/v1/docs${NC}"
echo ""

cd "$BACKEND_DIR"
if [ ! -x "$BACKEND_DIR/.venv/bin/python" ]; then
    echo -e "${RED}Error: backend virtualenv not found at $BACKEND_DIR/.venv${NC}"
    echo -e "${YELLOW}Create it with:${NC}"
    echo -e "  cd \"$BACKEND_DIR\""
    echo -e "  python3.12 -m venv .venv"
    echo -e "  source .venv/bin/activate"
    echo -e "  pip install -r requirements.txt"
    exit 1
fi
for command in node curl; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo -e "${RED}Error: $command is required; install it before running this script.${NC}"
        exit 1
    fi
done
if [ ! -f "$FRONTEND_DIR/node_modules/vite/bin/vite.js" ]; then
    echo -e "${RED}Error: frontend dependencies are missing.${NC}"
    echo "Install them with: cd \"$FRONTEND_DIR\" && npm ci"
    exit 1
fi
if ! "$BACKEND_DIR/.venv/bin/python" -c 'import uvicorn' >/dev/null 2>&1; then
    echo -e "${RED}Error: backend dependencies are missing.${NC}"
    echo "Install them with: cd \"$BACKEND_DIR\" && .venv/bin/python -m pip install -r requirements.txt"
    exit 1
fi
"$BACKEND_DIR/.venv/bin/python" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Wait for the backend to become healthy (bounded retry loop instead of a
# fixed sleep: slower cold starts are tolerated, a dead process fails fast).
echo -e "${YELLOW}Waiting for backend health (http://localhost:8000/health)...${NC}"
BACKEND_READY=""
for ((attempt = 0; attempt < 30; attempt++)); do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo -e "${RED}Backend process exited before becoming healthy${NC}"
        exit 1
    fi
    if curl --connect-timeout 1 --max-time 1 -fsS http://localhost:8000/health >/dev/null 2>&1; then
        BACKEND_READY="yes"
        break
    fi
    sleep 1
done
if [ -n "$BACKEND_READY" ]; then
    echo -e "${GREEN}Backend is healthy.${NC}"
else
    echo -e "${RED}Backend did not become healthy after 30 attempts; check logs in $BACKEND_DIR/logs/.${NC}"
    exit 1
fi

# Start Frontend Server
echo -e "${BLUE}Starting Frontend Server (Vite)...${NC}"
echo -e "${YELLOW}Frontend URL: http://localhost:3000${NC}"
echo ""

cd "$FRONTEND_DIR"
# Launch Vite directly so cleanup owns the server, not an npm wrapper.
node "$FRONTEND_DIR/node_modules/vite/bin/vite.js" --strictPort &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Both server processes started!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  Backend:  ${YELLOW}http://localhost:8000${NC}"
echo -e "  Frontend: ${YELLOW}http://localhost:3000${NC}"
echo -e "  API Docs: ${YELLOW}http://localhost:8000/api/v1/docs${NC}"
echo ""
echo -e "${BLUE}Press Ctrl+C to stop both servers${NC}"
echo ""

# Bash 3.2 (macOS) has no wait -n; monitor both children explicitly.
while true; do
    for pid in "$BACKEND_PID" "$FRONTEND_PID"; do
        if ! kill -0 "$pid" 2>/dev/null; then
            status=0
            wait "$pid" || status=$?
            echo -e "${RED}Server process $pid exited (status $status); stopping both servers.${NC}"
            if [ "$status" -eq 0 ]; then
                status=1
            fi
            exit "$status"
        fi
    done
    sleep 1
done
