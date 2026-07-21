const TYPES = {
    MAZE: 'maze',
    GRID: 'grid',
    SPARSE: 'sparse',
    DENSE: 'dense',
    SYMMETRIC: 'symmetric'
};

function boardType(level) {
    const list = [TYPES.MAZE, TYPES.GRID, TYPES.SYMMETRIC, TYPES.SPARSE, TYPES.DENSE];
    return list[Math.floor((level - 1) / 5) % 5];
}

let size = 3;
let level = 1;
let cells = [];

const DIR = { N: 0, E: 1, S: 2, W: 3 };

const SHAPES = {
    deadend: { id: "deadend", mask: [1, 0, 0, 0] },
    line: { id: "line", mask: [1, 0, 1, 0] },
    corner: { id: "corner", mask: [1, 1, 0, 0] },
    tee: { id: "tee", mask: [1, 1, 1, 0] },
    cross: { id: "cross", mask: [1, 1, 1, 1] }
};

const MASK_TO_SHAPE = {
    "1000": SHAPES.deadend,
    "0100": SHAPES.deadend,
    "0010": SHAPES.deadend,
    "0001": SHAPES.deadend,
    "1010": SHAPES.line,
    "0101": SHAPES.line,
    "1100": SHAPES.corner,
    "0110": SHAPES.corner,
    "0011": SHAPES.corner,
    "1001": SHAPES.corner,
    "1110": SHAPES.tee,
    "0111": SHAPES.tee,
    "1011": SHAPES.tee,
    "1101": SHAPES.tee,
    "1111": SHAPES.cross
};

function rotate(mask, times) {
    const result = [...mask];
    for (let i = 0; i < times; i++) result.unshift(result.pop());
    return result;
}

function shapeOf(mask) {
    return MASK_TO_SHAPE[mask.map(Number).join("")] || SHAPES.line;
}

function updateSize() {
    if (level <= 2) size = 3;
    else if (level <= 5) size = 4;
    else if (level <= 10) size = 5;
    else if (level <= 20) size = 6;
    else size = 7;
}

function pickSource() {
    const s = size;
    const pos = [];
    for (let c = 0; c < s; c++) pos.push({ r: 0, c });
    for (let c = 0; c < s; c++) pos.push({ r: s - 1, c });
    for (let r = 1; r < s - 1; r++) {
        pos.push({ r, c: 0 });
        pos.push({ r, c: s - 1 });
    }
    return pos[Math.floor(Math.random() * pos.length)];
}

function sourceForLevel(lvl, s) {
    const pos = [
        { r: 0, c: 0 },
        { r: 0, c: s - 1 },
        { r: s - 1, c: s - 1 },
        { r: s - 1, c: 0 }
    ];
    return lvl <= pos.length ? pos[lvl - 1] : pickSource();
}

function solvable(board) {
    const s = size;
    for (let r = 0; r < s; r++) {
        for (let c = 0; c < s; c++) {
            if (board[r][c].every(v => v === 0)) return false;
        }
    }

    const visited = Array.from({ length: s }, () => Array(s).fill(false));
    const queue = [{ r: 0, c: 0 }];
    visited[0][0] = true;
    let count = 0;
    const total = s * s;

    while (queue.length) {
        const { r, c } = queue.shift();
        count++;
        if (count === total) return true;

        const mask = board[r][c];
        if (mask[DIR.N] && r > 0 && !visited[r - 1][c] && board[r - 1][c][DIR.S]) {
            visited[r - 1][c] = true;
            queue.push({ r: r - 1, c });
        }
        if (mask[DIR.E] && c < s - 1 && !visited[r][c + 1] && board[r][c + 1][DIR.W]) {
            visited[r][c + 1] = true;
            queue.push({ r, c: c + 1 });
        }
        if (mask[DIR.S] && r < s - 1 && !visited[r + 1][c] && board[r + 1][c][DIR.N]) {
            visited[r + 1][c] = true;
            queue.push({ r: r + 1, c });
        }
        if (mask[DIR.W] && c > 0 && !visited[r][c - 1] && board[r][c - 1][DIR.E]) {
            visited[r][c - 1] = true;
            queue.push({ r, c: c - 1 });
        }
    }
    return count === total;
}

function fallbackBoard() {
    const s = size;
    const board = Array.from({ length: s }, () => Array.from({ length: s }, () => [1, 0, 1, 0]));
    for (let r = 0; r < s - 1; r++) {
        for (let c = 0; c < s; c++) {
            board[r][c][DIR.S] = 1;
            board[r + 1][c][DIR.N] = 1;
        }
    }
    for (let r = 0; r < s; r++) {
        for (let c = 0; c < s - 1; c++) {
            board[r][c][DIR.E] = 1;
            board[r][c + 1][DIR.W] = 1;
        }
    }
    return board;
}

const EXTRA = [1, 2, 3, 5, 7];

