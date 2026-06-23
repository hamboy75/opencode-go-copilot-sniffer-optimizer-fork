#!/usr/bin/env bash
set -euo pipefail

# ─── build.sh ───────────────────────────────────────────────────────────
# Script de gestión de compilación y empaquetado para
# OpenCode GO Copilot Sniffer & Optimizer (VS Code extension)
#
# Uso:
#   ./build.sh              → instalar deps + compilar
#   ./build.sh compile      → solo compilar (tsc)
#   ./build.sh check        → solo type-check (tsc --noEmit)
#   ./build.sh watch        → compilación continua
#   ./build.sh package      → compilar + empaquetar .vsix
#   ./build.sh clean        → limpiar out/ y extension.vsix
#   ./build.sh all          → clean + install + compile + package
# ─────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── Funciones ──────────────────────────────────────────────────────────

do_install() {
    info "Instalando dependencias..."
    npm install
    ok "Dependencias instaladas"
}

do_compile() {
    info "Compilando TypeScript..."
    npx tsc -p ./
    ok "Compilación completada → out/"
}

do_check() {
    info "Verificando tipos (--noEmit)..."
    npx tsc --noEmit
    ok "Type-check OK"
}

do_watch() {
    info "Compilación en modo watch..."
    npx tsc -watch -p ./
}

do_package() {
    info "Empaquetando extensión (.vsix)..."
    npx @vscode/vsce package -o extension.vsix
    ok "Paquete generado → extension.vsix"
}

do_clean() {
    info "Limpiando artefactos..."
    rm -rf out/
    rm -f extension.vsix
    ok "Limpieza completada"
}

# ─── Main ───────────────────────────────────────────────────────────────

ACTION="${1:-default}"

case "$ACTION" in
    default)
        do_install
        do_compile
        ;;
    compile)
        do_compile
        ;;
    check)
        do_check
        ;;
    watch)
        do_watch
        ;;
    package)
        do_compile
        do_package
        ;;
    clean)
        do_clean
        ;;
    all)
        do_clean
        do_install
        do_compile
        do_package
        ;;
    *)
        echo "Uso: $0 {default|compile|check|watch|package|clean|all}"
        echo ""
        echo "  default   → install + compile"
        echo "  compile   → solo compilar (tsc)"
        echo "  check     → solo type-check (tsc --noEmit)"
        echo "  watch     → compilación continua"
        echo "  package   → compile + empaquetar .vsix"
        echo "  clean     → limpiar out/ y extension.vsix"
        echo "  all       → clean + install + compile + package"
        exit 1
        ;;
esac
