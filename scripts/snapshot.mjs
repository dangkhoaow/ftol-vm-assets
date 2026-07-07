// Boot a built image headless under Node v86, wait for its ready marker on
// the serial console, sync, save the machine state (the instant-boot snapshot
// the tool page restores), then boot a second emulator FROM that state and
// prove the shell still answers. Exits non-zero on any failure.
//
// usage: node snapshot.mjs <terminal|desktop> <dir with image.img/vmlinuz/initramfs>
import { V86 } from "v86";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import zlib from "node:zlib";

const KIND = process.argv[2];
const DIR = path.resolve(process.argv[3] || ".");
const here = path.dirname(url.fileURLToPath(import.meta.url));
// Locate v86's build dir from the RESOLVED module (npm may hoist the package
// to a parent node_modules; a hardcoded ./node_modules path breaks then).
const v86BuildDir = path.dirname(url.fileURLToPath(import.meta.resolve("v86")));

const PROFILES = {
  // marker: what the serial console prints when the machine is ready.
  terminal: { memory_mb: 128, marker: /:~# $/, settle_ms: 5000, timeout_min: 40 },
  desktop: { memory_mb: 512, marker: /FTOL_READY_DESKTOP/, settle_ms: 30000, timeout_min: 60 },
};
const prof = PROFILES[KIND];
if (!prof) {
  console.error(`unknown kind: ${KIND}`);
  process.exit(2);
}

export const CMDLINE = "root=/dev/sda rootfstype=ext4 rw modules=ext4 console=ttyS0,115200 console=tty0";

function makeEmulator(extra = {}) {
  return new V86({
    wasm_path: path.join(v86BuildDir, "v86.wasm"),
    bios: { url: path.join(here, "seabios.bin") },
    vga_bios: { url: path.join(here, "vgabios.bin") },
    memory_size: prof.memory_mb * 1024 * 1024,
    vga_memory_size: 16 * 1024 * 1024,
    bzimage: { url: path.join(DIR, "vmlinuz") },
    initrd: { url: path.join(DIR, "initramfs") },
    cmdline: CMDLINE,
    hda: { url: path.join(DIR, "image.img"), async: false },
    autostart: true,
    disable_speaker: true,
    ...extra,
  });
}

function attachSerial(em, sink) {
  em.add_listener("serial0-output-byte", (b) => sink.push(String.fromCharCode(b)));
}

const send = (em, text) => {
  for (const c of text) em.serial0_send(c);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Serial output carries ANSI/VT escapes (e.g. the \x1b[6n cursor-position
// query right after the login prompt) - strip them before marker matching.
const stripEscapes = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");

async function waitFor(sinkArr, test, timeoutMs, label) {
  const t0 = Date.now();
  let lastLog = 0;
  for (;;) {
    const s = stripEscapes(sinkArr.join(""));
    if (test(s)) return s;
    if (Date.now() - t0 > timeoutMs) {
      console.error(`[snapshot] TIMEOUT waiting for ${label}. serial tail:`);
      console.error(JSON.stringify(s.slice(-2000)));
      process.exit(1);
    }
    if (Date.now() - lastLog > 30000) {
      lastLog = Date.now();
      console.log(`[snapshot] waiting for ${label} (${((Date.now() - t0) / 1000) | 0}s) tail: ${JSON.stringify(s.slice(-1400))}`);
    }
    await sleep(500);
  }
}

console.log(`[snapshot] booting ${KIND} (${prof.memory_mb}MB RAM)`);
const sink = [];
const em = makeEmulator();
attachSerial(em, sink);

await waitFor(sink, (s) => prof.marker.test(s), prof.timeout_min * 60000, `ready marker ${prof.marker}`);
console.log(`[snapshot] ready marker seen; settling ${prof.settle_ms}ms`);
await sleep(prof.settle_ms);

// Flush filesystem caches so the snapshot is consistent with the disk.
sink.length = 0;
send(em, "sync && echo FTOL_SYNCED\n");
await waitFor(sink, (s) => s.includes("FTOL_SYNCED"), 120000, "sync ack");
await sleep(2000);

const state = await em.save_state();
console.log(`[snapshot] state: ${(state.byteLength / 1048576).toFixed(1)} MB raw`);
fs.writeFileSync(path.join(DIR, "state.size"), String(state.byteLength));
const gz = zlib.gzipSync(Buffer.from(state), { level: 6 });
fs.writeFileSync(path.join(DIR, "state.bin.gz"), gz);
console.log(`[snapshot] state: ${(gz.byteLength / 1048576).toFixed(1)} MB gzipped`);
em.destroy();

// Verify: restore into a fresh emulator, shell must answer on serial.
console.log(`[snapshot] verifying restore`);
fs.writeFileSync(path.join(DIR, "state.bin"), Buffer.from(state));
const sink2 = [];
const em2 = makeEmulator({ initial_state: { url: path.join(DIR, "state.bin") } });
attachSerial(em2, sink2);
await sleep(5000);
send(em2, "echo FTOL_BACK_$((40+2))\n");
await waitFor(sink2, (s) => s.includes("FTOL_BACK_42"), 120000, "restored shell answer");
console.log(`[snapshot] ${KIND} OK - restored VM answers`);
em2.destroy();
fs.rmSync(path.join(DIR, "state.bin"));
process.exit(0);
