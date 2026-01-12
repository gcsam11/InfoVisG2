// The course's D3.js Tutorial code was used as a template.
// Google Gemini was used especially in the following aspects:
//  * HTML+CSS generation
//  * Creating formats (e.g. "%Y-%m-%d %H:%M")
//  * Code related to styling
//  * Debugging

/* Set the time format
  Ref: https://github.com/d3/d3-time-format */
const parseTime = d3.timeParse("%Y-%m-%d %H:%M");

let fullDataset = [];
let currentYear = 2022; // Default start year
let availableYears = [2020, 2021, 2022, 2023, 2024, 2025]; 
let colors;

/* Load the dataset and formatting variables
  Ref: https://www.d3indepth.com/requests/ */
d3.csv("../data/online_sales_dataset.csv", row => {
  const quantity = +row.Quantity;
  const unitPrice = +row.UnitPrice;
  const discount = +row.Discount;
  return {
    fullDate: parseTime(row.InvoiceDate),
    // Single invoice revenue
    invoiceRevenue: quantity * unitPrice * (1 - discount),
    // for hoverbox/tooltip
    quantity: quantity,
    unitPrice: unitPrice,
  }
}).then(data => {
  // Print out the data on the console
  console.log(data);

  // We need to group by date to get revenue of the day
  // We use the Map data structure for this
  const formatDay = d3.timeFormat("%d.%m.%Y");
  const dailyData = d3.rollup(data, 
    v => {
      return { 
        // Sum of all invoices for calendar view
        total: d3.sum(v, d => d.invoiceRevenue),
        // Raw data for sparkline
        raw: v
      };
    },
    d => formatDay(d.fullDate)
  );
  // Check everything works as expected
  console.log(dailyData);

  // Create Array for the data
  const parseDay = d3.timeParse("%d.%m.%Y");
  const heatmapData = Array.from(dailyData, ([key, value]) => {
      return {
          date: parseDay(key), // We need the Date Object to calculate X/Y
          total: value.total,  // Per-day
          details: value.raw,   // Sparkline
          year: parseDay(key).getFullYear()
      };
  });

  fullDataset = heatmapData

  // Color scale
  // We need the max. daily revenue acquired
  // Note that we don't compute it again for each year that's rendered as
  // we want to be able to compare revenues between years
  const globalMax = d3.max(fullDataset, d => d.total);

  colors = d3.scaleLinear()
  .range(["#1c1c1c", "#2fff00"])
  .domain([0, globalMax])

  // render (for the 1st time)
  updateView();
    
  // event listeners
  setupButtons();
})

function updateView() {
    // only use data from 'currentYear'
    const yearData = fullDataset.filter(d => d.year === currentYear);

    // update year text
    d3.select("#year-display").text(currentYear);

    // (re-)render
    createHeatMap(yearData, colors);
}

function setupButtons() {
    // previous year
    d3.select("#btn-prev").on("click", () => {
        if (currentYear > 2020) {
            currentYear--;
            updateView();
        }
    });

    // next year
    d3.select("#btn-next").on("click", () => {
        if (currentYear < 2025) {
            currentYear++;
            updateView();
        }
    });
}

// Creates hourly bins
function getHourlyRevenue(details) {
    const hourlyData = new Array(24).fill(0);
    // for each data point of date
    details.forEach(d => {
        const hour = d.fullDate.getHours();
        hourlyData[hour] += d.invoiceRevenue;
    });
    // we can use index i as hours start from 0 AM.
    return hourlyData.map((val, i) => ({ hour: i, value: val }));
}

// We assume that when this function is callled that
// the div element passed as argument already exists
// so we draw into it

// Note: we could draw the revenue more densely with e.g. 30 min bins
// but the dataset only has orders on even hours...
function drawSparkline(details, selector) {
    // revenue-per-hour
    const data = getHourlyRevenue(details);
    
    const width = 150;
    const height = 50;
    const margin = {top: 5, right: 0, bottom: 5, left: 0};

    // Assign SVG into the div
    const svg = d3.select(selector)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // x-axis is 0 AM - 11 PM i.e. 0-223
    const x = d3.scaleLinear()
        .domain([0, 23])
        .range([0, width]);

    // y-axis is 0 - max_revenue_of_day
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value)])
        .range([height, 0]);

    // create area chart which is perhaps easier to read as we don't have axes
    const area = d3.area()
        .x(d => x(d.hour))
        .y0(height) // fill from bottom ...
        .y1(d => y(d.value)) // ... to data point's value

    // 6. Draw it
    svg.append("path")
        .datum(data)
        .attr("fill", "#4e10a5ff") // purple because it's one of my favourite colours
        .attr("fill-opacity", 0.4) // add some alpha
        .attr("stroke", "#000000")
        .attr("stroke-width", 1)
        .attr("d", area);
}

// Code adapted from:
// https://d3-graph-gallery.com/graph/heatmap_style.html and
// https://d3-graph-gallery.com/graph/heatmap_basic.html

