#!/usr/bin/env bash
set -euo pipefail

ARCH="${1:-}"
SKIP_RENDERER="${2:-}"

if [[ -z "${ARCH}" ]]; then
  echo "Usage: scripts/build-mac.sh <arm64|x64> [--skip-renderer]"
  exit 1
fi

if [[ "${ARCH}" != "arm64" && "${ARCH}" != "x64" ]]; then
  echo "Unsupported arch: ${ARCH}. Use arm64 or x64."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY_DIR="${ROOT_DIR}/electron/python"
VENV_ARCH_DIR="${PY_DIR}/.venv-${ARCH}"
VENV_ACTIVE_DIR="${PY_DIR}/.venv"
REQ_FILE="${PY_DIR}/requirements.txt"

if [[ ! -f "${REQ_FILE}" ]]; then
  echo "Missing requirements file: ${REQ_FILE}"
  exit 1
fi

ensure_venv() {
  if [[ -d "${VENV_ARCH_DIR}" ]]; then
    echo "[build-mac] Reusing existing venv: ${VENV_ARCH_DIR}"
    return
  fi

  echo "[build-mac] Creating Python venv for ${ARCH} at ${VENV_ARCH_DIR}"
  if [[ "${ARCH}" == "arm64" ]]; then
    python3 -m venv "${VENV_ARCH_DIR}"
  else
    if ! arch -x86_64 python3 -V >/dev/null 2>&1; then
      echo "[build-mac] Unable to run x86_64 Python. Install Rosetta and x86_64 Python first."
      echo "Example: softwareupdate --install-rosetta --agree-to-license"
      exit 1
    fi
    arch -x86_64 python3 -m venv "${VENV_ARCH_DIR}"
  fi

  echo "[build-mac] Installing Python deps for ${ARCH}"
  "${VENV_ARCH_DIR}/bin/python" -m pip install --upgrade pip
  "${VENV_ARCH_DIR}/bin/pip" install -r "${REQ_FILE}"
}

prepare_active_venv() {
  echo "[build-mac] Activating venv for packaging: ${VENV_ARCH_DIR} -> ${VENV_ACTIVE_DIR}"
  rm -rf "${VENV_ACTIVE_DIR}"
  cp -R "${VENV_ARCH_DIR}" "${VENV_ACTIVE_DIR}"
}

verify_venv() {
  echo "[build-mac] Verifying Python deps (${ARCH})"
  "${VENV_ACTIVE_DIR}/bin/python" -c "import pdfplumber, pandas, openpyxl; print('python deps ok')"
}

build_renderer_if_needed() {
  if [[ "${SKIP_RENDERER}" == "--skip-renderer" ]]; then
    return
  fi
  echo "[build-mac] Building renderer/main bundles"
  (cd "${ROOT_DIR}" && npx tsc && npx vite build)
}

build_installer() {
  echo "[build-mac] Building macOS ${ARCH} installer"
  if [[ "${ARCH}" == "arm64" ]]; then
    (cd "${ROOT_DIR}" && npx electron-builder --mac dmg --arm64)
  else
    (cd "${ROOT_DIR}" && npx electron-builder --mac dmg --x64)
  fi
}

ensure_venv
prepare_active_venv
verify_venv
build_renderer_if_needed
build_installer

echo "[build-mac] Done for ${ARCH}"
