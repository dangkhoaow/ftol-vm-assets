import { load as loadMap } from "./map.js";
import Player from "./player.js";
import { saveGameState, loadGameState } from "./save_load.js";
import { debug, info, warn, error } from "./debug.js";
import { parseFlexJSON, fetchFlexJSON } from "./json.js";
import { spawnEntities } from "./entity.js";

const MODULE = "Game";

const DEFAULT_TILE_SIZE = 8;
const PLAYER_SPRITES = {
    left: "assets/sprites/player/left.png",
    right: "assets/sprites/player/right.png",
    leftDead: "assets/sprites/player/left_dead.png",
    rightDead: "assets/sprites/player/right_dead.png"
};

const UI_SPRITES = {
    heart: "assets/UI/heart.png",
    brokenHeart: "assets/UI/broken_heart.png"
};

const KEY_DIRECTIONS = {
    w: { dx: 0, dy: -1 },
    arrowup: { dx: 0, dy: -1 },
    s: { dx: 0, dy: 1 },
    arrowdown: { dx: 0, dy: 1 },
    a: { dx: -1, dy: 0 },
    arrowleft: { dx: -1, dy: 0 },
    d: { dx: 1, dy: 0 },
    arrowright: { dx: 1, dy: 0 }
};

/**
 * Load a single image and return a Promise resolving to an HTMLImageElement.
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
    debug(MODULE, `Loading image: ${src}`);
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            debug(MODULE, `Image loaded OK: ${src}`);
            resolve(image);
        };
        image.onerror = () => {
            error(MODULE, `Failed to load image: ${src}`);
            reject(new Error(`Failed to load image: ${src}`));
        };
        image.src = src;
    });
}

/**
 * agarrar del fetch un jsonc
 * @param {URL|string} url
 * @returns {Promise<object>}
 */
async function loadFlexJSON(url) {
    debug(MODULE, `Fetching flex JSON: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch from ${url} (status ${response.status})`);
    }
    const text = await response.text();
    debug(MODULE, `Fetched (${text.length} chars): ${url}`);
    return parseFlexJSON(text);
}

export default class Game {
    constructor(canvas, hudElement = null, inventoryElement = null, messageElement = null, equipmentElement = null, levelElement = null) {
        debug(MODULE, "Game constructor called");
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.hudElement = hudElement;
        this.inventoryElement = inventoryElement;
        this.messageElement = messageElement;
        this.equipmentElement = equipmentElement;
        this.levelElement = levelElement;
        this.map = null;
        this.player = null;
        this.imageCache = {};
        this.tileImages = {};
        this.playerImages = {};
        this.uiImages = {};
        this.config = {
            player: {
                speed: 5,
                gliding: {
                    enabled: true,
                    duration: 0.12
                }
            },
            map: {
                tile_size: DEFAULT_TILE_SIZE
            }
        };
        this.tileSize = DEFAULT_TILE_SIZE;
        this.viewportWidth  = 10;
        this.viewportHeight = 10;
        this.camera = { x: 0, y: 0 };
        this.cameraLerpSpeed = 18;
        this.health = 0;
        this.maxHealth = 0;
        this.baseMaxHealth = 10;
        this.baseAttack = 1;
        this.baseDefense = 0;
        this._statCheckTimer = 0;
        this.isDead = false;
        this.lastUpdate = null;
        this.moveStepTimer = 0;
        this.activeMoveKeys = new Set();
        this.moveOrder = [];
        this.currentDirection = { dx: 0, dy: 0 };
        this.animation = null;
        this.isAnimating = false;
        this.transition = null;
        this.visualPosition = { x: 0, y: 0 };
        this.inventory = [];
        this.selectedInventoryIndex = 0;
        this.equipment = { weapon: null, armor: null, offhand: null };
        this.equipmentOpen = false;
        this.level = 1;
        this.exp = 0;
        this.expToNextLevel = 80;
        this.itemDefinitions = {};
        this.mapChanges = [];
        this.messageTimeout = null;
        this.soundConfig = {
            BGM: {},
            player: {}
        };
        this.sounds = {
            damage: null,
            music: null
        };
        this.musicEnabled = true;
        this.entities = [];
        this.killedEntityIds = {};
        this.inventoryOpen = false;
        debug(MODULE, "Game instance initialized with defaults");
    }

    async loadConfig() {
        info(MODULE, "Loading config and sound config...");

        const [config, soundConfig] = await Promise.all([
            loadFlexJSON(new URL("./config.jsonc", import.meta.url)),
            loadFlexJSON(new URL("../assets/sounds/soundconfig.jsonc", import.meta.url))
        ]);

        debug(MODULE, "Raw config loaded:", config);
        debug(MODULE, "Raw soundConfig loaded:", soundConfig);

        this.config = {
            ...this.config,
            ...config,
            player: {
                ...this.config.player,
                ...(config.player || {})
            },
            map: {
                ...this.config.map,
                ...(config.map || {})
            }
        };

        this.soundConfig = {
            ...this.soundConfig,
            ...soundConfig,
            BGM: {
                ...this.soundConfig.BGM,
                ...(soundConfig.BGM || {})
            },
            player: {
                ...this.soundConfig.player,
                ...(soundConfig.player || {})
            }
        };

        this.tileSize = this.config.map.tile_size ?? this.tileSize;
        this.viewportWidth = this.config.map.viewport_width ?? this.viewportWidth;
        this.viewportHeight = this.config.map.viewport_height ?? this.viewportHeight;
        this.baseMaxHealth = (this.config.player.hearts ?? 10) || 10;
        this.baseAttack    = this.config.player.base_attack  ?? 1;
        this.baseDefense   = this.config.player.base_defense ?? 0;
        this.maxHealth = this.baseMaxHealth;
        this.health    = this.maxHealth;

        debug(MODULE, `Config applied: tileSize=${this.tileSize}, viewport=${this.viewportWidth}x${this.viewportHeight}, maxHealth=${this.maxHealth}, baseAtk=${this.baseAttack}, baseDef=${this.baseDefense}`);

        this.itemDefinitions = await loadFlexJSON(new URL("./items.jsonc", import.meta.url));
        info(MODULE, `Item definitions loaded: ${Object.keys(this.itemDefinitions).join(", ")}`);
    }

    getStepInterval() {
        const interval = 1 / Math.max(1, this.config.player.speed ?? 2);
        return interval;
    }

    getGlideDuration() {
        return this.config.player.gliding?.duration ?? 0.12;
    }

