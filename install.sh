#!/usr/bin/env bash
# Copyright (C) 2025 princepal9120
# SPDX-License-Identifier: MIT

set -euo pipefail

REPO="princepal9120/tkt-cli"
INSTALL_DIR="${HOME}/.local/bin"
BINARY_NAME="tkt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info()    { echo -e "${BLUE}🔍 $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error()   { echo -e "${RED}❌ $1${NC}"; }

detect_platform() {
    local os arch
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)

    case "$os" in
        linux)   OS="linux" ;;
        darwin)  OS="macos" ;;
        mingw*|msys*|cygwin*) OS="windows" ;;
        *) print_error "Unsupported OS: $os"; exit 1 ;;
    esac

    case "$arch" in
        x86_64|amd64)   ARCH="x64" ;;
        aarch64|arm64)  ARCH="arm64" ;;
        *) print_error "Unsupported arch: $arch"; exit 1 ;;
    esac

    # Map to Bun target names
    case "${OS}-${ARCH}" in
        macos-arm64)  ASSET="tkt-darwin-arm64" ;;
        macos-x64)    ASSET="tkt-darwin-x64" ;;
        linux-x64)    ASSET="tkt-linux-x64" ;;
        linux-arm64)  ASSET="tkt-linux-arm64" ;;
        *) print_error "No binary for ${OS}-${ARCH}"; exit 1 ;;
    esac

    print_info "Detected platform: ${OS}-${ARCH}"
}

get_latest_version() {
    print_info "Fetching latest version..."
    LATEST_VERSION=$(curl -sL "https://api.github.com/repos/${REPO}/releases/latest" | \
        grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')

    if [ -z "$LATEST_VERSION" ]; then
        print_error "Failed to fetch latest version from GitHub"
        exit 1
    fi
    print_info "Latest version: ${LATEST_VERSION}"
}

download_binary() {
    local download_url="https://github.com/${REPO}/releases/download/${LATEST_VERSION}/${ASSET}"
    local checksum_url="${download_url}.sha256"
    local tmp_dir tmp_binary tmp_checksum

    tmp_dir=$(mktemp -d)
    tmp_binary="${tmp_dir}/${BINARY_NAME}"
    tmp_checksum="${tmp_dir}/${ASSET}.sha256"

    print_info "Downloading ${ASSET}..."
    if ! curl -sL "$download_url" -o "$tmp_binary"; then
        print_error "Download failed"
        rm -rf "$tmp_dir"
        exit 1
    fi

    print_info "Verifying checksum..."
    if curl -sL "$checksum_url" -o "$tmp_checksum" 2>/dev/null; then
        cd "$tmp_dir"
        if command -v sha256sum &>/dev/null; then
            if sha256sum -c "$tmp_checksum" --status 2>/dev/null; then
                print_success "Checksum verified"
            else
                print_error "Checksum mismatch — aborting"
                rm -rf "$tmp_dir"; exit 1
            fi
        elif command -v shasum &>/dev/null; then
            local expected actual
            expected=$(awk '{print $1}' "$tmp_checksum" | tr '[:upper:]' '[:lower:]')
            actual=$(shasum -a 256 "$tmp_binary" | awk '{print $1}' | tr '[:upper:]' '[:lower:]')
            if [ "$expected" = "$actual" ]; then
                print_success "Checksum verified"
            else
                print_error "Checksum mismatch — aborting"
                rm -rf "$tmp_dir"; exit 1
            fi
        else
            print_warning "No checksum tool found, skipping verification"
        fi
        cd - >/dev/null
    else
        print_warning "Checksum file unavailable, skipping verification"
    fi

    mkdir -p "$INSTALL_DIR"
    mv "$tmp_binary" "${INSTALL_DIR}/${BINARY_NAME}"
    chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
    rm -rf "$tmp_dir"

    print_success "Installed → ${INSTALL_DIR}/${BINARY_NAME}"
}

check_path() {
    if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
        print_warning "${INSTALL_DIR} is not in your PATH"
        echo ""
        local shell_name
        shell_name=$(basename "$SHELL")
        case "$shell_name" in
            bash) echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc" ;;
            zsh)  echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc && source ~/.zshrc" ;;
            fish) echo "  fish_add_path ~/.local/bin" ;;
            *)    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
        esac
        echo ""
    fi
}

main() {
    echo ""
    echo -e "${BLUE}"
    echo "  ████████╗██╗  ██╗████████╗      ██████╗██╗     ██╗"
    echo "     ██╔══╝██║ ██╔╝╚══██╔══╝     ██╔════╝██║     ██║"
    echo "     ██║   █████╔╝    ██║        ██║     ██║     ██║"
    echo "     ██║   ██╔═██╗    ██║        ██║     ██║     ██║"
    echo "     ██║   ██║  ██╗   ██║        ╚██████╗███████╗██║"
    echo "     ╚═╝   ╚═╝  ╚═╝   ╚═╝         ╚═════╝╚══════╝╚═╝"
    echo -e "${NC}"
    echo -e "${GREEN}         TikTok in your terminal — tkt-cli installer${NC}"
    echo ""

    detect_platform
    get_latest_version
    download_binary
    check_path

    echo ""
    echo -e "${GREEN}  ✅ Done! Run ${BLUE}tkt --help${GREEN} to get started.${NC}"
    echo ""
}

main "$@"
