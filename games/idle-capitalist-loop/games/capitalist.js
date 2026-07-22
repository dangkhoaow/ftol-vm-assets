/* =========================================================================
   Cursor Arcade — Capitalist (AdVenture Capitalist clone)
   A full-featured idle tycoon with Earth / Moon / Mars, managers,
   cash and angel upgrades, milestone unlocks, offline earnings,
   Angel Investor prestige and 2% per-angel compounding boosts.

   Faithful to Hyper Hippo's AdVenture Capitalist (2014). Numbers,
   coefficients and cycle times taken from the official wiki.
   ========================================================================= */

(function () {
  'use strict';

  const R = (window.CursorArcade = window.CursorArcade || {});
  R.games = R.games || {};

  // ---------------- Number formatting ----------------
  // Short suffixes, AdCap-style (K, M, B, T, q, Q, s, S, o, n, d, U, D, Td, qd...).
  // We use two-letter mixed-case suffixes after Decillion for readability.
  const SUFFIXES = [
    '', 'K', 'M', 'B', 'T',
    'qa', 'Qa', 'sx', 'Sp', 'Oc', 'No', 'Dc',
    'UDc', 'DDc', 'TDc', 'qaDc', 'QaDc', 'sxDc', 'SpDc', 'OcDc', 'NoDc',
    'Vg', 'UVg', 'DVg', 'TVg', 'qaVg', 'QaVg', 'sxVg', 'SpVg', 'OcVg', 'NoVg',
    'Tg', 'UTg', 'DTg', 'TTg', 'qaTg', 'QaTg', 'sxTg', 'SpTg', 'OcTg', 'NoTg',
    'qg', 'Uqg', 'Dqg', 'Tqg', 'qaqg', 'Qaqg', 'sxqg', 'Spqg', 'Ocqg', 'Noqg',
    'Qg', 'UQg', 'DQg', 'TQg', 'qaQg', 'QaQg', 'sxQg', 'SpQg', 'OcQg', 'NoQg',
    'sg', 'Usg', 'Dsg', 'Tsg', 'qasg', 'Qasg', 'sxsg', 'Spsg', 'Ocsg', 'Nosg',
    'Sg', 'USg', 'DSg', 'TSg', 'qaSg', 'QaSg', 'sxSg', 'SpSg', 'OcSg', 'NoSg',
    'Og', 'UOg', 'DOg', 'TOg', 'qaOg', 'QaOg', 'sxOg', 'SpOg', 'OcOg', 'NoOg',
    'Ng', 'UNg', 'DNg', 'TNg', 'qaNg', 'QaNg', 'sxNg', 'SpNg', 'OcNg', 'NoNg',
    'Ce',
  ];

  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + fmt(-n);
    if (n < 1) return n === 0 ? '$0' : '$' + n.toFixed(2);
    if (n < 1000) return '$' + Math.floor(n).toLocaleString();
    const exp = Math.min(Math.floor(Math.log10(n) / 3), SUFFIXES.length - 1);
    const scaled = n / Math.pow(10, exp * 3);
    const suf = SUFFIXES[exp] || 'e' + exp * 3;
    return '$' + (scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(2)) + ' ' + suf;
  }

  function fmtInt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1000) return Math.floor(n).toLocaleString();
    const exp = Math.min(Math.floor(Math.log10(n) / 3), SUFFIXES.length - 1);
    const scaled = n / Math.pow(10, exp * 3);
    const suf = SUFFIXES[exp] || 'e' + exp * 3;
    return (scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(2)) + ' ' + suf;
  }

  function fmtTime(seconds) {
    if (seconds < 1) return seconds.toFixed(2) + 's';
    if (seconds < 60) return seconds.toFixed(1) + 's';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m < 60) return m + ':' + String(s).padStart(2, '0');
    const h = Math.floor(m / 60);
    return h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // ---------------- Game data ----------------
  // [id, name, initialCost, coefficient, baseTime (seconds), baseRevenue]
  const EARTH_BUSINESSES = [
    { id: 'lemon',    name: 'Lemonade Stand',      cost: 3.738,          coef: 1.07, time: 0.6,     rev: 1 },
    { id: 'news',     name: 'Newspaper Delivery',  cost: 60,             coef: 1.15, time: 3,       rev: 60 },
    { id: 'carwash',  name: 'Car Wash',            cost: 720,            coef: 1.14, time: 6,       rev: 540 },
    { id: 'pizza',    name: 'Pizza Delivery',      cost: 8640,           coef: 1.13, time: 12,      rev: 4320 },
    { id: 'donut',    name: 'Donut Shop',          cost: 103680,         coef: 1.12, time: 24,      rev: 51840 },
    { id: 'shrimp',   name: 'Shrimp Boat',         cost: 1244160,        coef: 1.11, time: 96,      rev: 622080 },
    { id: 'hockey',   name: 'Hockey Team',         cost: 14929920,       coef: 1.10, time: 384,     rev: 7464960 },
    { id: 'movie',    name: 'Movie Studio',        cost: 179159040,      coef: 1.09, time: 1536,    rev: 89579520 },
    { id: 'bank',     name: 'Bank',                cost: 2149908480,     coef: 1.08, time: 6144,    rev: 1074954240 },
    { id: 'oil',      name: 'Oil Company',         cost: 25798901760,    coef: 1.07, time: 36864,   rev: 29668737024 },
  ];

  const MOON_BUSINESSES = [
    { id: 'shoes',    name: 'Moon Shoes',          cost: 5,              coef: 1.05, time: 2,       rev: 1 },
    { id: 'gravity',  name: 'Gravity Booth',       cost: 105,            coef: 1.21, time: 7,       rev: 21 },
    { id: 'payday',   name: 'Payday Clone',        cost: 2929,           coef: 1.07, time: 28,      rev: 2001 },
    { id: 'express',  name: 'Moon Express',        cost: 42525,          coef: 1.19, time: 2,       rev: 376 },
    { id: 'oxy',      name: 'Oxygen Bar',          cost: 493025,         coef: 1.09, time: 45,      rev: 98820 },
    { id: 'helium',   name: 'Helium-3 Farm',       cost: 18753525,       coef: 1.15, time: 180,     rev: 1976400 },
    { id: 'cheese',   name: 'Cheese Mine',         cost: 393824025,      coef: 1.13, time: 600,     rev: 32940000 },
    { id: 'amuse',    name: 'Amusement Park',      cost: 8270304525,     coef: 1.17, time: 3000,    rev: 1152900000 },
    { id: 'were',     name: 'Werewolf Colony',     cost: 173676395025,   coef: 1.11, time: 14400,   rev: 11067840000 },
    { id: 'laser',    name: 'Giant Laser',         cost: 1e12,           coef: 1.50, time: 86400,   rev: 332035200000 },
  ];

  const MARS_BUSINESSES = [
    { id: 'dirt',     name: 'Red Dirt',            cost: 0.05,           coef: 1.01, time: 0.5,     rev: 0.011 },
    { id: 'marsies',  name: 'Marsies',             cost: 1,              coef: 1.03, time: 3,       rev: 1 },
    { id: 'men',      name: 'Men',                 cost: 1234,           coef: 1.05, time: 9,       rev: 4321 },
    { id: 'buggles',  name: 'Buggles',             cost: 23000000,       coef: 1.07, time: 32,      rev: 4007310 },
    { id: 'heck',     name: 'Heck Portal',         cost: 49000000000,    coef: 1.11, time: 64,      rev: 518783295 },
    { id: 'ambass',   name: 'Ambassadors',         cost: 7.7e13,         coef: 1.04, time: 4,       rev: 500634321 },
    { id: 'brain',    name: 'Brain-cation',        cost: 5e15,           coef: 1.07, time: 18,      rev: 7543177325 },
    { id: 'life',     name: 'LiFE Pod',            cost: 1e18,           coef: 1.09, time: 42,      rev: 69263532485 },
    { id: 'terror',   name: 'Terrorformer',        cost: 1.3e25,         coef: 1.25, time: 43200,   rev: 99e12 },
  ];

  // Manager costs: one per business. [businessId, name, cost]
  const EARTH_MANAGERS = [
    { bid: 'lemon',   name: 'Cabe Johnson',       cost: 1000 },
    { bid: 'news',    name: 'Perry Black',        cost: 15000 },
    { bid: 'carwash', name: 'W.W. Heisenbird',    cost: 100000 },
    { bid: 'pizza',   name: 'Mama Sean',          cost: 500000 },
    { bid: 'donut',   name: 'Jim Thorton',        cost: 1200000 },
    { bid: 'shrimp',  name: 'Forest Trump',       cost: 10e6 },
    { bid: 'hockey',  name: 'Dawn Cheri',         cost: 111111111 },
    { bid: 'movie',   name: 'Stefani Speilburger',cost: 555555555 },
    { bid: 'bank',    name: 'The Dark Lord',      cost: 10e9 },
    { bid: 'oil',     name: 'Derrick Plainview',  cost: 100e9 },
  ];

  const MOON_MANAGERS = [
    { bid: 'shoes',   name: 'Buzz Cobbler',       cost: 750 },
    { bid: 'gravity', name: 'Gracie Stone',       cost: 22500 },
    { bid: 'payday',  name: 'Dolly Pardon',       cost: 150000 },
    { bid: 'express', name: 'Jean Luc Turanga',   cost: 1850000 },
    { bid: 'oxy',     name: 'Strange Lange',      cost: 4300000 },
    { bid: 'helium',  name: 'Hurdy Gurdy',        cost: 145000000 },
    { bid: 'cheese',  name: 'Nick Gromcraft',     cost: 33.333e9 },
    { bid: 'amuse',   name: 'Willy Dizzy',        cost: 55e9 },
    { bid: 'were',    name: 'Mike Jameson Wolf',  cost: 1.53e12 },
    { bid: 'laser',   name: 'Dr. Bad News',       cost: 11.109e12 },
  ];

  const MARS_MANAGERS = [
    { bid: 'dirt',    name: 'Dirtwood Redsmith',  cost: 100 },
    { bid: 'marsies', name: 'General Candy Coates',cost: 5e6 },
    { bid: 'men',     name: 'Carlos "Roundhouse" Ray', cost: 10e6 },
    { bid: 'buggles', name: 'M. Wong',            cost: 1e9 },
    { bid: 'heck',    name: 'Hekhov A. Guy',      cost: 400e9 },
    { bid: 'ambass',  name: 'Sister Ack',         cost: 100e12 },
    { bid: 'brain',   name: 'Tommy K. Quaid',     cost: 15e15 },
    { bid: 'life',    name: 'Marty Landsajob',    cost: 10e18 },
    { bid: 'terror',  name: 'Lieutenant Wildwebs',cost: 200e24 },
  ];

  // Cash upgrades: a curated set of the most impactful / iconic from the wiki.
  // { id, bid (or 'all' / 'angel'), name, cost, mult (profit x), aeff (flat angel eff bonus) }
  const EARTH_UPGRADES = [
    // Tier 1 — each business x3
    { id: 'e1', bid: 'lemon',   name: 'Little Umbrellas',        cost: 250e3,  mult: 3 },
    { id: 'e2', bid: 'news',    name: 'Funny Pages',             cost: 500e3,  mult: 3 },
    { id: 'e3', bid: 'carwash', name: 'Drive Through Wash',      cost: 1e6,    mult: 3 },
    { id: 'e4', bid: 'pizza',   name: 'Robot Cars',              cost: 5e6,    mult: 3 },
    { id: 'e5', bid: 'donut',   name: 'Pre-packaged Pastries',   cost: 10e6,   mult: 3 },
    { id: 'e6', bid: 'shrimp',  name: 'Shrimp Satellite',        cost: 25e6,   mult: 3 },
    { id: 'e7', bid: 'hockey',  name: 'Team Jet',                cost: 500e6,  mult: 3 },
    { id: 'e8', bid: 'movie',   name: '3D Cameras',              cost: 10e9,   mult: 3 },
    { id: 'e9', bid: 'bank',    name: 'Gold Plated Vaults',      cost: 50e9,   mult: 3 },
    { id: 'e10', bid: 'oil',    name: 'Spill Proof Tankers',     cost: 250e9,  mult: 3 },
    { id: 'e11', bid: 'all',    name: 'Monopoly',                cost: 1e12,   mult: 3 },

    // Tier 2 (quadrillions) - each business x3
    { id: 'e12', bid: 'lemon',   name: 'Novelty Straws',         cost: 20e12,  mult: 3 },
    { id: 'e13', bid: 'news',    name: 'Sports Pages',           cost: 50e12,  mult: 3 },
    { id: 'e14', bid: 'carwash', name: 'Automatic Vacuums',      cost: 100e12, mult: 3 },
    { id: 'e15', bid: 'pizza',   name: 'Online Ordering',        cost: 500e12, mult: 3 },
    { id: 'e16', bid: 'donut',   name: 'Donut Holes',            cost: 1e15,   mult: 3 },
    { id: 'e17', bid: 'shrimp',  name: 'Shrimp Magnets',         cost: 2e15,   mult: 3 },
    { id: 'e18', bid: 'hockey',  name: 'Energy Drink Sponsors',  cost: 5e15,   mult: 3 },
    { id: 'e19', bid: 'movie',   name: 'Green Screens',          cost: 7e15,   mult: 3 },
    { id: 'e20', bid: 'bank',    name: 'Free Fancy Pens',        cost: 10e15,  mult: 3 },
    { id: 'e21', bid: 'oil',     name: 'Eco-safe Pipeline',      cost: 20e15,  mult: 3 },
    { id: 'e22', bid: 'all',     name: 'Monopsony',              cost: 50e15,  mult: 3 },
    { id: 'e23', bid: 'angel',   name: 'Holy Moola',             cost: 100e15, aeff: 0.01 },

    // Tier 3 (quintillions) - x3
    { id: 'e24', bid: 'lemon',   name: 'Imported Ice Cubes',     cost: 2e18,   mult: 3 },
    { id: 'e25', bid: 'news',    name: 'Business Pages',         cost: 5e18,   mult: 3 },
    { id: 'e26', bid: 'carwash', name: 'Microfiber Sponges',     cost: 7e18,   mult: 3 },
    { id: 'e27', bid: 'pizza',   name: 'Drone Delivery',         cost: 10e18,  mult: 3 },
    { id: 'e28', bid: 'donut',   name: 'Bacon Sprinkles',        cost: 20e18,  mult: 3 },
    { id: 'e29', bid: 'shrimp',  name: 'Carbon Nanotube Nets',   cost: 35e18,  mult: 3 },
    { id: 'e30', bid: 'hockey',  name: 'GPS Puck Tracker',       cost: 50e18,  mult: 3 },
    { id: 'e31', bid: 'movie',   name: 'Smell-O-Vision',         cost: 75e18,  mult: 3 },
    { id: 'e32', bid: 'bank',    name: 'Credit Card Implants',   cost: 100e18, mult: 3 },
    { id: 'e33', bid: 'oil',     name: 'Hyperloop Pumps',        cost: 200e18, mult: 3 },
    { id: 'e34', bid: 'all',     name: 'Illuminati',             cost: 500e18, mult: 3 },
    { id: 'e35', bid: 'angel',   name: 'Immaculate Consumption', cost: 1e21,   aeff: 0.01 },

    // Tier 4 (sextillions) - x3, then x7 super boosts
    { id: 'e36', bid: 'lemon',   name: 'Combustible Lemons',     cost: 25e21,  mult: 3 },
    { id: 'e37', bid: 'news',    name: 'Gossip Pages',           cost: 50e21,  mult: 3 },
    { id: 'e38', bid: 'carwash', name: 'Blue Sky Brand Wax',     cost: 100e21, mult: 3 },
    { id: 'e39', bid: 'pizza',   name: 'Caviar Stuffed Crust',   cost: 200e21, mult: 3 },
    { id: 'e40', bid: 'donut',   name: 'Free Coffee',            cost: 300e21, mult: 3 },
    { id: 'e41', bid: 'shrimp',  name: '3D Printed Shrimp',      cost: 400e21, mult: 3 },
    { id: 'e42', bid: 'hockey',  name: 'Lord Stanley\u2019s Cup',cost: 500e21, mult: 3 },
    { id: 'e43', bid: 'movie',   name: 'James Camera',           cost: 600e21, mult: 3 },
    { id: 'e44', bid: 'bank',    name: 'Dogecoin',               cost: 700e21, mult: 3 },
    { id: 'e45', bid: 'oil',     name: 'Biodiesel Derricks',     cost: 800e21, mult: 3 },
    { id: 'e46', bid: 'all',     name: 'Profit Prophet',         cost: 900e21, mult: 3 },
    { id: 'e47', bid: 'angel',   name: 'Eternal Revenue Service',cost: 10e24,  aeff: 0.02 },

    // Tier 5 - x7 all-business boosts
    { id: 'e48', bid: 'lemon',   name: 'Gold Plated Lemons',     cost: 1e27,   mult: 7 },
    { id: 'e49', bid: 'news',    name: 'Celebrity Delivery',     cost: 5e27,   mult: 7 },
    { id: 'e50', bid: 'carwash', name: 'Bikini Babes',           cost: 25e27,  mult: 7 },
    { id: 'e51', bid: 'pizza',   name: 'Dessert Pizzas',         cost: 100e27, mult: 7 },
    { id: 'e52', bid: 'donut',   name: 'Intravenous Java',       cost: 250e27, mult: 7 },
    { id: 'e53', bid: 'shrimp',  name: 'Alcubierre Drives',      cost: 500e27, mult: 7 },
    { id: 'e54', bid: 'hockey',  name: 'Holy Hockey Sticks',     cost: 1e30,   mult: 7 },
    { id: 'e55', bid: 'movie',   name: 'Rebooted Sequels',       cost: 5e30,   mult: 7 },
    { id: 'e56', bid: 'bank',    name: 'Giant Novelty Cheques',  cost: 25e30,  mult: 7 },
    { id: 'e57', bid: 'oil',     name: 'Solar Powered Derricks', cost: 50e30,  mult: 7 },

    // Late game — iconic multi-all boosts
    { id: 'e58', bid: 'all',     name: 'Super PAC Man',          cost: 1e42,   mult: 7 },
    { id: 'e59', bid: 'all',     name: 'Smiles Are Free',        cost: 1e51,   mult: 7 },
    { id: 'e60', bid: 'all',     name: 'Heavenly Tax Shelter',   cost: 1e54,   mult: 5 },
    { id: 'e61', bid: 'all',     name: 'Employ Humanity',        cost: 1e60,   mult: 7 },
    { id: 'e62', bid: 'all',     name: 'Moxie Injections',       cost: 1e63,   mult: 9 },
    { id: 'e63', bid: 'all',     name: 'Immortality Research',   cost: 1e69,   mult: 11 },
    { id: 'e64', bid: 'all',     name: 'Your Body Is Ready',     cost: 1e72,   mult: 13 },
    { id: 'e65', bid: 'all',     name: 'A Towel',                cost: 1e75,   mult: 15 },
    { id: 'e66', bid: 'all',     name: 'Pi Charts',              cost: 3e84,   mult: 3.1415926 },
    { id: 'e67', bid: 'all',     name: "'e' Business",           cost: 4.5e143, mult: 2.71828 },
  ];

  const MOON_UPGRADES = [
    { id: 'm1', bid: 'shoes',    name: 'Cushioned Soles',        cost: 10e3,   mult: 3 },
    { id: 'm2', bid: 'gravity',  name: 'Newton\u2019s Remorse',  cost: 50e3,   mult: 3 },
    { id: 'm3', bid: 'payday',   name: 'Overtime Clones',        cost: 250e3,  mult: 3 },
    { id: 'm4', bid: 'express',  name: 'Priority Shipping',      cost: 1e6,    mult: 3 },
    { id: 'm5', bid: 'oxy',      name: 'Oxygen Taps',            cost: 5e6,    mult: 3 },
    { id: 'm6', bid: 'helium',   name: 'Quantum Farmers',        cost: 50e6,   mult: 3 },
    { id: 'm7', bid: 'cheese',   name: 'Lactose Lasers',         cost: 500e6,  mult: 3 },
    { id: 'm8', bid: 'amuse',    name: 'Bigger Coasters',        cost: 5e9,    mult: 3 },
    { id: 'm9', bid: 'were',     name: 'Silver Collars',         cost: 50e9,   mult: 3 },
    { id: 'm10', bid: 'laser',   name: 'Focused Beams',          cost: 500e9,  mult: 3 },
    { id: 'm11', bid: 'all',     name: 'Moon Monopoly',          cost: 10e12,  mult: 3 },
    { id: 'm12', bid: 'all',     name: 'Full Moon',              cost: 1e18,   mult: 5 },
    { id: 'm13', bid: 'all',     name: 'Dark Side Deals',        cost: 1e24,   mult: 7 },
    { id: 'm14', bid: 'angel',   name: 'Moon Angels',            cost: 1e21,   aeff: 0.02 },
  ];

  const MARS_UPGRADES = [
    { id: 'r1', bid: 'dirt',     name: 'Red Bricks',             cost: 10,     mult: 3 },
    { id: 'r2', bid: 'marsies',  name: 'Martian Jingle',         cost: 500,    mult: 3 },
    { id: 'r3', bid: 'men',      name: 'Strong Helmets',         cost: 50e3,   mult: 3 },
    { id: 'r4', bid: 'buggles',  name: 'All-terrain Wheels',     cost: 500e6,  mult: 3 },
    { id: 'r5', bid: 'heck',     name: 'Demonic Lubricant',      cost: 500e9,  mult: 3 },
    { id: 'r6', bid: 'ambass',   name: 'Diplomatic Immunity',    cost: 5e15,   mult: 3 },
    { id: 'r7', bid: 'brain',    name: 'Mind Expanders',         cost: 50e15,  mult: 3 },
    { id: 'r8', bid: 'life',     name: 'Life-Giving Pods',       cost: 5e18,   mult: 3 },
    { id: 'r9', bid: 'terror',   name: 'Weather Control',        cost: 50e24,  mult: 3 },
    { id: 'r10', bid: 'all',     name: 'Mars Monopoly',          cost: 1e18,   mult: 3 },
    { id: 'r11', bid: 'all',     name: 'Red Menace',             cost: 1e27,   mult: 9 },
    { id: 'r12', bid: 'angel',   name: 'Mars Angels',            cost: 1e30,   aeff: 0.03 },
  ];

  // Angel upgrades: iconic curated set.
  // { id, bid (or 'all' / 'angel'), name, cost (in angels), mult, aeff }
  const EARTH_ANGEL_UPGRADES = [
    { id: 'a1',  bid: 'all',     name: 'Angel Sacrifice',        cost: 10e3,    mult: 3 },
    { id: 'a2',  bid: 'angel',   name: 'Angelic Mutiny',         cost: 100e3,   aeff: 0.02 },
    { id: 'a3',  bid: 'angel',   name: 'Angelic Rebellion',      cost: 100e6,   aeff: 0.02 },
    { id: 'a4',  bid: 'all',     name: 'Angelic Selection',      cost: 1e9,     mult: 5 },
    { id: 'a5',  bid: 'all',     name: 'Divine Intervention',    cost: 100e9,   mult: 9 },
    { id: 'a6',  bid: 'all',     name: 'Rapture Contingent',     cost: 1e12,    mult: 11 },
    { id: 'a7',  bid: 'all',     name: 'Buy Earth',              cost: 1e21,    mult: 15 },
    { id: 'a8',  bid: 'angel',   name: 'Paradise Lost And Found',cost: 1e33,    aeff: 0.10 },
    { id: 'a9',  bid: 'all',     name: 'Black Friday the 13th',  cost: 10e33,   mult: 15 },
    { id: 'a10', bid: 'all',     name: 'In Brightest Day...',    cost: 10e39,   mult: 5 },
    { id: 'a11', bid: 'all',     name: 'In Darkest Night...',    cost: 1e42,    mult: 5 },
    { id: 'a12', bid: 'angel',   name: 'Hark!',                  cost: 500e51,  aeff: 0.10 },
    { id: 'a13', bid: 'all',     name: 'Hallelujah!',            cost: 100e63,  mult: 7 },
    { id: 'a14', bid: 'all',     name: 'Profit-dence',           cost: 777e63,  mult: 7.777777 },
    { id: 'a15', bid: 'all',     name: 'Proverbs',               cost: 3e81,    mult: 13.11 },
    { id: 'a16', bid: 'all',     name: 'Forever And Ever',       cost: 2e135,   mult: 19 },
  ];

  const MOON_ANGEL_UPGRADES = [
    { id: 'ma1', bid: 'all',     name: 'Lunar Bargain',          cost: 50e3,    mult: 3 },
    { id: 'ma2', bid: 'all',     name: 'Lunar Eclipse',          cost: 50e9,    mult: 5 },
    { id: 'ma3', bid: 'all',     name: 'Super Moon',             cost: 50e18,   mult: 9 },
    { id: 'ma4', bid: 'angel',   name: 'Silver Halos',           cost: 1e15,    aeff: 0.05 },
  ];

  const MARS_ANGEL_UPGRADES = [
    { id: 'ra1', bid: 'all',     name: 'Martian Offering',       cost: 1e6,     mult: 3 },
    { id: 'ra2', bid: 'all',     name: 'Red Rapture',            cost: 1e15,    mult: 11 },
    { id: 'ra3', bid: 'angel',   name: 'Red Halos',              cost: 1e12,    aeff: 0.05 },
  ];

  // Per-planet unlock table: at these milestone counts, grant a per-business multiplier.
  // These approximate the "unlocks" mechanic (profit x at X bought). Per the wiki,
  // each business halves its cycle time at 25/50/100/200/300/400 and every business
  // gets a bonus when all reach the threshold. We also apply a revenue x3 unlock at
  // 25, 50 and 100 and x2 at 200, 300 and 400 to approximate revenue milestones.
  const MILESTONES = [25, 50, 100, 200, 300, 400];

  const PLANETS = {
    earth: {
      id: 'earth',
      name: 'Earth',
      startMoney: 4,
      businesses: EARTH_BUSINESSES,
      managers: EARTH_MANAGERS,
      upgrades: EARTH_UPGRADES,
      angelUpgrades: EARTH_ANGEL_UPGRADES,
    },
    moon: {
      id: 'moon',
      name: 'Moon',
      unlockCost: 1e42,
      startMoney: 5,
      businesses: MOON_BUSINESSES,
      managers: MOON_MANAGERS,
      upgrades: MOON_UPGRADES,
      angelUpgrades: MOON_ANGEL_UPGRADES,
    },
    mars: {
      id: 'mars',
      name: 'Mars',
      unlockCost: 1e72,
      startMoney: 0.05,
      businesses: MARS_BUSINESSES,
      managers: MARS_MANAGERS,
      upgrades: MARS_UPGRADES,
      angelUpgrades: MARS_ANGEL_UPGRADES,
    },
  };
  const PLANET_ORDER = ['earth', 'moon', 'mars'];

  // ---------------- Save state ----------------
  function defaultPlanetState(pid) {
    const planet = PLANETS[pid];
    return {
      unlocked: pid === 'earth',
      money: planet.startMoney,
      lifetimeEarnings: 0,
      businesses: planet.businesses.map((b) => ({
        owned: 0,
        progress: 0,
        manager: false,
      })),
      cashUpgrades: {},
      angelUpgrades: {},
    };
  }

  function defaultSave() {
    return {
      v: 1,
      startedAt: Date.now(),
      lastTick: Date.now(),
      angels: 0,
      angelsSacrificed: 0,
      angelEffBonus: 0, // from cash/angel 'angel' upgrades, flat percent (0.02 = +2%)
      planets: {
        earth: defaultPlanetState('earth'),
        moon: defaultPlanetState('moon'),
        mars: defaultPlanetState('mars'),
      },
      ui: {
        planet: 'earth',
        tab: 'businesses', // businesses | cash | angel
      },
    };
  }

  // Angels per reset across all planets:
  // total = 150 * sqrt(totalLifetime / 1e15) - angelsSacrificed (- angels currently held? No,
  // per wiki it's angels sacrificed forever + currently held, so:
  //   newTotal = 150 * sqrt(total / 1e15)
  //   delta = newTotal - (angels + angelsSacrificed)
  function angelsForReset(save) {
    const total = sumLifetime(save);
    const newTotal = Math.floor(150 * Math.sqrt(total / 1e15));
    return Math.max(0, newTotal - save.angels - save.angelsSacrificed);
  }

  function sumLifetime(save) {
    let t = 0;
    for (const pid of PLANET_ORDER) t += save.planets[pid].lifetimeEarnings;
    return t;
  }

  // ---------------- Multiplier math ----------------
  // Angel effectiveness per angel: 0.02 + angelEffBonus (e.g. 0.03 after +1%)
  function angelBoost(save) {
    const effPer = 0.02 + save.angelEffBonus;
    return 1 + save.angels * effPer;
  }

  function businessMilestoneBonus(owned) {
    // Applies revenue multiplier for each milestone reached.
    // 25/50/100 -> x3, 200/300/400 -> x2.
    let m = 1;
    if (owned >= 25) m *= 3;
    if (owned >= 50) m *= 3;
    if (owned >= 100) m *= 3;
    if (owned >= 200) m *= 2;
    if (owned >= 300) m *= 2;
    if (owned >= 400) m *= 2;
    return m;
  }

  function businessTimeFactor(owned, allMin) {
    // Halvings: 25/50/100/200/300/400 halves once each. Plus universal halvings when
    // min across all businesses reaches these. Total up to 12 halvings -> 1/4096.
    let h = 0;
    for (const m of MILESTONES) if (owned >= m) h++;
    for (const m of MILESTONES) if (allMin >= m) h++;
    return Math.pow(0.5, h);
  }

  function upgradeListFor(planet, save) {
    return planet.upgrades;
  }

  function cashMultiplierFor(save, planetId, bid) {
    const planet = PLANETS[planetId];
    const ps = save.planets[planetId];
    let m = 1;
    for (const u of planet.upgrades) {
      if (!ps.cashUpgrades[u.id]) continue;
      if (u.bid === bid || u.bid === 'all') m *= u.mult || 1;
    }
    for (const u of planet.angelUpgrades) {
      if (!ps.angelUpgrades[u.id]) continue;
      if (u.bid === bid || u.bid === 'all') m *= u.mult || 1;
    }
    return m;
  }

  function businessRevenue(save, planetId, idx) {
    const planet = PLANETS[planetId];
    const def = planet.businesses[idx];
    const ps = save.planets[planetId];
    const st = ps.businesses[idx];
    if (st.owned <= 0) return 0;
    const milestone = businessMilestoneBonus(st.owned);
    const upgrade = cashMultiplierFor(save, planetId, def.id);
    const angels = angelBoost(save);
    return def.rev * st.owned * milestone * upgrade * angels;
  }

  function businessCycleTime(save, planetId, idx) {
    const planet = PLANETS[planetId];
    const def = planet.businesses[idx];
    const ps = save.planets[planetId];
    const st = ps.businesses[idx];
    const allMin = Math.min(...ps.businesses.map((b) => b.owned));
    return def.time * businessTimeFactor(st.owned, allMin);
  }

  function businessCost(planetDef, st, qty) {
    // geometric series: cost*coef^owned * (coef^qty - 1)/(coef - 1)
    const c = planetDef.coef;
    const first = planetDef.cost * Math.pow(c, st.owned);
    return first * (Math.pow(c, qty) - 1) / (c - 1);
  }

  function buyableQuantity(money, planetDef, st, target) {
    // target: 1 | 10 | 100 | 'max'
    if (target === 1 || target === 10 || target === 100) {
      const cost = businessCost(planetDef, st, target);
      return cost <= money ? target : 0;
    }
    // max: binary search up to a sane cap
    const c = planetDef.coef;
    const first = planetDef.cost * Math.pow(c, st.owned);
    // solve for q: first * (c^q - 1) / (c - 1) <= money
    //   c^q <= money * (c - 1) / first + 1
    const lhs = money * (c - 1) / first + 1;
    if (lhs <= 1) return 0;
    const q = Math.floor(Math.log(lhs) / Math.log(c));
    return Math.max(0, q);
  }

  function totalCpsForPlanet(save, planetId) {
    const planet = PLANETS[planetId];
    const ps = save.planets[planetId];
    let cps = 0;
    for (let i = 0; i < planet.businesses.length; i++) {
      const st = ps.businesses[i];
      if (!st.manager || st.owned <= 0) continue;
      const rev = businessRevenue(save, planetId, i);
      const t = businessCycleTime(save, planetId, i);
      if (t > 0) cps += rev / t;
    }
    return cps;
  }

  // ---------------- Game class ----------------
  R.games.capitalist = {
    create(c) {
      return new CapitalistGame(c);
    },
  };

  class CapitalistGame {
    constructor({ host, api, meta }) {
      this.api = api;
      this.meta = meta;
      this.host = host;

      this.save = loadSave(api) || defaultSave();
      normalizeSave(this.save);

      // Apply offline earnings (up to 12 hours, 25% efficiency idle).
      this.applyOffline();

      this.root = document.createElement('div');
      this.root.className = 'cap-root';
      host.appendChild(this.root);

      api.setTopbarControls({});

      this.buildUI();
      this.render();

      this.last = performance.now();
      this.acc = 0;
      this.paused = false;
      this._tick = this._tick.bind(this);
      this.raf = requestAnimationFrame(this._tick);

      // Autosave every 10 seconds.
      this.saveTimer = setInterval(() => this.persist(), 10000);
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      clearInterval(this.saveTimer);
      this.persist();
      this.host.innerHTML = '';
    }

    togglePause() {
      this.paused = !this.paused;
      this.api.toast(this.paused ? 'Capitalist paused.' : 'Resumed.');
    }

    restart() {
      const ok = confirm(
        'Wipe your ENTIRE Capitalist save?\n\n' +
        'Money, businesses, managers, upgrades AND angels will be reset.',
      );
      if (!ok) return;
      this.save = defaultSave();
      this.persist();
      this.render();
    }

    onKey(e) {
      if (e.key === ' ') {
        e.preventDefault();
        this.togglePause();
      } else if (e.key === '1') this.setPlanet('earth');
      else if (e.key === '2') this.setPlanet('moon');
      else if (e.key === '3') this.setPlanet('mars');
      else if (e.key === 'b') this.setTab('businesses');
      else if (e.key === 'u') this.setTab('cash');
      else if (e.key === 'a') this.setTab('angel');
    }

    buildSettings(body) {
      const row = document.createElement('div');
      row.className = 'toggle';
      row.style.gap = '8px';
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn ghost';
      resetBtn.textContent = 'Wipe save';
      resetBtn.addEventListener('click', () => this.restart());
      row.appendChild(resetBtn);
      body.appendChild(row);
    }

    // ---- timing ----
    _tick(now) {
      this.raf = requestAnimationFrame(this._tick);
      const dt = Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.step(dt);
      this.acc += dt;
      if (this.acc >= 0.1) {
        this.acc = 0;
        this.renderSoft();
      }
    }

    step(dt) {
      for (const pid of PLANET_ORDER) {
        const ps = this.save.planets[pid];
        if (!ps.unlocked) continue;
        const planet = PLANETS[pid];
        for (let i = 0; i < planet.businesses.length; i++) {
          const st = ps.businesses[i];
          if (st.owned <= 0) continue;
          const t = businessCycleTime(this.save, pid, i);
          if (st.progress >= t) {
            // awaiting collection (if no manager) — frozen at 1.0 until click
            continue;
          }
          st.progress += dt;
          if (st.progress >= t) {
            if (st.manager) {
              // auto-collect: possibly multiple cycles in a tick
              const over = st.progress - t;
              const loops = 1 + Math.floor(over / t);
              const rev = businessRevenue(this.save, pid, i);
              this.collect(pid, rev * loops);
              st.progress = over % t;
            }
          }
        }
      }
    }

    applyOffline() {
      const now = Date.now();
      const diff = Math.max(0, (now - (this.save.lastTick || now)) / 1000);
      this.save.lastTick = now;
      // Cap at 12 hours at 25% efficiency — softer than AdCap's 2h cap but
      // friendlier for an in-IDE idler.
      const cap = 12 * 3600;
      const elapsed = Math.min(diff, cap);
      if (elapsed <= 5) return; // don't bother
      const mul = 0.25;
      let gained = 0;
      for (const pid of PLANET_ORDER) {
        const ps = this.save.planets[pid];
        if (!ps.unlocked) continue;
        const cps = totalCpsForPlanet(this.save, pid);
        const add = cps * elapsed * mul;
        if (add > 0) {
          ps.money += add;
          ps.lifetimeEarnings += add;
          gained += add;
        }
      }
      if (gained > 0) {
        setTimeout(() => {
          this.api.toast(
            'Welcome back! You earned ' + fmt(gained) + ' while away (' + fmtTime(elapsed) + ' at 25%).',
          );
        }, 400);
      }
    }

    collect(planetId, amount) {
      const ps = this.save.planets[planetId];
      ps.money += amount;
      ps.lifetimeEarnings += amount;
    }

    clickBusiness(idx) {
      const pid = this.save.ui.planet;
      const ps = this.save.planets[pid];
      const st = ps.businesses[idx];
      if (st.owned <= 0) return;
      if (st.manager) return;
      const t = businessCycleTime(this.save, pid, idx);
      if (st.progress >= t) {
        const rev = businessRevenue(this.save, pid, idx);
        this.collect(pid, rev);
        st.progress = 0;
      }
    }

    buyBusiness(idx, qty) {
      const pid = this.save.ui.planet;
      const planet = PLANETS[pid];
      const ps = this.save.planets[pid];
      const def = planet.businesses[idx];
      const st = ps.businesses[idx];
      if (qty === 'max') qty = buyableQuantity(ps.money, def, st, 'max');
      if (qty <= 0) return;
      const cost = businessCost(def, st, qty);
      if (cost > ps.money) {
        // scale down to what we can actually afford
        qty = buyableQuantity(ps.money, def, st, 'max');
        if (qty <= 0) return;
      }
      const finalCost = businessCost(def, st, qty);
      ps.money -= finalCost;
      st.owned += qty;
    }

    buyManager(idx) {
      const pid = this.save.ui.planet;
      const planet = PLANETS[pid];
      const ps = this.save.planets[pid];
      const st = ps.businesses[idx];
      if (st.manager) return;
      const mgr = planet.managers[idx];
      if (ps.money < mgr.cost) return;
      ps.money -= mgr.cost;
      st.manager = true;
    }

    buyCashUpgrade(id) {
      const pid = this.save.ui.planet;
      const planet = PLANETS[pid];
      const ps = this.save.planets[pid];
      const u = planet.upgrades.find((x) => x.id === id);
      if (!u || ps.cashUpgrades[id]) return;
      if (ps.money < u.cost) return;
      ps.money -= u.cost;
      ps.cashUpgrades[id] = true;
      if (u.aeff) this.save.angelEffBonus += u.aeff;
    }

    buyAngelUpgrade(id) {
      const pid = this.save.ui.planet;
      const planet = PLANETS[pid];
      const ps = this.save.planets[pid];
      const u = planet.angelUpgrades.find((x) => x.id === id);
      if (!u || ps.angelUpgrades[id]) return;
      if (this.save.angels < u.cost) return;
      if (u.cost / this.save.angels > 0.01) {
        const ok = confirm(
          'This spends ' + fmtInt(u.cost) + ' angels (' +
          ((u.cost / this.save.angels) * 100).toFixed(1) + '% of your total).\nProceed?',
        );
        if (!ok) return;
      }
      this.save.angels -= u.cost;
      this.save.angelsSacrificed += u.cost;
      ps.angelUpgrades[id] = true;
      if (u.aeff) this.save.angelEffBonus += u.aeff;
    }

    unlockPlanet(pid) {
      const planet = PLANETS[pid];
      if (!planet.unlockCost) return;
      const earth = this.save.planets.earth;
      if (earth.money < planet.unlockCost) return;
      earth.money -= planet.unlockCost;
      this.save.planets[pid].unlocked = true;
      this.save.ui.planet = pid;
      this.api.toast('Unlocked ' + planet.name + '!');
    }

    doReset() {
      const newAngels = angelsForReset(this.save);
      if (newAngels <= 0) {
        alert('You have no new angels to claim yet.\nEarn more money across all planets first.');
        return;
      }
      const ok = confirm(
        'RESET FOR ' + fmtInt(newAngels) + ' ANGEL INVESTORS?\n\n' +
        'You will keep your angels and their +' +
        ((0.02 + this.save.angelEffBonus) * 100).toFixed(1) +
        '% per-angel boost. You will lose all money, businesses, managers,\n' +
        'cash upgrades and angel upgrades.',
      );
      if (!ok) return;

      this.save.angels += newAngels;
      // Reset planets
      for (const pid of PLANET_ORDER) {
        const wasUnlocked = this.save.planets[pid].unlocked;
        this.save.planets[pid] = defaultPlanetState(pid);
        this.save.planets[pid].unlocked = wasUnlocked;
      }
      // The angel effectiveness bonus (+x%) is RESET on reset because it was
      // granted by cash upgrades. Angel-upgrade-based bonuses are also gone since
      // angel upgrades are lost on reset, per the wiki.
      this.save.angelEffBonus = 0;
      this.save.lastTick = Date.now();
      this.save.ui.planet = 'earth';
      this.persist();
      this.api.toast('You claimed ' + fmtInt(newAngels) + ' new angel investors.');
    }

    setPlanet(pid) {
      const ps = this.save.planets[pid];
      if (!ps || !ps.unlocked) return;
      this.save.ui.planet = pid;
      this.render();
    }

    setTab(t) {
      this.save.ui.tab = t;
      this.render();
    }

    setBuyQty(qty) {
      this.buyQty = qty;
      this.render();
    }

    persist() {
      this.save.lastTick = Date.now();
      this.api.saveSettings('capitalist', this.save);
    }

    // ---- rendering ----
    buildUI() {
      this.root.innerHTML = '';

      // Top header: money / cps / angels / planet tabs / reset
      const header = document.createElement('div');
      header.className = 'cap-header';
      this.root.appendChild(header);

      this.elMoney = document.createElement('div');
      this.elMoney.className = 'cap-money';
      header.appendChild(this.elMoney);

      this.elCps = document.createElement('div');
      this.elCps.className = 'cap-cps';
      header.appendChild(this.elCps);

      this.elAngels = document.createElement('div');
      this.elAngels.className = 'cap-angels';
      header.appendChild(this.elAngels);

      // Planet tabs
      const planetTabs = document.createElement('div');
      planetTabs.className = 'cap-planet-tabs';
      header.appendChild(planetTabs);
      this.planetTabsEl = planetTabs;

      // Reset button
      this.elReset = document.createElement('button');
      this.elReset.className = 'btn ghost cap-reset';
      this.elReset.addEventListener('click', () => this.doReset());
      header.appendChild(this.elReset);

      // Main body: left = businesses, right = side panel (upgrades tabs)
      const body = document.createElement('div');
      body.className = 'cap-body';
      this.root.appendChild(body);

      this.elBizList = document.createElement('div');
      this.elBizList.className = 'cap-biz-list';
      body.appendChild(this.elBizList);

      const side = document.createElement('div');
      side.className = 'cap-side';
      body.appendChild(side);

      const sideTabs = document.createElement('div');
      sideTabs.className = 'cap-side-tabs';
      side.appendChild(sideTabs);
      this.sideTabsEl = sideTabs;

      this.elSideBody = document.createElement('div');
      this.elSideBody.className = 'cap-side-body';
      side.appendChild(this.elSideBody);

      // Buy qty control
      this.buyQty = 1;
    }

    render() {
      this.buildPlanetTabs();
      this.buildSideTabs();
      this.renderBizList();
      this.renderSide();
      this.renderSoft();
    }

    buildPlanetTabs() {
      const el = this.planetTabsEl;
      el.innerHTML = '';
      for (const pid of PLANET_ORDER) {
        const planet = PLANETS[pid];
        const ps = this.save.planets[pid];
        const btn = document.createElement('button');
        btn.className = 'cap-planet-tab' + (this.save.ui.planet === pid ? ' active' : '');
        if (!ps.unlocked) btn.classList.add('locked');
        btn.textContent = planet.name;
        if (!ps.unlocked) btn.textContent += ' (' + fmt(planet.unlockCost) + ')';
        btn.addEventListener('click', () => {
          if (ps.unlocked) this.setPlanet(pid);
          else this.unlockPlanet(pid);
        });
        el.appendChild(btn);
      }

      const buySel = document.createElement('div');
      buySel.className = 'cap-buy-sel';
      for (const q of [1, 10, 100, 'max']) {
        const b = document.createElement('button');
        b.textContent = 'x' + q;
        b.className = 'cap-buy-btn' + (this.buyQty === q ? ' active' : '');
        b.addEventListener('click', () => this.setBuyQty(q));
        buySel.appendChild(b);
      }
      el.appendChild(buySel);
    }

    buildSideTabs() {
      const el = this.sideTabsEl;
      el.innerHTML = '';
      for (const [id, label] of [
        ['cash', 'Cash Upgrades'],
        ['angel', 'Angel Upgrades'],
        ['managers', 'Managers'],
        ['stats', 'Stats'],
      ]) {
        const b = document.createElement('button');
        b.textContent = label;
        b.className = 'cap-side-tab' + (this.save.ui.tab === id ? ' active' : '');
        b.addEventListener('click', () => this.setTab(id));
        el.appendChild(b);
      }
    }

    renderBizList() {
      const pid = this.save.ui.planet;
      const planet = PLANETS[pid];
      const ps = this.save.planets[pid];
      this.elBizList.innerHTML = '';

      for (let i = 0; i < planet.businesses.length; i++) {
        const def = planet.businesses[i];
        const st = ps.businesses[i];
        const unlocked = i === 0 || ps.businesses[i - 1].owned > 0;

        const row = document.createElement('div');
        row.className = 'cap-biz' + (unlocked ? '' : ' locked') + (st.owned > 0 ? ' owned' : '');
        row.dataset.idx = i;

        if (!unlocked) {
          row.innerHTML =
            '<div class="cap-biz-lock">Locked — buy ' +
            planet.businesses[i - 1].name +
            ' first.</div>';
          this.elBizList.appendChild(row);
          continue;
        }

        // glyph
        const glyph = document.createElement('button');
        glyph.className = 'cap-biz-glyph';
        glyph.title = st.manager
          ? 'Auto-running (managed)'
          : st.owned > 0
          ? 'Click to run a cycle'
          : 'Buy your first ' + def.name;
        glyph.textContent = def.name.charAt(0);
        glyph.addEventListener('click', () => this.clickBusiness(i));
        row.appendChild(glyph);

        // info column
        const info = document.createElement('div');
        info.className = 'cap-biz-info';
        const line1 = document.createElement('div');
        line1.className = 'cap-biz-name';
        line1.innerHTML =
          '<strong>' + escapeHtml(def.name) + '</strong>' +
          ' <span class="cap-biz-count">×' + st.owned.toLocaleString() + '</span>';
        info.appendChild(line1);

        const line2 = document.createElement('div');
        line2.className = 'cap-biz-meta';
        const rev = businessRevenue(this.save, pid, i);
        const time = businessCycleTime(this.save, pid, i);
        line2.innerHTML =
          '<span>' + fmt(rev) + '/cycle</span>' +
          ' <span class="dot">·</span> ' +
          '<span>' + fmtTime(time) + '</span>' +
          (st.manager ? ' <span class="cap-biz-mgr">auto</span>' : '');
        info.appendChild(line2);

        const barWrap = document.createElement('div');
        barWrap.className = 'cap-biz-bar';
        const bar = document.createElement('div');
        bar.className = 'cap-biz-bar-fill';
        bar.dataset.role = 'bar';
        barWrap.appendChild(bar);
        info.appendChild(barWrap);
        row.appendChild(info);

        // Milestone dots
        const dots = document.createElement('div');
        dots.className = 'cap-biz-milestones';
        for (const m of MILESTONES) {
          const d = document.createElement('span');
          d.className = 'cap-milestone' + (st.owned >= m ? ' on' : '');
          d.title = 'Milestone at ' + m;
          d.textContent = m;
          dots.appendChild(d);
        }
        row.appendChild(dots);

        // Buy column
        const buy = document.createElement('div');
        buy.className = 'cap-biz-buy';

        const qty = this.buyQty;
        const cost =
          qty === 'max'
            ? (function () {
                const q = buyableQuantity(ps.money, def, st, 'max');
                return q > 0 ? businessCost(def, st, q) : businessCost(def, st, 1);
              })()
            : businessCost(def, st, qty);
        const canBuy = ps.money >= cost && !(qty === 'max' && cost === businessCost(def, st, 1) && ps.money < cost);
        const actualQty =
          qty === 'max' ? buyableQuantity(ps.money, def, st, 'max') || 1 : qty;

        const buyBtn = document.createElement('button');
        buyBtn.className = 'cap-biz-buybtn' + (canBuy ? '' : ' off');
        buyBtn.innerHTML =
          '<div class="cap-biz-buyqty">Buy x' + actualQty.toLocaleString() + '</div>' +
          '<div class="cap-biz-buycost">' + fmt(cost) + '</div>';
        buyBtn.addEventListener('click', () => this.buyBusiness(i, qty));
        buy.appendChild(buyBtn);

        row.appendChild(buy);
        this.elBizList.appendChild(row);
      }
    }

    renderSide() {
      const tab = this.save.ui.tab;
      const body = this.elSideBody;
      body.innerHTML = '';
      if (tab === 'cash') this.renderCashUpgrades(body);
      else if (tab === 'angel') this.renderAngelUpgrades(body);
      else if (tab === 'managers') this.renderManagers(body);
      else this.renderStats(body);
    }

    renderCashUpgrades(body) {
      const pid = this.save.ui.planet;
      const planet = PLANETS[pid];
      const ps = this.save.planets[pid];
      const affordable = [];
      const later = [];
      const owned = [];
      for (const u of planet.upgrades) {
        if (ps.cashUpgrades[u.id]) owned.push(u);
        else if (ps.money >= u.cost) affordable.push(u);
        else later.push(u);
      }
      later.sort((a, b) => a.cost - b.cost);
      affordable.sort((a, b) => a.cost - b.cost);

      if (affordable.length) body.appendChild(upgradeSection('Affordable', affordable, (u) => this.upgradeRow(u, 'cash', 'buy')));
      if (later.length) body.appendChild(upgradeSection('Next', later.slice(0, 8), (u) => this.upgradeRow(u, 'cash', 'wait')));
      if (owned.length) body.appendChild(upgradeSection('Owned', owned, (u) => this.upgradeRow(u, 'cash', 'owned')));
    }

    renderAngelUpgrades(body) {
      const pid = this.save.ui.planet;
      const planet = PLANETS[pid];
      const ps = this.save.planets[pid];
      const affordable = [];
      const later = [];
      const owned = [];
      for (const u of planet.angelUpgrades) {
        if (ps.angelUpgrades[u.id]) owned.push(u);
        else if (this.save.angels >= u.cost) affordable.push(u);
        else later.push(u);
      }
      later.sort((a, b) => a.cost - b.cost);
      affordable.sort((a, b) => a.cost - b.cost);

      const hint = document.createElement('div');
      hint.className = 'cap-side-hint';
      hint.textContent =
        'Angel upgrades spend angels (permanent) but grant massive multipliers. Buy when you can comfortably afford.';
      body.appendChild(hint);

      if (affordable.length) body.appendChild(upgradeSection('Affordable', affordable, (u) => this.upgradeRow(u, 'angel', 'buy')));
      if (later.length) body.appendChild(upgradeSection('Next', later.slice(0, 8), (u) => this.upgradeRow(u, 'angel', 'wait')));
      if (owned.length) body.appendChild(upgradeSection('Owned', owned, (u) => this.upgradeRow(u, 'angel', 'owned')));
    }

    renderManagers(body) {
      const pid = this.save.ui.planet;
      const planet = PLANETS[pid];
      const ps = this.save.planets[pid];
      for (let i = 0; i < planet.managers.length; i++) {
        const m = planet.managers[i];
        const st = ps.businesses[i];
        const row = document.createElement('div');
        row.className = 'cap-mgr';
        const can = ps.money >= m.cost && !st.manager && st.owned > 0;
        row.innerHTML =
          '<div class="cap-mgr-name">' + escapeHtml(m.name) + '</div>' +
          '<div class="cap-mgr-sub">Auto-runs ' +
          escapeHtml(planet.businesses[i].name) +
          '</div>' +
          '<div class="cap-mgr-cost">' +
          (st.manager ? '✓ Hired' : fmt(m.cost)) +
          '</div>';
        const btn = document.createElement('button');
        btn.className = 'cap-mgr-hire' + (can ? '' : ' off') + (st.manager ? ' done' : '');
        btn.textContent = st.manager ? 'Hired' : 'Hire';
        btn.disabled = !can || st.manager;
        btn.addEventListener('click', () => {
          this.buyManager(i);
          this.render();
        });
        row.appendChild(btn);
        body.appendChild(row);
      }
    }

    renderStats(body) {
      const total = sumLifetime(this.save);
      const newAngels = angelsForReset(this.save);
      const eff = (0.02 + this.save.angelEffBonus) * 100;
      const boost = angelBoost(this.save);
      const cps = totalCpsForPlanet(this.save, this.save.ui.planet);

      const rows = [
        ['Lifetime earnings (all planets)', fmt(total)],
        ['This planet lifetime', fmt(this.save.planets[this.save.ui.planet].lifetimeEarnings)],
        ['This planet CPS (managed)', fmt(cps) + '/s'],
        ['Angel investors held', fmtInt(this.save.angels)],
        ['Angels sacrificed', fmtInt(this.save.angelsSacrificed)],
        ['Angel effectiveness', eff.toFixed(2) + '% per angel'],
        ['Total angel boost', '×' + boost.toFixed(3)],
        ['Angels at next reset', '+' + fmtInt(newAngels)],
      ];
      for (const [k, v] of rows) {
        const r = document.createElement('div');
        r.className = 'cap-stat-row';
        r.innerHTML = '<span>' + escapeHtml(k) + '</span><b>' + escapeHtml(v) + '</b>';
        body.appendChild(r);
      }
    }

    upgradeRow(u, kind, state) {
      const pid = this.save.ui.planet;
      const row = document.createElement('div');
      row.className = 'cap-upg cap-upg-' + state;
      const desc =
        u.aeff
          ? 'Angel effectiveness +' + (u.aeff * 100).toFixed(1) + '%'
          : u.bid === 'all'
          ? 'All profits ×' + u.mult
          : (function () {
              const b = PLANETS[pid].businesses.find((x) => x.id === u.bid);
              return (b ? b.name : u.bid) + ' ×' + u.mult;
            })();
      const costTxt = kind === 'angel' ? fmtInt(u.cost) + ' angels' : fmt(u.cost);
      row.innerHTML =
        '<div class="cap-upg-main">' +
        '<div class="cap-upg-name">' + escapeHtml(u.name) + '</div>' +
        '<div class="cap-upg-desc">' + escapeHtml(desc) + '</div>' +
        '</div>' +
        '<div class="cap-upg-cost">' + costTxt + '</div>';
      if (state === 'buy') {
        row.addEventListener('click', () => {
          if (kind === 'cash') this.buyCashUpgrade(u.id);
          else this.buyAngelUpgrade(u.id);
          this.render();
        });
      }
      return row;
    }

    renderSoft() {
      const pid = this.save.ui.planet;
      const ps = this.save.planets[pid];
      const planet = PLANETS[pid];
      const cps = totalCpsForPlanet(this.save, pid);
      this.elMoney.textContent = fmt(ps.money);
      this.elCps.textContent = fmt(cps) + '/s';
      const newAngels = angelsForReset(this.save);
      this.elAngels.textContent =
        '☆ ' + fmtInt(this.save.angels) +
        (newAngels > 0 ? '   (+' + fmtInt(newAngels) + ')' : '');
      this.elReset.textContent =
        newAngels > 0 ? 'Reset for +' + fmtInt(newAngels) + ' angels' : 'Reset';

      // Progress bars
      const rows = this.elBizList.querySelectorAll('.cap-biz');
      for (const row of rows) {
        const i = parseInt(row.dataset.idx || '-1', 10);
        if (i < 0) continue;
        const st = ps.businesses[i];
        const t = businessCycleTime(this.save, pid, i);
        const pct = t > 0 ? Math.min(1, st.progress / t) : 0;
        const bar = row.querySelector('[data-role="bar"]');
        if (bar) bar.style.width = (pct * 100).toFixed(1) + '%';
      }

      // Update topbar stats
      this.api.setStats({
        cash: fmt(ps.money),
        cps: fmt(cps) + '/s',
        angels: fmtInt(this.save.angels),
        planet: planet.name,
      });
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function upgradeSection(title, items, make) {
    const wrap = document.createElement('div');
    wrap.className = 'cap-upg-section';
    const h = document.createElement('h4');
    h.textContent = title;
    wrap.appendChild(h);
    for (const it of items) wrap.appendChild(make(it));
    return wrap;
  }

  function loadSave(api) {
    const s = api.getSettings('capitalist');
    if (!s || typeof s !== 'object' || !s.planets) return null;
    return s;
  }

  function normalizeSave(save) {
    save.v = save.v || 1;
    save.angels = save.angels || 0;
    save.angelsSacrificed = save.angelsSacrificed || 0;
    save.angelEffBonus = save.angelEffBonus || 0;
    save.ui = save.ui || { planet: 'earth', tab: 'managers' };
    save.lastTick = save.lastTick || Date.now();
    for (const pid of PLANET_ORDER) {
      if (!save.planets[pid]) save.planets[pid] = defaultPlanetState(pid);
      const ps = save.planets[pid];
      const planet = PLANETS[pid];
      if (!Array.isArray(ps.businesses) || ps.businesses.length !== planet.businesses.length) {
        ps.businesses = planet.businesses.map(() => ({ owned: 0, progress: 0, manager: false }));
      }
      ps.cashUpgrades = ps.cashUpgrades || {};
      ps.angelUpgrades = ps.angelUpgrades || {};
      if (typeof ps.money !== 'number') ps.money = planet.startMoney;
      if (typeof ps.lifetimeEarnings !== 'number') ps.lifetimeEarnings = 0;
      if (typeof ps.unlocked !== 'boolean') ps.unlocked = pid === 'earth';
    }
  }
})();