    async start(mapName) {
        info(MODULE, `Starting game with initial map: "${mapName}"`);
        await this.loadConfig();

        const savedState = loadGameState();
        const initialMap = savedState?.mapName || mapName;

        if (savedState) {
            info(MODULE, `Resuming from save — map: "${initialMap}", player: (${savedState.player?.x}, ${savedState.player?.y}), health: ${savedState.health}`);
        } else {
            info(MODULE, `No save found — starting fresh on map "${initialMap}"`);
        }

        this.map = await loadMap(initialMap);

        if (!this.map.spawn && !savedState) {
            throw new Error(`Start map '${initialMap}' must include a player_spawn tile.`);
        }

        if (savedState) {
            debug(MODULE, "Restoring player from save...");

            const px = savedState.player?.x;
            const py = savedState.player?.y;
            const mapW = this.map.width;
            const mapH = this.map.height;
            if (typeof px !== "number" || typeof py !== "number" || px < 0 || py < 0 || px >= mapW || py >= mapH) {
                if (this.map.spawn) {
                    warn(MODULE, `Saved player position (${px},${py}) is out of bounds for map ${mapW}x${mapH} — falling back to spawn`);
                    this.player = new Player(this.map.spawn.x, this.map.spawn.y);
                } else {
                    warn(MODULE, `Saved player position (${px},${py}) is invalid and map has no spawn — using (0,0)`);
                    this.player = new Player(0, 0);
                }
            } else {
                this.player = new Player(px, py);
            }

            this.player.facing = savedState.player.facing || "right";
            this.player.lastTilePosition = savedState.player.lastTilePosition || { x: this.player.x, y: this.player.y };
            this.baseMaxHealth = savedState.baseMaxHealth ?? this.baseMaxHealth;
            this.maxHealth     = savedState.maxHealth     ?? (this.baseMaxHealth + ((savedState.level ?? 1) - 1) * 2);
            this.baseAttack    = savedState.baseAttack    ?? this.baseAttack;
            this.baseDefense   = savedState.baseDefense   ?? this.baseDefense;
            this.health = Math.max(0, Math.min(this.maxHealth, savedState.health ?? this.maxHealth));
            this.inventory = Array.isArray(savedState.inventory) ? savedState.inventory : [];
            this.selectedInventoryIndex = savedState.selectedInventoryIndex ?? 0;
            this.equipment = savedState.equipment ?? { weapon: null, armor: null, offhand: null };
            this.level = savedState.level ?? 1;
            this.exp = savedState.exp ?? 0;
            this.expToNextLevel = savedState.expToNextLevel ?? 80;

            this.mapChanges = Array.isArray(savedState.mapChanges) ? savedState.mapChanges : [];
            // Migrate legacy flat-array saves to per-map format
            if (Array.isArray(savedState.killedEntityIds) && savedState.killedEntityIds.length > 0 && savedState.mapName) {
                this.killedEntityIds = { [savedState.mapName]: savedState.killedEntityIds };
            } else if (savedState.killedEntityIds && !Array.isArray(savedState.killedEntityIds)) {
                this.killedEntityIds = savedState.killedEntityIds;
            } else {
                this.killedEntityIds = {};
            }

            debug(MODULE, `Restored inventory (${this.inventory.length} items), mapChanges (${this.mapChanges.length} total across all maps)`);
            this.restoreMapChanges(this.mapChanges);
        } else {
            debug(MODULE, "Creating fresh player at spawn...");
            this.player = new Player(this.map.spawn.x, this.map.spawn.y);
            this.player.lastTilePosition = { x: this.player.x, y: this.player.y };
            this.visualPosition = { x: this.player.x, y: this.player.y };
            this.isDead = false;
            this.health = this.maxHealth;
            this.selectedInventoryIndex = 0;
            this.mapChanges = [];
            this.killedEntityIds = {};
        }

        this.visualPosition = { x: this.player.x, y: this.player.y };
        debug(MODULE, `Visual position set to (${this.visualPosition.x}, ${this.visualPosition.y})`);

        this.entities = spawnEntities(this.map);
        const _mapKilled = this.killedEntityIds[this.map.name] ?? [];
        if (_mapKilled.length > 0) {
            this.entities = this.entities.filter(e => !_mapKilled.includes(e.instanceId));
            debug(MODULE, `Filtered ${_mapKilled.length} killed entities — ${this.entities.length} remain`);
        }

        info(MODULE, "Loading textures...");
        await this.loadTextures();

        this.resizeCanvas();
        debug(MODULE, `Canvas resized to ${this.canvas.width}x${this.canvas.height}px`);

        this.applyTileEffects(this.player.x, this.player.y);
        this.setupSoundsForCurrentMap();

        if (this.sounds.music && this.musicEnabled) {
            debug(MODULE, "Starting background music...");
            this.sounds.music.play().catch((err) => {
                warn(MODULE, "Music autoplay was blocked by browser:", err.message);
            });
        }

        this.updateLevelDisplay();
        this.draw();
        info(MODULE, "Game started successfully — entering game loop");
        return this;
    }

    async loadTextures() {
        info(MODULE, "Loading all textures...");
        const tileSources = Object.values(this.map.definitions.tiles);
        const itemSources = Object.values(this.itemDefinitions || {}).map(item => item.texture).filter(Boolean);
        const entitySources = Object.values(this.map.definitions.entities ?? {}).map(e => e.sprite).filter(Boolean);
        const assetSources = new Set([
            ...tileSources,
            ...Object.values(PLAYER_SPRITES),
            ...Object.values(UI_SPRITES),
            ...itemSources,
            ...entitySources
        ]);

        debug(MODULE, `Total unique assets to load: ${assetSources.size}`);

        const loadPromises = [...assetSources].map(async (src) => {
            if (!this.imageCache[src]) {
                this.imageCache[src] = await loadImage(src);
            } else {
                debug(MODULE, `Cache hit for: ${src}`);
            }
        });

        await Promise.all(loadPromises);
        info(MODULE, `All ${assetSources.size} textures loaded (${Object.keys(this.imageCache).length} total in cache)`);

        this.tileImages = Object.fromEntries(
            tileSources.map(src => [src, this.imageCache[src]])
        );
        debug(MODULE, `Tile images registered: ${Object.keys(this.tileImages).length}`);

        this.playerImages = {
            left: this.imageCache[PLAYER_SPRITES.left],
            right: this.imageCache[PLAYER_SPRITES.right],
            leftDead: this.imageCache[PLAYER_SPRITES.leftDead],
            rightDead: this.imageCache[PLAYER_SPRITES.rightDead]
        };
        debug(MODULE, "Player images registered:", Object.keys(this.playerImages));

        this.uiImages = {
            heart: this.imageCache[UI_SPRITES.heart],
            brokenHeart: this.imageCache[UI_SPRITES.brokenHeart]
        };
        debug(MODULE, "UI images registered:", Object.keys(this.uiImages));
    }

    resizeCanvas() {
        this.camera.x = 0;
        this.camera.y = 0;
        // el canvas siempre es viewportWidth x viewportHeight, las partes fuera del mapa se pintan de negro
        this.canvas.width  = this.viewportWidth  * this.tileSize;
        this.canvas.height = this.viewportHeight * this.tileSize;
        debug(MODULE, `Canvas dimensions: ${this.canvas.width}x${this.canvas.height}px (${this.viewportWidth}x${this.viewportHeight} tiles @ ${this.tileSize}px each)`);
    }

    getCamera() {
        const halfWidth = Math.floor(this.viewportWidth / 2);
        const halfHeight = Math.floor(this.viewportHeight / 2);
        let x = this.player.x - halfWidth;
        let y = this.player.y - halfHeight;

        if (this.map.width < this.viewportWidth) {
            x = -Math.floor((this.viewportWidth - this.map.width) / 2);
        } else {
            x = Math.max(0, Math.min(x, this.map.width - this.viewportWidth));
        }

        if (this.map.height < this.viewportHeight) {
            y = -Math.floor((this.viewportHeight - this.map.height) / 2);
        } else {
            y = Math.max(0, Math.min(y, this.map.height - this.viewportHeight));
        }

        return { x, y };
    }

