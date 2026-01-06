import { loadAllData } from "./data.js";

// Helper to parse query parameters from URL
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    country: params.get("country"),
    provider: params.get("provider") || "All"
  };
}

async function init() {
  try {
    const filters = getQueryParams();

    d3.select("#back-to-map").on("click", () => {
      // Keep the provider filter when going back
      const providerParam = filters.provider ? `?provider=${encodeURIComponent(filters.provider)}` : "";
      window.location.href = `../index.html${providerParam}`;
    });

    const { rows } = await loadAllData();

    // Filter data for Sankey
    let sankeyData = rows.filter(d =>
      d.WarehouseLocation && d.ShipmentProvider && d.Country
    );

    if (filters.country) {
      sankeyData = sankeyData.filter(d => d.Country === filters.country);
    }

    if (filters.provider && filters.provider !== "All") {
      sankeyData = sankeyData.filter(d => d.ShipmentProvider === filters.provider);
    }

    const container = d3.select("#sankey");
    container.selectAll("*").remove(); // clear previous content

    if (sankeyData.length === 0) {
      container.append("div")
        .attr("class", "no-data-message")
        .style("padding", "20px")
        .style("font-size", "16px")
        .style("color", "#555")
        .style("text-align", "center")
        .text(`No shipments for ${filters.country || "selected country"}${filters.provider ? ` via ${filters.provider}` : ""}.`);
    } else {
      plotSankey(sankeyData);
    }
  } catch (err) {
    console.error("Error loading or filtering data for Sankey:", err);
  }
}

