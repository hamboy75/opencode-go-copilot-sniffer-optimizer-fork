#!/bin/bash
# publish.sh — Sube cambios al repositorio GitHub
# Uso: bash publish.sh "descripcion del cambio"
#      desde la raíz del proyecto

set -e

MESSAGE="${1:-chore: actualizar proyecto}"

# Ir a la raíz del proyecto, donde está este script y el .git
cd "$(dirname "$0")" || exit 1
echo "Directorio: $PWD"

git add -A
git commit -m "$MESSAGE"
git push origin main

echo "Listo. Repositorio: https://github.com/hamboy75/opencode-go-copilot-sniffer-optimizer-fork"