    setMoveKey(key, active) {
        if (this.transition || this.isDead) {
            debug(MODULE, `setMoveKey("${key}", ${active}) ignored — transition=${!!this.transition}, dead=${this.isDead}`);
            return;
        }

        const normalizedKey = key.toLowerCase();
        if (!KEY_DIRECTIONS[normalizedKey]) {
            debug(MODULE, `setMoveKey: unknown key "${normalizedKey}", ignoring`);
            return;
        }

        if (active) {
            if (!this.activeMoveKeys.has(normalizedKey)) {
                this.activeMoveKeys.add(normalizedKey);
                this.moveOrder.push(normalizedKey);
                debug(MODULE, `Key pressed: "${normalizedKey}", active keys: [${[...this.activeMoveKeys].join(", ")}]`);
                if (!this.isAnimating) {
                    this.moveStepTimer = this.getStepInterval();
                }
            }
        } else {
            if (this.activeMoveKeys.delete(normalizedKey)) {
                this.moveOrder = this.moveOrder.filter(item => item !== normalizedKey);
                debug(MODULE, `Key released: "${normalizedKey}", active keys: [${[...this.activeMoveKeys].join(", ")}]`);
            }
        }
    }

    getActiveDirection() {
        for (let i = this.moveOrder.length - 1; i >= 0; i--) {
            const key = this.moveOrder[i];
            const direction = KEY_DIRECTIONS[key];
            if (direction) {
                return direction;
            }
        }
        return { dx: 0, dy: 0 };
    }

    updateCamera(deltaSeconds) {
        const target = this.getCamera();
        const t = Math.min(1, deltaSeconds * this.cameraLerpSpeed);
        this.camera.x += (target.x - this.camera.x) * t;
        this.camera.y += (target.y - this.camera.y) * t;
    }

    update(now) {
        if (!this.map) {
            debug(MODULE, "update() called but map is not loaded yet, skipping");
            return;
        }

        const deltaSeconds = this.lastUpdate ? (now - this.lastUpdate) / 1000 : 0;
        this.lastUpdate = now;

        // pausa cuando inventario o equipamiento esta abierto
        if (this.inventoryOpen || this.equipmentOpen) { return; }

        if (this.isAnimating && this.animation) {
            this.animation.progress += deltaSeconds / this.getGlideDuration();
            debug(MODULE, `Animation progress: ${this.animation.progress.toFixed(3)}`);
            if (this.animation.progress >= 1) {
                this.visualPosition = { x: this.animation.toX, y: this.animation.toY };
                this.animation = null;
                this.isAnimating = false;
                debug(MODULE, `Animation complete — visual position settled at (${this.visualPosition.x},${this.visualPosition.y})`);
            }
        }

        if (this.transition) {
            this.transition.timer += deltaSeconds;
            debug(MODULE, `Transition phase="${this.transition.phase}" timer=${this.transition.timer.toFixed(3)}s / ${this.transition.duration}s`);

            if (this.transition.phase === "fade-out" && this.transition.timer >= this.transition.duration && !this.transition.loading) {
                debug(MODULE, "Fade-out complete — performing warp");
                this.transition.loading = true;
                this.performWarp(this.transition.warp).catch((err) => {
                    error(MODULE, "Warp failed — recovering transition state:", err);
                    this.transition = null;
                });
            }

            if (this.transition.phase === "fade-in" && this.transition.timer >= this.transition.duration) {
                debug(MODULE, "Fade-in complete — transition cleared");
                this.transition = null;
            }

            return;
        }

        const direction = this.getActiveDirection();
        const isMoving = direction.dx !== 0 || direction.dy !== 0;
        const stepInterval = this.getStepInterval();
        const directionChanged = direction.dx !== this.currentDirection.dx || direction.dy !== this.currentDirection.dy;

        if (directionChanged) {
            debug(MODULE, `Direction changed: (${this.currentDirection.dx},${this.currentDirection.dy}) → (${direction.dx},${direction.dy})`);
            this.currentDirection = direction;
            if (!this.isAnimating) {
                this.moveStepTimer = stepInterval;
            }
        }

        if (isMoving && !this.isAnimating) {
            this.moveStepTimer += deltaSeconds;
            if (this.moveStepTimer >= stepInterval) {
                this.moveStepTimer -= stepInterval;
                debug(MODULE, `Step timer fired — moving player (${direction.dx},${direction.dy})`);
                this.movePlayer(direction.dx, direction.dy);
            }
        } else if (!isMoving) {
            this.moveStepTimer = 0;
        }

        if (this.entities && this.entities.length > 0) {
            for (const entity of this.entities) {
                const damage = entity.update(deltaSeconds, this.map, this.player.x, this.player.y);
                if (damage > 0) {
                    this.takeDamage(damage);
                    const kbDx = Math.sign(this.player.x - entity.x);
                    const kbDy = Math.sign(this.player.y - entity.y);
                    this.knockbackPlayer(kbDx, kbDy);
                }
            }
        }

        this.updateCamera(deltaSeconds);

        // validación periódica de stats cada 5 s
        this._statCheckTimer += deltaSeconds;
        if (this._statCheckTimer >= 5) {
            this._statCheckTimer = 0;
            this.validateStats();
        }
    }

    validateStats() {
        const expectedMax = this.baseMaxHealth + (this.level - 1) * 2;
        let changed = false;
        if (this.maxHealth !== expectedMax) {
            warn(MODULE, `validateStats: maxHealth desync (${this.maxHealth} → ${expectedMax}), corrigiendo`);
            this.maxHealth = expectedMax;
            this.health    = Math.min(this.health, this.maxHealth);
            changed = true;
        }
        if (this.health < 0) { this.health = 0; changed = true; }
        if (changed) this.saveState();
        debug(MODULE, `validateStats — hp=${this.health}/${this.maxHealth}, atk=${this.getAttackPower()}, def=${this.getDefenseValue()}`);
    }

    async movePlayer(dx, dy) {
        if (this.isAnimating || this.transition || this.isDead) {
            debug(MODULE, `movePlayer(${dx},${dy}) blocked — animating=${this.isAnimating}, transition=${!!this.transition}, dead=${this.isDead}`);
            return;
        }

        if (dx === 0 && dy === 0) {
            debug(MODULE, "movePlayer: zero delta, no movement");
            return;
        }

        const originX = this.player.x;
        const originY = this.player.y;
        debug(MODULE, `movePlayer: attempting (${originX},${originY}) + (${dx},${dy})`);

        const destX = originX + dx;
        const destY = originY + dy;
        const targetEntity = this.entities?.find(e => e.x === destX && e.y === destY);
        if (targetEntity) {
            if (dx < 0) { this.player.facing = "left"; }
            if (dx > 0) { this.player.facing = "right"; }
            this.attackEntity(targetEntity);
            return;
        }

        const result = this.player.move(dx, dy, this.map.logic, this.map.definitions);

        if (result?.type === "warp") {
            info(MODULE, `Warp triggered → map="${result.toMap}", target=(${result.toX},${result.toY})`);
            this.startTransition(result);
            return;
        }

        if (this.player.x !== originX || this.player.y !== originY) {
            debug(MODULE, `Player moved: (${originX},${originY}) → (${this.player.x},${this.player.y})`);
            this.applyTileEffects(this.player.x, this.player.y);
            this.saveState();
            this.animateMovement(this.player.x, this.player.y);
        } else {
            debug(MODULE, `Player did not move from (${originX},${originY})`);
        }
    }

