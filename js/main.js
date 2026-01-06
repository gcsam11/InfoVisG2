import { loadAllData } from "./data.js";
import { drawChoropleth } from "./map.js";

async function init() {
  try {
    const { rows, world } = await loadAllData();
    drawChoropleth(rows, world);
  } catch (err) {
    console.error("Error loading or drawing data:", err);
  }
}

init();