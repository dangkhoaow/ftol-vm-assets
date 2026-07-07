// Write manifest.json for the release dir produced by package-release.sh.
// The tool page fetches this first: URLs, sizes (for progress + storage
// checks), sha256s, and per-image boot parameters.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import url from "node:url";

const REL = path.resolve(process.argv[2] || ".");
const here = path.dirname(url.fileURLToPath(import.meta.url));
const VERSION = fs.readFileSync(path.join(here, "..", "VERSION"), "utf8").trim();

const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const asset = (file, rawSizeFile) => ({
  file,
  bytes: fs.statSync(path.join(REL, file)).size,
  ...(rawSizeFile ? { bytes_raw: Number(fs.readFileSync(path.join(REL, rawSizeFile), "utf8").trim()) } : {}),
  sha256: sha256(path.join(REL, file)),
});

const CMDLINE = "root=/dev/sda rootfstype=ext4 rw modules=ext4 console=ttyS0,115200 console=tty0";

const manifest = {
  schema: "ftol-vm-images/1",
  version: VERSION,
  built_iso: new Date().toISOString(),
  alpine: "3.24",
  kernel: "linux-virt",
  v86_npm: "0.5.424",
  cmdline: CMDLINE,
  images: {
    terminal: {
      label: "Terminal",
      memory_mb: 128,
      vga_mb: 16,
      assets: {
        img: asset("terminal.img.gz", "terminal.img.size"),
        state: asset("terminal.state.bin.gz", "terminal.state.size"),
        vmlinuz: asset("terminal.vmlinuz"),
        initramfs: asset("terminal.initramfs"),
      },
    },
    desktop: {
      label: "Desktop",
      memory_mb: 512,
      vga_mb: 16,
      assets: {
        img: asset("desktop.img.gz", "desktop.img.size"),
        state: asset("desktop.state.bin.gz", "desktop.state.size"),
        vmlinuz: asset("desktop.vmlinuz"),
        initramfs: asset("desktop.initramfs"),
      },
    },
  },
};

fs.writeFileSync(path.join(REL, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`[make-manifest] wrote manifest.json (version ${VERSION})`);