    applyTileEffects(x, y) {
        if (!this.map || this.isDead) {
            debug(MODULE, `applyTileEffects(${x},${y}) skipped — map=${!!this.map}, dead=${this.isDead}`);
            return;
        }

        if (this.player.lastTilePosition && this.player.lastTilePosition.x === x && this.player.lastTilePosition.y === y) {
            debug(MODULE, `applyTileEffects(${x},${y}) skipped — same as last tile position`);
            return;
        }

        const id = this.map.logic[y][x];
        const def = this.map.definitions.collisions[id];

        debug(MODULE, `applyTileEffects at (${x},${y}): tile id=${id}, type="${def?.type}"`);
        this.player.lastTilePosition = { x, y };

        if (def?.type === "player_damage") {
            const damage = Number(def.damage || 1);
            if (damage > 0) {
                this.takeDamage(damage);
            }
        }

        if (def?.type === "heal_regen") {
            debug(MODULE, `Regenerative tile at (${x},${y}) — type noted (passive, not yet implemented)`);
        }
    }

    takeDamage(rawAmount) {
        if (this.isDead) {
            return;
        }
        const defense = this.getDefenseValue();
        const amount  = Math.max(1, rawAmount - defense);
        const oldHealth = this.health;
        this.health = Math.max(0, this.health - amount);
        warn(MODULE, `Player took ${amount} damage (raw=${rawAmount}, def=${defense}) — health: ${oldHealth} → ${this.health}`);

        if (this.sounds.damage) {
            this.sounds.damage.play().catch((err) => {
                warn(MODULE, "Failed to play damage sound:", err.message);
            });
        }

        if (this.health <= 0) {
            warn(MODULE, "Health reached 0 — player died");
            this.die();
        }
        this.saveState();
    }

    saveState() {
        if (!this.map || !this.player) {
            warn(MODULE, "saveState() called but map or player is not ready, skipping");
            return;
        }

        debug(MODULE, "Saving game state...");
        saveGameState({
            mapName: this.map.name,
            player: {
                x: this.player.x,
                y: this.player.y,
                facing: this.player.facing,
                lastTilePosition: this.player.lastTilePosition
            },
            health: this.health,
            maxHealth: this.maxHealth,
            baseMaxHealth: this.baseMaxHealth,
            baseAttack: this.baseAttack,
            baseDefense: this.baseDefense,
            inventory: this.inventory,
            selectedInventoryIndex: this.selectedInventoryIndex,
            equipment: this.equipment,
            level: this.level,
            exp: this.exp,
            expToNextLevel: this.expToNextLevel,
            mapChanges: this.mapChanges,
            killedEntityIds: this.killedEntityIds
        });
    }

    addItemToInventory(itemId) {
        if (!this.itemDefinitions[itemId]) {
            warn(MODULE, `addItemToInventory: unknown item id "${itemId}"`);
            return;
        }

        this.inventory.push(itemId);
        this.selectedInventoryIndex = this.inventory.length - 1;
        info(MODULE, `Item added to inventory: "${itemId}" (slot ${this.selectedInventoryIndex}), total items: ${this.inventory.length}`);
        this.saveState();
        this.onInventoryChanged?.();
    }

    getSelectedItem() {
        if (!this.inventory.length) {
            debug(MODULE, "getSelectedItem: inventory is empty");
            return null;
        }

        const itemId = this.inventory[this.selectedInventoryIndex] || this.inventory[0];
        const item = this.itemDefinitions[itemId] || null;
        debug(MODULE, `getSelectedItem: slot ${this.selectedInventoryIndex} → "${itemId}" (${item ? item.display_name : "unknown"})`);
        return item;
    }

    cycleInventory(offset) {
        if (!this.inventory.length) {
            debug(MODULE, "cycleInventory: inventory is empty, no cycle");
            return;
        }

        const prev = this.selectedInventoryIndex;
        this.selectedInventoryIndex = (this.selectedInventoryIndex + offset + this.inventory.length) % this.inventory.length;
        debug(MODULE, `Inventory cycled: slot ${prev} → ${this.selectedInventoryIndex} (offset=${offset})`);
        this.saveState();
    }

    useSelectedItem() {
        const item = this.getSelectedItem();
        if (!item) {
            debug(MODULE, "useSelectedItem: no item selected");
            return;
        }

        debug(MODULE, `Using item: "${item.display_name}" (type="${item.type}")`);

        if (item.type === "equipment") {
            const itemId = this.inventory[this.selectedInventoryIndex];
            if (itemId) this.equipItem(itemId);
            return;
        }

        if (item.type === "consumable") {
            const amount = item.use?.amount ?? item.heals ?? 0;
            const action = item.use?.action ?? (item.heals ? "heal" : null);

            if (action === "heal" && amount > 0) {
                const oldHealth = this.health;
                this.health = Math.min(this.maxHealth, this.health + Number(amount));
                info(MODULE, `Item used: "${item.display_name}" healed ${amount} HP — health: ${oldHealth} → ${this.health}`);
                this.showMessage(`¡Usaste ${item.display_name}! +${this.health - oldHealth} HP.`);
            } else {
                debug(MODULE, `Item "${item.display_name}" consumed but no heal action taken (action="${action}", amount=${amount})`);
                this.showMessage(`Usaste ${item.display_name}.`);
            }

            const removedIndex = this.selectedInventoryIndex;
            this.inventory.splice(removedIndex, 1);
            debug(MODULE, `Item removed from slot ${removedIndex}, inventory now has ${this.inventory.length} items`);

            if (this.inventory.length === 0) {
                this.selectedInventoryIndex = 0;
            } else if (this.selectedInventoryIndex >= this.inventory.length) {
                this.selectedInventoryIndex = this.inventory.length - 1;
            }
            this.saveState();
            this.onInventoryChanged?.();
        }
    }

    isInteractInRange(def, x, y) {
        const dx = Math.abs(this.player.x - x);
        const dy = Math.abs(this.player.y - y);
        const radius = Number(def.interactRequirements?.player_in_radius ?? def.interactRequirements?.player_max_position ?? 1);
        const minRadius = Number(def.interactRequirements?.player_min_position ?? 0);
        const diagonalAllowed = def.interactRequirements?.diagonal !== false;

        debug(MODULE, `isInteractInRange: player=(${this.player.x},${this.player.y}), tile=(${x},${y}), dx=${dx}, dy=${dy}, radius=${radius}, minRadius=${minRadius}, diagonal=${diagonalAllowed}`);

        if (!diagonalAllowed && dx > 0 && dy > 0) {
            debug(MODULE, "Interaction blocked: diagonal not allowed");
            return false;
        }

        const dist = dx + dy;
        if (dist < minRadius) {
            debug(MODULE, `Interaction blocked: dist ${dist} < minRadius ${minRadius}`);
            return false;
        }

        const inRange = dist <= radius;
        debug(MODULE, `isInteractInRange: dist=${dist}, radius=${radius} → ${inRange ? "IN RANGE" : "OUT OF RANGE"}`);
        return inRange;
    }

