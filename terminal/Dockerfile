# Linux Online - terminal image (real 32-bit Alpine Linux for the v86 emulator).
# Build context is vm-images/ (see scripts/build-image.sh).
FROM --platform=linux/386 public.ecr.aws/docker/library/alpine:3.24

# The initramfs must carry the IDE/ATA + ext4 drivers that v86's emulated
# PIIX disk needs - write the config BEFORE linux-virt so its post-install
# mkinitfs hook picks it up.
RUN apk add --no-cache mkinitfs \
 && echo 'features="base ata scsi ext4 virtio"' > /etc/mkinitfs/mkinitfs.conf \
 && apk add --no-cache linux-virt \
 && apk add --no-cache openrc busybox-mdev-openrc agetty vim nano htop \
 && test -x /sbin/agetty \
 && test -f /boot/vmlinuz-virt \
 && test -f /boot/initramfs-virt

# OpenRC service set for a diskful, network-less boot.
RUN rc-update add devfs sysinit \
 && rc-update add dmesg sysinit \
 && rc-update add mdev sysinit \
 && rc-update add hostname boot \
 && rc-update add localmount boot \
 && rc-update add swclock boot \
 && rc-update add sysctl boot \
 && rc-update add bootmisc boot \
 && rc-update add killprocs shutdown \
 && rc-update add mount-ro shutdown \
 && rc-update add savecache shutdown \
 && rc-update add local default

COPY common/inittab /etc/inittab
COPY common/motd /etc/motd
RUN echo linux-online > /etc/hostname \
 && passwd -d root \
 && printf '/dev/sda\t/\text4\trw,noatime 0 1\n' > /etc/fstab
