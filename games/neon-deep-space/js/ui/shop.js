// 商店逻辑
function renderShop() {
    shopGrid.innerHTML = '';
    UPGRADE_DEFS.forEach(def => {
        const level = playerUpgrades[def.id] || 0;
        const cost = def.baseCost * (level + 1);
        const isMaxed = level >= def.max;
        const canAfford = currentEnergy >= cost;

        const item = document.createElement('div');
        item.className = 'shop-item';
        item.innerHTML = `
            <div class="shop-item-top">
                <span class="shop-item-title">${def.name}</span>
                <span class="shop-item-level">LV.${level} / ${def.max}</span>
            </div>
            <div class="shop-item-desc">${def.desc}</div>
            <button class="shop-item-btn" ${isMaxed ? 'disabled' : ''}>
                ${isMaxed ? 'MAXED' : `购买 (${cost} 能量)`}
            </button>
        `;

        const btn = item.querySelector('button');
        if (!isMaxed) {
            if (!canAfford) btn.disabled = true;
            btn.onclick = () => buyUpgrade(def.id, cost);
        }

        shopGrid.appendChild(item);
    });
    shopEnergy.innerText = currentEnergy.toLocaleString();
    energyDisplay.innerText = currentEnergy.toLocaleString();
}

function buyUpgrade(id, cost) {
    if (currentEnergy >= cost) {
        currentEnergy -= cost;
        playerUpgrades[id]++;
        saveGameData();
        renderShop();
    }
}

function saveGameData() {
    localStorage.setItem('ftol:neondeepspace:energy', currentEnergy);
    localStorage.setItem('ftol:neondeepspace:upgrades', JSON.stringify(playerUpgrades));
    localStorage.setItem('ftol:neondeepspace:high_score', highScore);
}