const plotSankey = function (data) {
  // Set 21-color scheme https://www.r-bloggers.com/2013/02/the-paul-tol-21-color-salute/
  const color = d3.scaleOrdinal([
    "#771155", "#AA4488", "#CC99BB", "#114477", "#4477AA", "#77AADD",
    "#117777", "#44AAAA", "#77CCCC", "#117744", "#44AA77", "#88CCAA",
    "#777711", "#AAAA44", "#DDDD77", "#774411", "#AA7744", "#DDAA77",
    "#771122", "#AA4455", "#DD7788"
  ])

  const width = 1600, height = 800;

  const svg = d3.select("#sankey")
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "max-width: 100%; height: auto; height: intrinsic;");

  // 1. Construct the forces and simulate for node positions

  const linkAgg = new Map(); // Map keyed by "source|target" with aggregated metrics

  data.forEach(d => {
    // Two-stage links
    const pairs = [
      [d.WarehouseLocation, d.ShipmentProvider],
      [d.ShipmentProvider, d.Country]
    ];

    pairs.forEach(([s, t]) => {
      if (!s || !t) return;
      const key = `${s}|${t}`;

      const prev = linkAgg.get(key) || {
        orders: 0,
        shippingCost: 0,
        returnCounts: { Returned: 0, "Not Returned": 0, unknown: 0 },
        priorityCounts: { High: 0, Medium: 0, Low: 0, unknown: 0 }
      };

      prev.orders += 1;
      prev.shippingCost += +d.ShippingCost || 0;

      const ret = d.ReturnStatus || "unknown";
      prev.returnCounts[ret] = (prev.returnCounts[ret] || 0) + 1;

      const pr = d.OrderPriority || "unknown";
      prev.priorityCounts[pr] = (prev.priorityCounts[pr] || 0) + 1;

      linkAgg.set(key, prev);
    });
  });

  // Build a set of unique nodes from link endpoints
  const nodeSet = new Set();
  linkAgg.forEach((_, key) => {
    const [s, t] = key.split("|");
    nodeSet.add(s);
    nodeSet.add(t);
  });

  // Aggregate metrics at node level
  const nodeAgg = new Map();
  Array.from(nodeSet).forEach(name => {
    nodeAgg.set(name, {
      orders: 0,
      shippingCost: 0,
      returnCounts: { Returned: 0, "Not Returned": 0, unknown: 0 },
      priorityCounts: { High: 0, Medium: 0, Low: 0, unknown: 0 }
    });
  });

  // Aggregate metrics at link level
  linkAgg.forEach((rec, key) => {
    const [s, t] = key.split("|");
    const addTo = (agg, rec) => {
      agg.orders += rec.orders || 0;
      agg.shippingCost += rec.shippingCost || 0;
      Object.keys(rec.returnCounts || {}).forEach(k => {
        agg.returnCounts[k] = (agg.returnCounts[k] || 0) + (rec.returnCounts[k] || 0);
      });
      Object.keys(rec.priorityCounts || {}).forEach(k => {
        agg.priorityCounts[k] = (agg.priorityCounts[k] || 0) + (rec.priorityCounts[k] || 0);
      });
    };
    addTo(nodeAgg.get(s), rec);
    addTo(nodeAgg.get(t), rec);
  });

  // Build nodes array from aggregated map
  const nodes = Array.from(nodeAgg.entries()).map(([name, m]) => ({
    name,
    orders: m.orders,
    shippingCost: m.shippingCost,
    returnCounts: m.returnCounts,
    priorityCounts: m.priorityCounts
  }));

  color.domain(nodes.map(n => n.name));

  // Helper to find node index by name
  const nodeIndex = d =>
    nodes.findIndex(n => n.name === d);

  // Build links array from aggregated map
  const links = [];
  linkAgg.forEach((rec, key) => {
    const [s, t] = key.split("|");
    links.push({
      source: nodeIndex(s),
      target: nodeIndex(t),
      value: rec.shippingCost / rec.orders, // average shipping cost
      orders: rec.orders,
      shippingCost: rec.shippingCost,
      returnCounts: rec.returnCounts,
      priorityCounts: rec.priorityCounts
    });
  });

  // Sankey layout configuration
  const sankey = d3.sankey()
    .nodeAlign(d3.sankeyJustify) // align nodes evenly across width
    .nodeWidth(18)
    .nodePadding(14)
    .extent([[20, 20], [width - 20, height - 20]]);

  // Compute the Sankey layout
  const graph = sankey({
    nodes: nodes.map(d => Object.assign({}, d)),
    links: links.map(d => Object.assign({}, d))
  });

  const defs = svg.append("defs");

  let uidCounter = 0;
  const uid = (prefix = "id-") => ({ id: `${prefix}${++uidCounter}` });

  // Create a linearGradient per link so the stroke can blend source -> target color
  const grads = defs.selectAll("linearGradient")
    .data(graph.links)
    .join("linearGradient")
    .attr("id", d => (d.uid = uid("link-")).id)
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", d => d.source.x1)
    .attr("x2", d => d.target.x0)
    .attr("y1", d => (d.source.y0 + d.source.y1) / 2)
    .attr("y2", d => (d.target.y0 + d.target.y1) / 2);

  // Gradient starts with source color & ends with target color
  grads.append("stop")
    .attr("offset", "0%")
    .attr("stop-color", d => color(d.source.name)); // color by source

  grads.append("stop")
    .attr("offset", "100%")
    .attr("stop-color", d => color(d.target.name)); // color by target

  // 2. Add links to the SVG canvas

  // Scale link widths based on value (average shipping cost)
  const minV = d3.min(graph.links, d => d.value);
  const maxV = d3.max(graph.links, d => d.value);
  const widthScale = d3.scaleLinear().domain([minV, maxV]).range([1, 30]);

  const link = svg.append("g")
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("d", d3.sankeyLinkHorizontal()) // path generator for Sankey links
    .attr("fill", "none")
    .attr("stroke", d => `url(#${d.uid.id})`) // use gradient stroke
    .attr("stroke-width", d => widthScale(d.value))
    .attr("stroke-opacity", 0);

  // "Draw-in" animation
  link
    .attr("stroke-opacity", 0.3)
    .each(function (d, i) {
      const path = this;
      const len = path.getTotalLength();
      d3.select(path)
        .attr("stroke-dasharray", len)
        .attr("stroke-dashoffset", len)
        .transition()
        .delay(i * 80)
        .duration(200 + Math.min(2000, len))
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0);
    });

  // 3. Add nodes to the SVG canvas
  const node = svg.append("g")
    .selectAll("g")
    .data(graph.nodes)
    .join("g");

  node.append("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("height", d => d.y1 - d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("fill", d => color(d.name))
    .attr("stroke", "#333");

  // 4. Add a tooltip for each node and link
  const tip = d3.select("body").append("div")
    .attr("class", "d3-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("padding", "8px 10px")
    .style("background", "rgba(255,255,255,0.96)")
    .style("color", "#111")
    .style("border", "1px solid rgba(0,0,0,0.12)")
    .style("border-radius", "8px")
    .style("box-shadow", "0 6px 18px rgba(0,0,0,0.08)")
    .style("font-size", "12px")
    .style("line-height", "1.3")
    .style("display", "none");

  // Interaction on link hover (show tooltip with aggregated metrics)
  link
    .on("mousemove", (event, d) => {
      d3.select(event.currentTarget).attr("stroke-opacity", 0.6);
      const html = `<strong>${d.source.name} - ${d.target.name}</strong><br/><br/>
Nº of Shipments: ${d.orders || 0}<br/>
&emsp;- Returned: ${d.returnCounts?.Returned || 0}<br/>
&emsp;- Not Returned: ${d.returnCounts?.['Not Returned'] || 0}<br/>
Total shipping cost: ${d3.format(".2f")(d.shippingCost || 0)}<br/>
Shipments' priorities:<br/>
&emsp;- High: ${d.priorityCounts?.High || 0}<br/>
&emsp;- Medium: ${d.priorityCounts?.Medium || 0}<br/>
&emsp;- Low: ${d.priorityCounts?.Low || 0}`;
      tip.style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px")
        .style("display", "block")
        .html(html);
    })
    .on("mouseout", function () {
      d3.select(this).attr("stroke-opacity", 0.3);
      tip.style("display", "none");
    });

  // Interaction on node hover (show tooltip with basic info)
  node
    .on("mousemove", (event, d) => {
      const html = `<strong>${d.name}</strong><br/>Nº of Shipments: ${d.orders || 0}`;
      tip.style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px")
        .style("display", "block")
        .html(html);
    })
    .on("mouseout", () => tip.style("display", "none"));

  // Add text labels to nodes
  node.append("text")
    .attr("x", d => d.x0 - 6)
    .attr("y", d => (d.y0 + d.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(d => d.name)
    .filter(d => d.x0 < width / 2)
    .attr("x", d => d.x1 + 6)
    .attr("text-anchor", "start");

  const labels = ["Warehouse Locations", "Delivery Services", "Customer's Countries"];

  const legend = d3.select("#legend")
    .style("position", "relative")
    .style("height", "36px")
    .style("display", "flex")
    .style("align-items", "center")
    .style("justify-content", "space-between")
    .style("font-family", "sans-serif")
    .style("font-size", "14px")
    .style("pointer-events", "none");

  legend.selectAll(".stage-caption")
    .data(labels)
    .join("div")
    .attr("class", "stage-caption")
    .style("position", "relative")
    .style("font-weight", "600")
    .style("color", "#111")
    .text(d => d);
};

// Initialize
init();