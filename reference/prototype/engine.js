/* Calculs : coût, valeur, profit, temps de pousse, Dew/h — mêmes règles que loftiacodex.com */
(function (root) {
  const D = root.LOFTIA;

  const cropMap = {};
  D.crops.forEach(function (c) {
    cropMap[c[0]] = { slug: c[0], seed: c[1], name: c[2], seedName: c[3], grow: c[4], water: c[5], cost: c[6], sell: c[7], tree: c[6] === null };
  });

  function perkSum(list, lvl) {
    return list.filter(function (p) { return lvl >= p.level; }).reduce(function (a, p) { return a + p.value; }, 0);
  }
  function activePerks(list, lvl) {
    return list.filter(function (p) { return lvl >= p.level; });
  }

  function ingredient(slug) {
    const c = cropMap[slug];
    if (c) {
      return { slug: slug, name: c.name, type: c.tree ? "tree" : "crop", sale: c.sell, cash: c.tree ? 0 : c.cost, real: c.sell, grow: c.grow, seed: c.seed, seedName: c.seedName };
    }
    const e = D.extras[slug];
    return { slug: slug, name: e.name, type: e.type, where: e.where, sale: e.p[0], cash: e.p[1], real: e.p[2], grow: 0 };
  }

  // Rapid Growth : −5 % par palier ; arrondi à la minute
  function growTime(base, farmLvl) {
    return Math.round(base * (1 - perkSum(D.perks.farming.faster, farmLvl)));
  }
  function waterTime(base, farmLvl) {
    return Math.round(base * (1 + perkSum(D.perks.farming.water, farmLvl)));
  }

  /* Temps pour faire pousser des unités sur `plots` parcelles (0 = illimitées) — répartition LPT */
  function makespan(durations, plots) {
    const d = durations.filter(function (x) { return x > 0; });
    if (!d.length) return 0;
    const max = Math.max.apply(null, d);
    if (!plots || plots >= d.length) return max;
    d.sort(function (a, b) { return b - a; });
    const loads = [];
    for (let k = 0; k < plots; k++) loads.push(0);
    d.forEach(function (x) {
      let mi = 0;
      for (let k = 1; k < loads.length; k++) if (loads[k] < loads[mi]) mi = k;
      loads[mi] += x;
    });
    return Math.max.apply(null, loads);
  }

  // Unités à faire pousser : une graine par ingrédient de culture ; les arbres ne prennent pas de parcelle
  function growUnits(ings, n) {
    const units = [];
    let tree = 0;
    ings.forEach(function (i) {
      if (i.type === "crop") for (let k = 0; k < i.q * n; k++) units.push(i.t);
      if (i.type === "tree") tree = Math.max(tree, i.t);
    });
    return { units: units, tree: tree };
  }

  /* opt = { cookLvl, farmLvl, mode: "cash" | "regular", plots: 0 (illimitées) | N, treesReady: bool }
     n = nombre de fois que la recette est faite (les champs racine restent « par plat », tot = totaux pour n) */
  function computeRecipe(r, opt, n) {
    n = n || 1;
    const plots = opt.plots || 0;
    const refund = perkSum(D.perks.cooking.refund, opt.cookLvl);
    const dbl = perkSum(D.perks.cooking.double, opt.cookLvl);
    const value = Math.round(r[2] * (1 + dbl));

    let approx = false;
    const ings = r[6].map(function (pair) {
      const i = ingredient(pair[0]);
      i.q = pair[1];
      let p = opt.mode === "cash" ? i.cash : i.real;
      if (p === null || p === undefined) { p = i.real; approx = true; i.approx = true; }
      i.unit = p;
      i.t = 0;
      if (i.type === "crop" || i.type === "tree") {
        i.t = (i.type === "tree" && opt.treesReady) ? 0 : growTime(i.grow, opt.farmLvl);
      }
      return i;
    });

    const raw = ings.reduce(function (a, i) { return a + i.q * i.unit; }, 0);
    // Ingredient Saver : chance de récupérer le premier ingrédient (comportement du Codex)
    const cost = Math.round(raw - refund * ings[0].unit);
    const profit = value - cost;

    const g1 = growUnits(ings, 1);
    const time = Math.max(makespan(g1.units, plots), g1.tree);
    const gn = n === 1 ? g1 : growUnits(ings, n);
    const timeN = n === 1 ? time : Math.max(makespan(gn.units, plots), gn.tree);
    const maxT = ings.reduce(function (a, i) { return Math.max(a, i.t); }, 0);
    ings.forEach(function (i) { i.crit = maxT > 0 && i.t === maxT; });

    const types = {};
    ings.forEach(function (i) { types[i.type] = true; });

    return {
      slug: r[0], name: r[1], baseSell: r[2], station: r[3], energy: r[4], recipePrice: r[5],
      ings: ings, value: value, cost: cost, profit: profit, approx: approx,
      time: time,
      dph: time > 0 ? profit / (time / 60) : null,
      dpe: profit / r[4],
      hasCrop: !!(types.crop || types.tree), hasTree: !!types.tree,
      hasGather: !!types.gather, hasShop: !!types.shop, hasCraft: !!types.craft,
      tot: {
        n: n, cost: cost * n, value: value * n, profit: profit * n, energy: r[4] * n, time: timeN,
        dph: timeN > 0 ? profit * n / (timeN / 60) : null
      }
    };
  }

  /* Plan : { slug: n } → totaux et liste d'ingrédients agrégée */
  function computePlan(plan, opt) {
    const plots = opt.plots || 0;
    const refund = perkSum(D.perks.cooking.refund, opt.cookLvl);
    const bySlug = {};
    D.recipes.forEach(function (r) { bySlug[r[0]] = r; });
    const entries = [], ingMap = {}, order = [];
    let units = [], tree = 0, cost = 0, value = 0, energy = 0, raw = 0, approx = false;
    Object.keys(plan).forEach(function (slug) {
      const n = plan[slug];
      if (!n || !bySlug[slug]) return;
      const e = computeRecipe(bySlug[slug], opt, n);
      entries.push(e);
      cost += e.tot.cost; value += e.tot.value; energy += e.tot.energy;
      if (e.approx) approx = true;
      const g = growUnits(e.ings, n);
      units = units.concat(g.units); tree = Math.max(tree, g.tree);
      e.ings.forEach(function (i) {
        raw += i.q * n * i.unit;
        if (!ingMap[i.slug]) { ingMap[i.slug] = Object.assign({}, i, { qty: 0, recipes: [] }); order.push(i.slug); }
        ingMap[i.slug].qty += i.q * n;
        ingMap[i.slug].recipes.push(e.name);
      });
    });
    const ings = order.map(function (s) { return ingMap[s]; });
    let seedCost = 0, shopCost = 0;
    ings.forEach(function (i) {
      if (i.type === "crop") seedCost += i.qty * i.cash;
      if (i.type === "shop") shopCost += i.qty * i.cash;
    });
    const time = Math.max(makespan(units, plots), tree);
    const profit = value - cost;
    return {
      entries: entries, ings: ings, count: entries.reduce(function (a, e) { return a + e.tot.n; }, 0),
      cost: cost, raw: raw, saver: raw - cost, value: value, profit: profit, energy: energy, approx: approx,
      time: time, dph: time > 0 ? profit / (time / 60) : null,
      seedCost: seedCost, shopCost: shopCost, seeds: units.length, refund: refund
    };
  }

  function computeCrop(slug, opt) {
    const c = cropMap[slug];
    const dbl = perkSum(D.perks.farming.double, opt.farmLvl);
    const value = Math.round(c.sell * (1 + dbl));
    const grow = growTime(c.grow, opt.farmLvl);
    const profit = c.cost === null ? null : value - c.cost;
    return {
      slug: c.slug, seed: c.seed, name: c.name, seedName: c.seedName, tree: c.tree,
      grow: grow, water: waterTime(c.water, opt.farmLvl), cost: c.cost, value: value, profit: profit,
      dph: profit === null ? null : profit / (grow / 60)
    };
  }

  // Front de Pareto : aucune autre recette n'est à la fois plus rapide (ou égale) et plus rentable (ou égale)
  function paretoSet(list) {
    const out = {};
    list.forEach(function (a) {
      if (a.profit <= 0) return;
      const dominated = list.some(function (b) {
        return b !== a && b.time <= a.time && b.profit >= a.profit && (b.time < a.time || b.profit > a.profit);
      });
      if (!dominated) out[a.slug] = true;
    });
    return out;
  }

  root.LoftiaCalc = {
    cropMap: cropMap, ingredient: ingredient, perkSum: perkSum, activePerks: activePerks,
    growTime: growTime, waterTime: waterTime, computeRecipe: computeRecipe, computeCrop: computeCrop, paretoSet: paretoSet,
    computePlan: computePlan, makespan: makespan
  };
})(typeof window !== "undefined" ? window : globalThis);
