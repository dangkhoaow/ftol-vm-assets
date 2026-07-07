#!/usr/bin/env bash
# Build one Linux Online VM image (terminal|desktop) into vm-images/out/<kind>/.
# Runs on the ubuntu CI runner as root: docker build --platform linux/386,
# export the rootfs, extract kernel + initramfs, mke2fs -d into a raw ext4
# image sized contents + slack + free space for the reader's own files.
set -euo pipefail
KIND="${1:?usage: build-image.sh terminal|desktop}"
HERE="$(cd "$(dirname "$0")/.." && pwd)" # vm-images/
OUT="$HERE/out/$KIND"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

docker build --platform linux/386 -t "ftolvm-$KIND" -f "$HERE/$KIND/Dockerfile" "$HERE"
CID="$(docker create --platform linux/386 "ftolvm-$KIND" /bin/true)"
mkdir -p "$WORK/rootfs"
docker export "$CID" | tar -C "$WORK/rootfs" --numeric-owner -xf -
docker rm "$CID" >/dev/null
rm -f "$WORK/rootfs/.dockerenv"

# v86 boots the kernel directly (bzimage + initrd config keys) - no bootloader.
cp "$WORK/rootfs/boot/vmlinuz-virt" "$OUT/vmlinuz"
cp "$WORK/rootfs/boot/initramfs-virt" "$OUT/initramfs"

USED_MB="$(du -sm "$WORK/rootfs" | cut -f1)"
echo "[build-image] $KIND largest dirs (MB):"
du -xm -d 2 "$WORK/rootfs" 2>/dev/null | sort -rn | head -25 || true
case "$KIND" in
terminal) FREE_MB=192 ;;
*) FREE_MB=256 ;;
esac
SIZE_MB=$((USED_MB + USED_MB / 5 + FREE_MB))
rm -f "$OUT/image.img"
mke2fs -q -t ext4 -O ^has_journal -m 0 -b 4096 -L linuxonline -d "$WORK/rootfs" "$OUT/image.img" "${SIZE_MB}M"
echo "[build-image] $KIND: rootfs=${USED_MB}M image=${SIZE_MB}M"
ls -la "$OUT"