    interactAt(tileX, tileY) {
        if (!this.map || this.isDead) {
            debug(MODULE, `interactAt(${tileX},${tileY}) skipped — map=${!!this.map}, dead=${this.isDead}`);
            return;
        }

        if (tileX < 0 || tileX >= this.map.width || tileY < 0 || tileY >= this.map.height) {
            debug(MODULE, `interactAt(${tileX},${tileY}) skipped — out of map bounds`);
            return;
        }

        const id = this.map.logic[tileY]?.[tileX];
        if (id === undefined) {
            debug(MODULE, `interactAt(${tileX},${tileY}): no tile data found`);
            return;
        }

        const def = this.map.definitions.collisions[id];
        if (!def || def.interactType !== "click") {
            debug(MODULE, `interactAt(${tileX},${tileY}): tile id=${id} type="${def?.type}" is not click-interactable`);
            return;
        }

        debug(MODULE, `interactAt(${tileX},${tileY}): tile id=${id}, type="${def.type}", checking range...`);

        if (!this.isInteractInRange(def, tileX, tileY)) {
            debug(MODULE, `interactAt: player out of range for tile (${tileX},${tileY})`);
            return;
        }

        if (def.type === "heal") {
            const healAmount = Number(def.heals || 0);
            const oldHealth = this.health;
            this.health = Math.min(this.maxHealth, this.health + healAmount);
            info(MODULE, `Heal tile at (${tileX},${tileY}) used — healed ${healAmount} HP, health: ${oldHealth} → ${this.health}`);

            if (!def.infinity) {
                debug(MODULE, `Non-infinite heal — applying map change at (${tileX},${tileY})`);
                this.applyMapChange(tileX, tileY, Number(def.afterOpeningCollision ?? 0), def.afterOpeningTile ? Number(def.afterOpeningTile) : undefined);
            } else {
                debug(MODULE, "Heal source is infinite — no map change");
            }

            if (def.afterInteractText) {
                this.showMessage(def.afterInteractText);
            }
            this.saveState();
        }

        if (def.type === "chest") {
            debug(MODULE, `Chest at (${tileX},${tileY}) opened — contains: "${def.contains ?? "nothing"}"`);
            if (def.contains) {
                this.addItemToInventory(def.contains);
            }
            this.applyMapChange(tileX, tileY, Number(def.afterOpeningCollision ?? 0), def.afterOpeningTile ? Number(def.afterOpeningTile) : undefined);

            const message = def.afterInteractText || "Abriste el cofre.";
            this.showMessage(message);
            this.saveState();
        }
    }

    die() {
        if (this.isDead) {
            debug(MODULE, "die() called but player is already dead");
            return;
        }

        warn(MODULE, "Player has died");
        this.isDead = true;
        this.activeMoveKeys.clear();
        this.moveOrder = [];
        this.isAnimating = false;
        this.animation = null;
        debug(MODULE, "Death state applied — movement cleared");
    }

    animateMovement(targetX, targetY) {
        debug(MODULE, `animateMovement: from (${this.visualPosition.x},${this.visualPosition.y}) → (${targetX},${targetY})`);
        this.animation = {
            fromX: this.visualPosition.x,
            fromY: this.visualPosition.y,
            toX: targetX,
            toY: targetY,
            progress: 0
        };
        this.isAnimating = true;
    }

    getInteractionTarget() {
        // derecha o izquierda
        const target = { x: this.player.x, y: this.player.y };
        if (this.player.facing === "left") {target.x -= 1;}
        else {target.x += 1;}
        debug(MODULE, `getInteractionTarget: facing="${this.player.facing}", target tile=(${target.x},${target.y})`);
        return target;
    }

    // F -- interactua con tiles (fuentes, cofres, puertas...)
    interactForward() {
        if (this.isDead) { return; }
        const target = this.getInteractionTarget();
        debug(MODULE, `interactForward → tile (${target.x},${target.y})`);
        this.interactAt(target.x, target.y);
    }

    attackEntity(entity) {
        if (this.isDead || this.transition) { return; }
        const atk = this.getAttackPower();
        entity.health -= atk;
        debug(MODULE, `Golpe a "${entity.type}" en (${entity.x},${entity.y}) — daño=${atk} HP: ${entity.health}/${entity.maxHealth}`);
        if (entity.health <= 0) {
            this.entities = this.entities.filter(e => e !== entity);
            (this.killedEntityIds[this.map.name] ??= []).push(entity.instanceId);
            info(MODULE, `"${entity.type}" derrotado en (${entity.x},${entity.y})`);
            const NOMBRES = { bat: 'murciélago', bat_oscuro: 'murciélago oscuro', bat_grande: 'murciélago grande', bat_guardian: 'murciélago guardián', bat_elite: 'murciélago élite' };
            const nombreEnemigo = NOMBRES[entity.type] ?? entity.type;
            this.showMessage(`¡Derrotaste al ${nombreEnemigo}!`);
            this.gainExp(entity.expDrop);
        } else {
            const kbDx = Math.sign(entity.x - this.player.x);
            const kbDy = Math.sign(entity.y - this.player.y);
            entity.applyKnockback(kbDx, kbDy, this.map);
        }
    }

    knockbackPlayer(dx, dy) {
        if (this.isDead || this.isAnimating || this.transition) { return; }
        if (dx === 0 && dy === 0) { return; }
        if (dx < 0) { this.player.facing = "left"; }
        if (dx > 0) { this.player.facing = "right"; }
        // Knockback visual-only: nudge 0.2 tiles, sin mover posicion logica, snap muy rapido
        const px = this.player.x;
        const py = this.player.y;
        this.animation = {
            fromX: px + dx * 0.2,
            fromY: py + dy * 0.2,
            toX: px,
            toY: py,
            progress: 0.5
        };
        this.isAnimating = true;
        debug(MODULE, `Player knockback visual bump (${dx * 0.2},${dy * 0.2})`);
    }

    attackForward() {
        if (this.isDead || this.transition) { return; }
        const target = this.getInteractionTarget();
        debug(MODULE, `attackForward → (${target.x},${target.y})`);
        if (!this.entities || this.entities.length === 0) { return; }
        const hit = this.entities.find(e => e.x === target.x && e.y === target.y);
        if (!hit) {
            debug(MODULE, "attackForward: no entity at target");
            return;
        }
        this.attackEntity(hit);
    }

    resolveSoundUrl(filename) {
        if (!filename) {
            return null;
        }
        const url = new URL(`../assets/sounds/${filename}`, import.meta.url).href;
        debug(MODULE, `Resolved sound URL: "${filename}" → ${url}`);
        return url;
    }

    createAudio(filename, options = {}) {
        const url = this.resolveSoundUrl(filename);
        if (!url) {
            warn(MODULE, `createAudio: no URL for filename "${filename}"`);
            return null;
        }
        const audio = new Audio(url);
        if (options.loop) {
            audio.loop = true;
        }
        if (options.volume !== undefined) {
            audio.volume = options.volume;
        }
        debug(MODULE, `Audio created: "${filename}" (loop=${!!options.loop}, volume=${options.volume ?? "default"})`);
        return audio;
    }

    setupSoundsForCurrentMap() {
        const mapName = this.map?.name;
        if (!mapName) {
            warn(MODULE, "setupSoundsForCurrentMap: map name not available");
            return;
        }

        debug(MODULE, `Setting up sounds for map "${mapName}"...`);

        const musicFile = this.soundConfig?.BGM?.[mapName] || Object.values(this.soundConfig?.BGM || {})[0];
        if (musicFile) {
            const resolvedUrl = this.resolveSoundUrl(musicFile);
            if (!this.sounds.music || this.sounds.music.src !== resolvedUrl) {
                debug(MODULE, `Switching BGM to: "${musicFile}"`);
                this.sounds.music?.pause();
                this.sounds.music = this.createAudio(musicFile, { loop: true });
            } else {
                debug(MODULE, `BGM already set to "${musicFile}", no change`);
            }
        } else {
            warn(MODULE, `No BGM entry found for map "${mapName}" in soundConfig`);
        }

        const damageFile = this.soundConfig?.player?.receive_damage;
        if (damageFile) {
            const resolvedUrl = this.resolveSoundUrl(damageFile);
            if (!this.sounds.damage || this.sounds.damage.src !== resolvedUrl) {
                debug(MODULE, `Setting damage sound: "${damageFile}"`);
                this.sounds.damage = this.createAudio(damageFile);
            } else {
                debug(MODULE, `Damage sound already set to "${damageFile}", no change`);
            }
        } else {
            warn(MODULE, "No receive_damage sound found in soundConfig.player");
        }

        debug(MODULE, `Sounds setup complete — music=${!!this.sounds.music}, damage=${!!this.sounds.damage}`);
    }

