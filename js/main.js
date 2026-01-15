import { loadAllData } from "./data.js";
import { drawChoropleth } from "./map.js";
import { drawBarChart } from "./bar.js";

async function init() {
  try {
    const { rows, world } = await loadAllData();
    drawChoropleth(rows, world);
    drawBarChart(rows);
  } catch (err) {
    console.error("Error loading or drawing data:", err);
  }
}

init();