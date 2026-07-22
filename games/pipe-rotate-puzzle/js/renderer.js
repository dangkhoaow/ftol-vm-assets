const gridElement = document.getElementById("grid");
const SVG_NS = "http://www.w3.org/2000/svg";
const ROT_STEP = 90;
const ROT_COUNT = 4;
const ROT_DELAY = 100;

let evaluating = false;

function svgEl(tag) {
    return document.createElementNS(SVG_NS, tag);
}

function render(source) {
    const s = size;
    gridElement.innerHTML = "";
    gridElement.style.gridTemplateColumns = `repeat(${s}, 1fr)`;
    gridElement.style.gridTemplateRows = `repeat(${s}, 1fr)`;

    for (let r = 0; r < s; r++) {
        for (let c = 0; c < s; c++) {
            const cell = cells[r][c];
            const isSource = source && source.r === r && source.c === c;

            const el = document.createElement("div");
            let cls = "cell";
            if (isSource) cls += " source";
            if (cell.locked) cls += " locked";
            el.className = cls;

            const inner = document.createElement("div");
            inner.className = "cell-inner";
            inner.style.transform = `rotate(${cell.rotation * ROT_STEP}deg)`;

            const svg = svgEl("svg");
            svg.setAttribute("viewBox", "0 0 100 100");

            draw(svg, cell.type);

            if (isSource) {
                const dot = svgEl("circle");
                dot.setAttribute("cx", "50");
                dot.setAttribute("cy", "50");
                dot.setAttribute("r", "10");
                dot.setAttribute("class", "dot");
                svg.appendChild(dot);
            }

            inner.appendChild(svg);
            el.appendChild(inner);
            gridElement.appendChild(el);

            cell.element = el;
            cell.innerElement = inner;

            el.addEventListener("click", () => {
                if (navigator.vibrate) navigator.vibrate(5);
                if (evaluating) return;

                if (cell.locked) {
                    el.style.transform = "scale(0.92)";
                    setTimeout(() => { el.style.transform = "scale(1)"; }, 100);
                    return;
                }

                evaluating = true;
                const old = cell.rotation;
                cell.rotation = (cell.rotation + 1) % ROT_COUNT;
                cell.innerElement.style.transform = `rotate(${cell.rotation * ROT_STEP}deg)`;
                window.addMove(cell.r, cell.c, old, cell.rotation);

                setTimeout(() => {
                    check();
                    evaluating = false;
                }, ROT_DELAY);
            });
        }
    }
}

function draw(svg, type) {
    const paths = {
        deadend: `<path d="M 50 50 L 50 0" /><circle cx="50" cy="50" r="5" class="wire-node"/>`,
        line: `<path d="M 50 0 L 50 100" />`,
        corner: `<path d="M 50 0 L 50 50 L 100 50" />`,
        tee: `<path d="M 50 0 L 50 100" /><path d="M 50 50 L 100 50" />`,
        cross: `<path d="M 50 0 L 50 100" /><path d="M 0 50 L 100 50" />`
    };
    svg.innerHTML = paths[type.id] || paths.line;
}

window.gridElement = gridElement;
window.resetEval = () => { evaluating = false; };