    setInventoryOpen(open) {
        this.inventoryOpen = open;
        // resetea el timer para no acumular dt mientras estaba pausado
        this.lastUpdate = null;
        if (open) {
            // para el movimiento inmediatamente al abrir
            this.activeMoveKeys.clear();
            this.moveOrder = [];
        }
        debug(MODULE, `Inventory ${open ? "opened" : "closed"} — game ${open ? "paused" : "resumed"}`);
    }

    toggleMusic() {
        debug(MODULE, "toggleMusic called");
        if (!this.sounds.music) {
            debug(MODULE, "No music object found — calling setupSoundsForCurrentMap");
            this.setupSoundsForCurrentMap();
        }

        if (!this.sounds.music) {
            warn(MODULE, "toggleMusic: still no music after setup, cannot toggle");
            return;
        }

        this.musicEnabled = !this.musicEnabled;
        debug(MODULE, `Music toggled — musicEnabled=${this.musicEnabled}`);

        if (this.musicEnabled) {
            debug(MODULE, "Music enabled — resuming");
            this.sounds.music.play().catch((err) => {
                warn(MODULE, "Failed to resume music:", err.message);
            });
        } else {
            debug(MODULE, "Music disabled — pausing");
            this.sounds.music.pause();
        }
    }

    clearSave() {
        info(MODULE, "clearSave called — removing save from localStorage");
        localStorage.removeItem("ftol:pixelrealmrpg:jsrpg_save");
    }