const createHeatMap = (data, colors) => {
  const cellSize = 15;
  const margin = {top: 10, right: 20, bottom: 30, left: 40};
  // Width = 53 weeks * cell size
  const width = (cellSize * 53) + margin.left + margin.right; 
  // Height = 7 days * cell size
  const height = (cellSize * 7) + margin.top + margin.bottom;

  // Due to the ability to change the year, we need to "flush" the SVG container
  // everytime createHeatMap() is called
  d3.select("#calendar").html("");

  var svg = d3.select("#calendar")
  .append("svg")
    .attr("width", width)
    .attr("height", height)
  .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  
  const getWeekNumber = d => d3.timeMonday.count(d3.timeYear(d), d);
  const getDayOfWeek = d => {
      const day = d.getDay();
      return day === 0 ? 6 : day - 1; 
  };

  const tooltip = d3.select("#tooltip");
  // Formatting helpers
  const formatMoney = d3.format("$.2f"); // e.g., $15.50
  const formatNum = d3.format(".1f");
  const formatDayName = d3.timeFormat("%A"); // "Wednesday"
  const formatDate = d3.timeFormat("%-d.%-m.%Y");  // "25.6.2022"

  svg.selectAll("rect")
    .data(data)
    .join("rect")
      .attr("x", d => getWeekNumber(d.date) * cellSize)
      .attr("y", d => getDayOfWeek(d.date) * cellSize)
      .attr("width", cellSize - 1)  // -1 creates padding
      .attr("height", cellSize - 1)
      .attr("rx", 2)
      .attr("ry", 2)
      .attr("fill", d => colors(d.total))
      .attr("stroke", "#ccc")
      .attr("stroke-width", 0) // Hidden stroke unless hovered
      
      .on("mouseover", function(event, d) {
          // Highlight cell
          d3.select(this)
            .attr("stroke", "black")
            .attr("stroke-width", 2);
          // Show tooltip
          tooltip.style("opacity", 1);
      })

      .on("mousemove", function(event, d) {
        // Calculate metrics
        // d.details contains raw data of the date
        const orderCount = d.details.length;
        const avgQty = d3.mean(d.details, i => i.quantity);
        const avgPrice = d3.mean(d.details, i => i.unitPrice);

        // HTML content of tooltip
        tooltip
          .html(`
            <div style="font-size: 10px;">
            ${formatDayName(d.date)}
            </div>

            <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">
            ${formatDate(d.date)}
            </div>

            <div id="sparkline-container" style="height: 50px; width: 150px; margin-bottom: 5px;"></div>

            <div>Revenue: <strong>${formatMoney(d.total)}</strong></div>
            <div>Orders: ${orderCount}</div>
            <div>Avg. qty: ${formatNum(avgQty)}</div>
            <div>Avg. price: ${formatMoney(avgPrice)}</div>
          `)
          // position near mouse
          .style("left", (event.pageX + 15) + "px")
          .style("top", (event.pageY - 28) + "px");
        
        // We created the div for sparkline. Start rendering it straight away.
        // We pass the day's raw data and the HTML element
        drawSparkline(d.details, "#sparkline-container");
      })

      .on("mouseout", function() {
          // De-highlight
          d3.select(this).attr("stroke-width", 0);
          // Hide tooltip
          tooltip.style("opacity", 0);
      });

  // Weekday labels
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  svg.selectAll(".dayLabel")
    .data(days)
    .join("text")
      .attr("x", -5)
      .attr("y", (d, i) => i * cellSize + 10)
      .style("text-anchor", "end")
      .style("font-size", "10px")
      .style("fill", "#555")
      .text(d => d);

  // Week number labels
  const weekIndices = d3.range(53);
  svg.selectAll(".weekLabel")
    .data(weekIndices)
    .join("text")
      .attr("class", "weekLabel")
      .attr("x", d => d * cellSize + cellSize / 2) // center text
      .attr("y", -3) // put above grid
      .style("text-anchor", "middle")
      .style("font-size", "9px")
      .style("fill", "#555")
      // if week_number is even then render week_number+1, else render empty 
      .text(d => (d % 2 === 0) ? d + 1 : "");
  
  // Legend
  // "Pick" 5 color scale from [0, max]
  const legendData = Array.from({length: 5}, (_, i) => {
      const maxVal = colors.domain()[1]; 
      return (i / 4) * maxVal;
  });

  // Create a group for the legend at the bottom-right
  const gridHeight = cellSize * 7; 
  const legendGroup = svg.append("g")
      .attr("transform", `translate(${width - 180}, ${gridHeight + 15})`);

  // Less
  legendGroup.append("text")
      .attr("x", -10)
      .attr("y", 10)
      .style("font-size", "12px")
      .style("fill", "#555")
      .style("text-anchor", "end")
      .text("Less");

  // 5 squares
  legendGroup.selectAll("rect")
      .data(legendData)
      .join("rect")
        .attr("x", (d, i) => i * (cellSize + 2))
        .attr("y", 0)
        .attr("width", cellSize)
        .attr("height", cellSize)
        .attr("rx", 2)
        .attr("fill", d => colors(d));

  // More
  legendGroup.append("text")
      .attr("x", 5 * (cellSize + 2) + 5)
      .attr("y", 10)
      .style("font-size", "12px")
      .style("fill", "#555")
      .style("text-anchor", "start")
      .text("More");
}