function makeBoard(source) {
    const s = size;
    const solved = Array.from({ length: s }, () => Array.from({ length: s }, () => [0, 0, 0, 0]));

    function connect(r1, c1, r2, c2) {
        if (r1 === r2) {
            if (c1 < c2) {
                solved[r1][c1][DIR.E] = 1;
                solved[r2][c2][DIR.W] = 1;
            } else {
                solved[r1][c1][DIR.W] = 1;
                solved[r2][c2][DIR.E] = 1;
            }
        } else {
            if (r1 < r2) {
                solved[r1][c1][DIR.S] = 1;
                solved[r2][c2][DIR.N] = 1;
            } else {
                solved[r1][c1][DIR.N] = 1;
                solved[r2][c2][DIR.S] = 1;
            }
        }
    }

    const visited = Array.from({ length: s }, () => Array(s).fill(false));
    const walls = [];
    visited[source.r][source.c] = true;

    function addWalls(r, c) {
        if (r > 0) walls.push({ r1: r, c1: c, r2: r - 1, c2: c });
        if (r < s - 1) walls.push({ r1: r, c1: c, r2: r + 1, c2: c });
        if (c > 0) walls.push({ r1: r, c1: c, r2: r, c2: c - 1 });
        if (c < s - 1) walls.push({ r1: r, c1: c, r2: r, c2: c + 1 });
    }

    addWalls(source.r, source.c);

    while (walls.length) {
        const idx = Math.floor(Math.random() * walls.length);
        const wall = walls.splice(idx, 1)[0];
        if (visited[wall.r1][wall.c1] && !visited[wall.r2][wall.c2]) {
            connect(wall.r1, wall.c1, wall.r2, wall.c2);
            visited[wall.r2][wall.c2] = true;
            addWalls(wall.r2, wall.c2);
        }
    }

    const extra = EXTRA[s <= 6 ? s - 3 : 4] || 7;
    for (let i = 0; i < extra; i++) {
        const r = Math.floor(Math.random() * (s - 1));
        const c = Math.floor(Math.random() * (s - 1));
        Math.random() < 0.5 ? connect(r, c, r + 1, c) : connect(r, c, r, c + 1);
    }
    return solved;
}

function buildBoard(source) {
    if (!source) source = { r: 0, c: 0 };
    for (let i = 0; i < 10; i++) {
        const board = makeBoard(source);
        if (solvable(board)) return board;
    }
    return fallbackBoard();
}

function randomRot() {
    const roll = Math.random();
    if (level <= 2) return roll < 0.75 ? 1 : 0;
    if (level <= 8) return Math.floor(Math.random() * 3);
    return Math.floor(Math.random() * 4);
}

function needsRotate() {
    const roll = Math.random();
    if (level <= 2) return roll > 0.25;
    if (level <= 8) return roll > 0.15;
    return true;
}

function sourceRot(mask) {
    const dirs = [];
    if (mask[DIR.N]) dirs.push(DIR.N);
    if (mask[DIR.E]) dirs.push(DIR.E);
    if (mask[DIR.S]) dirs.push(DIR.S);
    if (mask[DIR.W]) dirs.push(DIR.W);

    if (dirs.length === 1) return dirs[0];
    if (dirs.length === 2) {
        if ((dirs.includes(DIR.N) && dirs.includes(DIR.S)) || (dirs.includes(DIR.E) && dirs.includes(DIR.W))) {
            return dirs.includes(DIR.N) ? 0 : 1;
        }
        if (dirs.includes(DIR.N) && dirs.includes(DIR.E)) return 0;
        if (dirs.includes(DIR.E) && dirs.includes(DIR.S)) return 1;
        if (dirs.includes(DIR.S) && dirs.includes(DIR.W)) return 2;
        if (dirs.includes(DIR.W) && dirs.includes(DIR.N)) return 3;
    }
    return 0;
}

function shuffle(board, source) {
    const s = size;
    const result = [];

    for (let r = 0; r < s; r++) {
        result[r] = [];
        for (let c = 0; c < s; c++) {
            let mask = board[r][c];
            if (mask.join("") === "0000") mask = [1, 0, 0, 0];
            const isSource = source && source.r === r && source.c === c;
            result[r][c] = {
                r, c,
                type: shapeOf(mask),
                rotation: isSource ? sourceRot(mask) : (needsRotate() ? randomRot() : 0),
                powered: false,
                locked: false,
                isSource: isSource
            };
        }
    }

    if (level >= 5) {
        const candidates = [];
        const center = (s - 1) / 2;
        for (let r = 0; r < s; r++) {
            for (let c = 0; c < s; c++) {
                const cell = result[r][c];
                if (cell.isSource || cell.type.id === "deadend" || cell.type.id === "line") continue;
                if (r === 0 || r === s - 1 || c === 0 || c === s - 1) continue;
                candidates.push({ cell, dist: Math.abs(r - center) + Math.abs(c - center) });
            }
        }
        if (candidates.length) {
            candidates.sort((a, b) => a.dist - b.dist);
            const top = candidates.slice(0, Math.min(3, candidates.length));
            const selected = top[Math.floor(Math.random() * top.length)];
            selected.cell.locked = true;
        }
    }

    return result;
}