    downloadSave() {
        const raw = localStorage.getItem("ftol:pixelrealmrpg:jsrpg_save");
        if (!raw) {
            warn(MODULE, "downloadSave: no save data found");
            this.showMessage("No hay partida guardada.");
            return;
        }
        info(MODULE, `downloadSave: exporting ${raw.length} bytes as jsrpg_save.json`);
        const blob = new Blob([raw], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "jsrpg_save.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showMessage("¡Guardado!");
    }

    async importSave(file) {
        if (!file) {
            warn(MODULE, "importSave: no file provided");
            return;
        }
        info(MODULE, `importSave: reading file "${file.name}" (${file.size} bytes)`);
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);

            if (typeof parsed.mapName !== "string" || !parsed.mapName) {
                throw new Error("Missing or invalid mapName");
            }
            if (!parsed.player || typeof parsed.player !== "object") {
                throw new Error("Missing or invalid player object");
            }
            if (typeof parsed.player.x !== "number" || typeof parsed.player.y !== "number") {
                throw new Error("player.x / player.y must be numbers");
            }
            if (parsed.player.x < 0 || parsed.player.y < 0) {
                throw new Error("player coordinates must be non-negative");
            }
            if (parsed.health !== undefined && (typeof parsed.health !== "number" || parsed.health < 0)) {
                throw new Error("health must be a non-negative number");
            }

            localStorage.setItem("ftol:pixelrealmrpg:jsrpg_save", text);
            info(MODULE, "importSave: save written to localStorage — reloading");
            window.location.reload();
        } catch (err) {
            error(MODULE, "importSave: invalid save file:", err.message);
            this.showMessage("Archivo inválido.");
        }
    }

    applyMapChange(tileX, tileY, newLogic, newMapTile) {
        if (!this.map) {
            warn(MODULE, "applyMapChange called but map is not loaded");
            return;
        }

        debug(MODULE, `applyMapChange at map="${this.map.name}" (${tileX},${tileY}): logic=${newLogic}${newMapTile !== undefined ? `, mapTile=${newMapTile}` : ""}`);

        this.map.logic[tileY][tileX] = newLogic;
        if (newMapTile !== undefined) {
            this.map.map[tileY][tileX] = newMapTile;
        }

        const existingIndex = this.mapChanges.findIndex(
            change => change.mapName === this.map.name && change.x === tileX && change.y === tileY
        );
        const change = { mapName: this.map.name, x: tileX, y: tileY, logic: newLogic };
        if (newMapTile !== undefined) {
            change.map = newMapTile;
        }

        if (existingIndex >= 0) {
            debug(MODULE, `Updating existing mapChange at index ${existingIndex}`);
            this.mapChanges[existingIndex] = change;
        } else {
            debug(MODULE, `Adding new mapChange (total: ${this.mapChanges.length + 1})`);
            this.mapChanges.push(change);
        }
    }

    restoreMapChanges(changes) {
        if (!this.map || !Array.isArray(changes)) {
            warn(MODULE, "restoreMapChanges: map not ready or changes is not an array");
            return;
        }

        // no sabia que poner aqui lol


        const relevant = changes.filter(c => c.mapName === this.map.name);
        info(MODULE, `Restoring ${relevant.length} of ${changes.length} total map changes for "${this.map.name}"...`);

        for (const change of relevant) {
            if (typeof change.x !== "number" || typeof change.y !== "number") {
                warn(MODULE, "Skipping invalid mapChange entry:", change);
                continue;
            }
            if (change.y < 0 || change.y >= this.map.height || change.x < 0 || change.x >= this.map.width) {
                warn(MODULE, `Skipping out-of-bounds mapChange at (${change.x},${change.y}) for map "${this.map.name}" (${this.map.width}x${this.map.height})`);
                continue;
            }
            debug(MODULE, `Restoring change at (${change.x},${change.y}): logic=${change.logic}, mapTile=${change.map}`);
            if (change.logic !== undefined) {
                this.map.logic[change.y][change.x] = change.logic;
            }
            if (change.map !== undefined) {
                this.map.map[change.y][change.x] = change.map;
            }
        }

        debug(MODULE, "Map changes restored for current map");
    }

    startTransition(warp) {
        info(MODULE, `Starting fade-out transition to map "${warp.toMap}" at (${warp.toX},${warp.toY})`);
        this.activeMoveKeys.clear();
        this.moveOrder = [];
        this.transition = {
            phase: "fade-out",
            timer: 0,
            duration: this.config.player.gliding?.duration ?? 0.12,
            warp,
            loading: false
        };
        debug(MODULE, `Transition created: phase="${this.transition.phase}", duration=${this.transition.duration}s`);
    }

    async performWarp(warp) {
        info(MODULE, `Performing warp to map "${warp.toMap}" at (${warp.toX},${warp.toY})`);

        const newMap = await loadMap(warp.toMap);
        debug(MODULE, `Warp map "${warp.toMap}" loaded`);

        this.map = newMap;
        this.player.x = warp.toX;
        this.player.y = warp.toY;
        this.player.lastTilePosition = null;
        this.visualPosition = { x: warp.toX, y: warp.toY };
        this.animation = null;
        this.isAnimating = false;
        this.restoreMapChanges(this.mapChanges);
        this.entities = spawnEntities(this.map);
        const _warpMapKilled = this.killedEntityIds[this.map.name] ?? [];
        if (_warpMapKilled.length > 0) {
            this.entities = this.entities.filter(e => !_warpMapKilled.includes(e.instanceId));
            debug(MODULE, `Warp: filtered ${_warpMapKilled.length} killed entities — ${this.entities.length} remain`);
        }

        debug(MODULE, `Player repositioned to (${this.player.x},${this.player.y}) in new map, visual position snapped`);

        await this.loadTextures();
        this.resizeCanvas();
        this.applyTileEffects(this.player.x, this.player.y);
        this.updateLevelDisplay();
        this.saveState();

        if (this.transition) {
            this.transition.phase = "fade-in";
            this.transition.timer = 0;
            this.transition.loading = false;
            debug(MODULE, "Warp complete — starting fade-in");
        }

        this.setupSoundsForCurrentMap();
        if (this.sounds.music && this.musicEnabled) {
            this.sounds.music.play().catch((err) => {
                warn(MODULE, "Music autoplay blocked after warp:", err.message);
            });
        }
    }

    draw() {
        if (!this.map || !this.player) {
            return;
        }

        const ctx = this.ctx;

        // negro para las partes vacias fuera del mapa
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const camera = this.getCamera();

        // recorremos el viewport entero -- tiles fuera del mapa se quedan negros
        for (let sy = 0; sy < this.viewportHeight; sy++) {
            for (let sx = 0;  sx < this.viewportWidth; sx++) {
                const mx = camera.x + sx;
                const my = camera.y + sy;

                if (mx < 0 || my < 0 || mx >= this.map.width || my >= this.map.height) { continue; }

                const id       = this.map.map[my][mx];
                const src      = this.map.definitions.tiles[id];
                const tileImage = this.tileImages[src];

                if (tileImage) {
                    ctx.drawImage(tileImage, sx * this.tileSize, sy * this.tileSize, this.tileSize, this.tileSize);
                } else {
                    // magenta si falta la textura
                    ctx.fillStyle = "#ff00ff";
                    ctx.fillRect(sx * this.tileSize, sy * this.tileSize, this.tileSize, this.tileSize);
                }
            }
        }

        // dibuja entidades usando posicion visual (vx,vy) para la animacion de caminar
        if (this.entities && this.entities.length > 0) {
            for (const entity of this.entities) {
                const ex = entity.vx - camera.x;
                const ey = entity.vy - camera.y;
                if (ex < -1 || ey < -1 || ex >= this.viewportWidth + 1 || ey >= this.viewportHeight + 1) { continue; }
                const entitySprite = this.imageCache[entity.sprite];
                if (entitySprite) {
                    if (entity.facing === "left") {
                        ctx.save();
                        ctx.translate((ex + 1) * this.tileSize, ey * this.tileSize);
                        ctx.scale(-1, 1);
                        ctx.drawImage(entitySprite, 0, 0, this.tileSize, this.tileSize);
                        ctx.restore();
                    } else {
                        ctx.drawImage(entitySprite, ex * this.tileSize, ey * this.tileSize, this.tileSize, this.tileSize);
                    }
                } else {
                    ctx.fillStyle = "#ff0000";
                    ctx.fillRect(ex * this.tileSize, ey * this.tileSize, this.tileSize, this.tileSize);
                }

                // healthbar sobre el sprite
                const hpRatio = entity.maxHealth > 0 ? entity.health / entity.maxHealth : 0;
                const barW    = this.tileSize;
                const barH    = Math.max(1, Math.round(this.tileSize / 8));
                const barX    = Math.round(ex * this.tileSize);
                const barY    = Math.round(ey * this.tileSize) - barH - 1;
                ctx.fillStyle = "#330000";
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = hpRatio > 0.5 ? "#22cc44" : hpRatio > 0.25 ? "#ffaa00" : "#cc2200";
                ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);
            }
        }

        // Jugador siendo dibujado o draw
        const playerSprite = this.isDead
            ? this.playerImages[this.player.facing === "left" ? "leftDead" : "rightDead"]
            : this.playerImages[this.player.facing] || this.playerImages.right;

        let renderX = this.visualPosition?.x ?? this.player.x;
        let renderY = this.visualPosition?.y ?? this.player.y;

        if (this.animation) {
            const progress = Math.min(1, this.animation.progress);
            const ease = progress * (2 - progress); 
            renderX = this.animation.fromX + (this.animation.toX - this.animation.fromX) * ease;
            renderY = this.animation.fromY + (this.animation.toY - this.animation.fromY) * ease;
        }

        if (playerSprite) {
            ctx.drawImage(
                playerSprite,
                (renderX - camera.x) * this.tileSize,
                (renderY - camera.y) * this.tileSize,
                this.tileSize,
                this.tileSize
            );
        } else {
            warn(MODULE, `Player sprite missing for facing="${this.player.facing}", isDead=${this.isDead}`);
        }

        this.drawHealthUI();
        this.drawInventoryUI();
        this.drawLevelUI();

        if (this.isDead) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = "#ffffff";
            ctx.font = `${Math.max(12, this.tileSize * 1.25)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("moriste...", this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        if (this.transition) {
            const alpha = this.transition.phase === "fade-out"
                ? Math.min(1, this.transition.timer / this.transition.duration)
                : Math.max(0, 1 - this.transition.timer / this.transition.duration);
            ctx.fillStyle = `rgba(0,0,0,${alpha})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    drawHealthUI() {
        if (!this.hudElement) {
            return;
        }

        const totalHearts = Math.ceil(this.maxHealth / 2);
        const heartSize = Math.max(24, this.tileSize * 3);
        const heartHtml = [];

        for (let index = 0; index < totalHearts; index++) {
            const heartNumber = index + 1;
            const heartMaxHp = heartNumber * 2;
            const heartMinHp = heartMaxHp - 1;
            const isFull = this.health >= heartMaxHp;
            const isHalf = this.health === heartMinHp;
            const src = (isFull || isHalf) ? this.uiImages.heart?.src : this.uiImages.brokenHeart?.src;
            let transform = "";

            if (isHalf && !this.isDead) {
                const jitterX = (Math.random() * 4 - 2).toFixed(2);
                const jitterY = (Math.random() * 4 - 2).toFixed(2);
                transform = `transform: translate(${jitterX}px, ${jitterY}px);`;
            }

            heartHtml.push(`
                <img
                    class="hud-heart"
                    src="${src || ""}"
                    style="width: ${heartSize}px; height: ${heartSize}px; ${transform}"
                    aria-hidden="true"
                />
            `);
        }

        this.hudElement.innerHTML = heartHtml.join("");
    }

    drawInventoryUI() {
        if (!this.inventoryElement) {
            return;
        }

        
        const renderKey = `${JSON.stringify(this.inventory)}|${this.selectedInventoryIndex}`;
        if (this._inventoryRenderKey === renderKey) {
            return;
        }
        this._inventoryRenderKey = renderKey;

        debug(MODULE, `drawInventoryUI: re-rendering (${this.inventory.length} items, selected=${this.selectedInventoryIndex})`);

        if (!this.inventory.length) {
            this.inventoryElement.innerHTML = "";
            return;
        }

        const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

        const slotsHtml = this.inventory.map((itemId, index) => {
            const item    = this.itemDefinitions[itemId];
            const sel     = index === this.selectedInventoryIndex ? " selected" : "";
            const texture = item?.texture ?? "";
            const name    = esc(item?.display_name ?? itemId);
            const desc    = esc(item?.description ?? "");
            let stat = "";
            if (item?.use?.action === "heal") {
                stat = esc(`+${item.use.amount} HP`);
            } else if (item?.type === "equipment") {
                const atk = item.stats?.attack ?? 0;
                const def = item.stats?.defense ?? 0;
                if (atk > 0)      stat = esc(`ATK +${atk}`);
                else if (def > 0) stat = esc(`DEF +${def}`);
                else              stat = esc(item.slot ?? "equipo");
            } else if (item?.type === "consumable") {
                stat = "Consumible";
            }

            const icon = texture
                ? `<img src="${texture}" alt="${name}" class="inv-slot-icon">`
                : `<span class="inv-slot-fallback">${name.charAt(0)}</span>`;

            return `<div class="inv-slot${sel}" data-name="${name}" data-desc="${desc}" data-stat="${stat}" data-index="${index}">${icon}</div>`;
        }).join("");

        this.inventoryElement.innerHTML = slotsHtml;
    }

    showMessage(message = "") {
        if (!this.messageElement) {
            debug(MODULE, `showMessage: no messageElement, dropping message: "${message}"`);
            return;
        }

        debug(MODULE, `showMessage: "${message}"`);
        this.messageElement.textContent = message;
        this.messageElement.style.opacity = "1";
        clearTimeout(this.messageTimeout);
        this.messageTimeout = setTimeout(() => {
            debug(MODULE, "Message timeout — hiding message");
            this.messageElement.style.opacity = "0";
        }, 2000);
    }

    // --- equipamiento ---

    getAttackPower() {
        const w = this.equipment.weapon ? this.itemDefinitions[this.equipment.weapon] : null;
        return this.baseAttack + (w?.stats?.attack ?? 0);
    }

    getDefenseValue() {
        const a = this.equipment.armor   ? this.itemDefinitions[this.equipment.armor]   : null;
        const o = this.equipment.offhand ? this.itemDefinitions[this.equipment.offhand] : null;
        return this.baseDefense + (a?.stats?.defense ?? 0) + (o?.stats?.defense ?? 0);
    }

    equipItem(itemId) {
        const def = this.itemDefinitions[itemId];
        if (!def || def.type !== "equipment") return false;
        const slot = def.slot;
        if (!["weapon","armor","offhand"].includes(slot)) return false;
        const current = this.equipment[slot];
        if (current) this.inventory.push(current);
        const idx = this.inventory.indexOf(itemId);
        if (idx >= 0) this.inventory.splice(idx, 1);
        if (this.selectedInventoryIndex >= this.inventory.length) {
            this.selectedInventoryIndex = Math.max(0, this.inventory.length - 1);
        }
        this.equipment[slot] = itemId;
        info(MODULE, `Equipado: "${itemId}" en slot "${slot}"`);
        this.showMessage(`Equipaste: ${def.display_name}`);
        this.saveState();
        this.onInventoryChanged?.();
        this.onEquipmentChanged?.();
        return true;
    }

    unequipItem(slot) {
        const itemId = this.equipment[slot];
        if (!itemId) return false;
        this.equipment[slot] = null;
        this.inventory.push(itemId);
        // ajusta seleccion si estaba fuera de rango
        if (this.selectedInventoryIndex >= this.inventory.length) {
            this.selectedInventoryIndex = this.inventory.length - 1;
        }
        const def = this.itemDefinitions[itemId];
        info(MODULE, `Desequipado: "${itemId}" de slot "${slot}"`);
        this.showMessage(`Desequipaste: ${def?.display_name ?? itemId}`);
        this.saveState();
        // no llamar onInventoryChanged -- los llamadores ya actualizan la UI
        this.onEquipmentChanged?.();
        return true;
    }

    // --- niveles y exp ---

    gainExp(amount) {
        if (!amount || amount <= 0) return;
        this.exp += amount;
        let leveled = false;
        while (this.exp >= this.expToNextLevel) {
            this.exp -= this.expToNextLevel;
            this.level += 1;
            this.maxHealth += 2;
            this.health = Math.min(this.health + 2, this.maxHealth);
            this.expToNextLevel = Math.floor(80 * Math.pow(this.level, 1.2));
            leveled = true;
            info(MODULE, `Level up! nivel=${this.level}, expToNext=${this.expToNextLevel}`);
        }
        if (leveled) {
            this.showMessage(`¡Subiste al nivel ${this.level}! +2 HP máx.`);
        }
        this.saveState();
    }

    setEquipmentOpen(open) {
        this.equipmentOpen = open;
        if (open) {
            // guarda estado del inventario y pausa el juego
            this._invAbiertoAntesDeEquipo = this.inventoryOpen;
            this.inventoryOpen = true;
        } else {
            // restaura estado previo del inventario
            this.inventoryOpen = this._invAbiertoAntesDeEquipo ?? false;
        }
    }

    // --- UI de equipamiento ---

    drawEquipmentUI() {
        if (!this.equipmentElement || !this.equipmentOpen) return;
        const SLOTS = [
            { key: "weapon",  label: "Arma",    icon: "assets/UI/player_equipment_slots/weapon.webp"  },
            { key: "armor",   label: "Armadura", icon: "assets/UI/player_equipment_slots/armor.webp"   },
            { key: "offhand", label: "Off-hand", icon: "assets/UI/player_equipment_slots/offhand.webp" },
        ];
        const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
        const slotsHtml = SLOTS.map(({ key, label, icon }) => {
            const itemId = this.equipment[key];
            const item   = itemId ? this.itemDefinitions[itemId] : null;
            const imgSrc = item?.texture ?? icon;
            const name   = item ? esc(item.display_name) : label;
            const atk  = item?.stats?.attack  ?? 0;
            const def  = item?.stats?.defense ?? 0;
            const stat = atk > 0 ? `ATK +${atk}` : def > 0 ? `DEF +${def}` : "";
            return `<div class="equip-slot" data-slot="${esc(key)}">
                <img src="${esc(imgSrc)}" class="equip-slot-icon" alt="${name}" ${item ? "" : 'style="opacity:.3"'}>
                <span class="equip-slot-label">${esc(label)}</span>
                <span class="equip-slot-item-name">${item ? name : ""}</span>
                ${stat ? `<span class="equip-slot-stat">${esc(stat)}</span>` : ""}
            </div>`;
        }).join("");
        const statsHtml = `
            <div class="equip-stat-row"><span class="equip-stat-key">Nivel</span><span class="equip-stat-val">${this.level}</span></div>
            <div class="equip-stat-row"><span class="equip-stat-key">EXP</span><span class="equip-stat-val">${this.exp}/${this.expToNextLevel}</span></div>
            <div class="equip-stat-row"><span class="equip-stat-key">ATK</span><span class="equip-stat-val">${this.getAttackPower()}</span></div>
            <div class="equip-stat-row"><span class="equip-stat-key">DEF</span><span class="equip-stat-val">${this.getDefenseValue()}</span></div>
            <div class="equip-stat-row"><span class="equip-stat-key">HP</span><span class="equip-stat-val">${this.health}/${this.maxHealth}</span></div>
        `;
        const slotGrid  = this.equipmentElement.querySelector("#equipSlotGrid");
        const statsGrid = this.equipmentElement.querySelector("#equipStatsGrid");
        if (slotGrid)  slotGrid.innerHTML  = slotsHtml;
        if (statsGrid) statsGrid.innerHTML = statsHtml;
    }

    drawLevelUI() {
        if (!this._levelLabel) this._levelLabel = document.getElementById("levelLabel");
        if (!this._expFill)    this._expFill    = document.getElementById("expBarFill");
        if (this._levelLabel)  this._levelLabel.textContent = `Nv.${this.level}`;
        if (this._expFill)     this._expFill.style.width = `${Math.round(this.exp / this.expToNextLevel * 100)}%`;
    }

    // actualiza el label de nivel externo
    updateLevelDisplay() {
        if (this.levelElement) {
            this.levelElement.textContent = `Nv.${this.level}`;
        }
    }
}
