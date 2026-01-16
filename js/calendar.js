// The course's D3.js Tutorial code was used as a template.
// Google Gemini was used especially in the following aspects:
//  * HTML+CSS generation
//  * Creating formats (e.g. "%Y-%m-%d %H:%M")
//  * Code related to styling
//  * Debugging

/* Set the time format
  Ref: https://github.com/d3/d3-time-format */
  const parseTime = d3.timeParse("%Y-%m-%d %H:%M");

  let colors;
  
  const params = new URLSearchParams(window.location.search);
  const selectedCountry = params.get("country");
  const selectedProvider = params.get("provider") || "All";
  const yearParam = params.get("year");
  let selectedYear = yearParam === "all" ? "all" : (parseInt(yearParam) || 2025);

  const getTitle = (year, country, provider) => {
    const yearText = year === "all" ? "All Years" : year;
    const providerText = provider === "All" ? "All shipment providers" : provider;
    return `${yearText} – ${country} – ${providerText}`;
  };
  
  // Update year display
  d3.select("#year-display").text(getTitle(selectedYear, selectedCountry, selectedProvider));
  
  // Set the dropdown value
  d3.select("#year-selector").property("value", selectedYear);
  
  // Add change listener to year selector
  d3.select("#year-selector").on("change", function() {
    const newYear = this.value === "all" ? "all" : parseInt(this.value);
    selectedYear = newYear;
    
    // Update URL
    const params = new URLSearchParams(window.location.search);
    params.set("year", selectedYear);
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({}, '', newURL);
    
    // Update display
    d3.select("#year-display").text(getTitle(selectedYear, selectedCountry, selectedProvider));
    
    // Reload the page to update both calendar and sankey
    window.location.reload();
  });
  
  /* Load the dataset and formatting variables
    Ref: https://www.d3indepth.com/requests/ */
  d3.csv("../data/online_sales_dataset.csv", row => {
    const quantity = +row.Quantity;
    const unitPrice = +row.UnitPrice;
    const discount = +row.Discount;
    const dateObj = parseTime(row.InvoiceDate);
    return {
      fullDate: dateObj,
      // Single invoice revenue
      invoiceRevenue: quantity * unitPrice * (1 - discount),
      // for hoverbox/tooltip
      quantity: quantity,
      unitPrice: unitPrice,
      // filters
      country: row.Country,
      provider: row.ShipmentProvider,
      year: dateObj.getFullYear()
    }
  }).then(data => {
  
    // Filter the data first.
    const filteredData = data.filter( d => {
      const c = (d.country === selectedCountry)
      const y = (selectedYear === "all" || d.year === selectedYear)
      // always True if provider was not selected
      const p = (selectedProvider === "All" || d.provider === selectedProvider)

      // data contains some negative prices, we discard those
      const pos = (d.invoiceRevenue >= 0);
  
      return c && y && p && pos;
    });
  
    if (filteredData.length === 0) {
          const yearText = selectedYear === "all" ? "any year" : selectedYear;
          d3.select("#calendar").html(`<h3 style="text-align: center; color: #666;">No data for ${selectedCountry} in ${yearText}${selectedProvider !== "All" ? ` via ${selectedProvider}` : ''}.</h3>`);
          return; 
      }
  
    if (selectedYear === "all") {
      // For "all years", show an aggregated view by day-of-year
      createAggregatedCalendar(filteredData);
    } else {
      // For specific year, show the traditional calendar
      createYearlyCalendar(filteredData, selectedYear);
    }
  })
  
  // Traditional calendar for a specific year
  function createYearlyCalendar(filteredData, year) {
    // We need to group by date to get revenue of the day
    const formatDay = d3.timeFormat("%d.%m.%Y");
    const dailyData = d3.rollup(filteredData, 
      v => {
        return { 
          total: d3.sum(v, d => d.invoiceRevenue),
          raw: v
        };
      },
      d => formatDay(d.fullDate)
    );
  
    const parseDay = d3.timeParse("%d.%m.%Y");
    const heatmapData = Array.from(dailyData, ([key, value]) => {
        return {
            date: parseDay(key),
            total: value.total,
            details: value.raw,
            year: parseDay(key).getFullYear()
        };
    });
  
    const globalMax = d3.max(heatmapData, d => d.total);
  
    colors = d3.scaleLinear()
      .range(["#1c1c1c", "#2fff00"])
      .domain([0, globalMax])
  
    createHeatMap(heatmapData, colors, year);
  }
  
  // Aggregated calendar showing all years combined
  function createAggregatedCalendar(filteredData) {
    // Group by month-day (ignoring year) to show aggregate patterns
    const formatMonthDay = d => `${d.getMonth()}-${d.getDate()}`;
    
    const aggregatedData = d3.rollup(
      filteredData,
      v => ({
        total: d3.sum(v, d => d.invoiceRevenue),
        count: v.length,
        raw: v
      }),
      d => formatMonthDay(d.fullDate)
    );
  
    // Create data for 2025 (reference year for layout)
    const heatmapData = [];
    const referenceYear = 2025;
    
    // Iterate through all days of the reference year
    for (let month = 0; month < 12; month++) {
      const daysInMonth = new Date(referenceYear, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(referenceYear, month, day);
        const key = formatMonthDay(date);
        const agg = aggregatedData.get(key);
        
        if (agg) {
          heatmapData.push({
            date: date,
            total: agg.total,
            count: agg.count,
            details: agg.raw,
            isAggregate: true
          });
        }
      }
    }
  
    const globalMax = d3.max(heatmapData, d => d.total);
  
    colors = d3.scaleLinear()
      .range(["#1c1c1c", "#2fff00"])
      .domain([0, globalMax])
  
    createHeatMap(heatmapData, colors, "aggregate");
  }
  
  // Creates hourly bins
  function getHourlyRevenue(details) {
      const hourlyData = new Array(24).fill(0);
      details.forEach(d => {
          const hour = d.fullDate.getHours();
          hourlyData[hour] += d.invoiceRevenue;
      });
      return hourlyData.map((val, i) => ({ hour: i, value: val }));
  }
  
  function drawSparkline(details, selector) {
      const data = getHourlyRevenue(details);
      
      const width = 150;
      const height = 50;
      const margin = {top: 5, right: 0, bottom: 5, left: 0};
  
      const svg = d3.select(selector)
          .append("svg")
          .attr("width", width)
          .attr("height", height);
  
      const x = d3.scaleLinear()
          .domain([0, 23])
          .range([0, width]);
  
      const y = d3.scaleLinear()
          .domain([0, d3.max(data, d => d.value)])
          .range([height, 0]);
  
      const area = d3.area()
          .x(d => x(d.hour))
          .y0(height)
          .y1(d => y(d.value))
  
      svg.append("path")
          .datum(data)
          .attr("fill", "#4e10a5ff")
          .attr("fill-opacity", 0.4)
          .attr("stroke", "#000000")
          .attr("stroke-width", 1)
          .attr("d", area);
  }
  
  const createHeatMap = (data, colors, yearMode) => {
    const cellSize = 15;
    const margin = {top: 10, right: 20, bottom: 30, left: 40};
    const width = (cellSize * 53) + margin.left + margin.right; 
    const height = (cellSize * 7) + margin.top + margin.bottom;
  
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
    const formatMoney = d3.format("$.2f");
    const formatNum = d3.format(".1f");
    const formatDayName = d3.timeFormat("%A");
    const formatDate = d3.timeFormat("%-d.%-m.%Y");
  
    svg.selectAll("rect")
      .data(data)
      .join("rect")
        .attr("x", d => getWeekNumber(d.date) * cellSize)
        .attr("y", d => getDayOfWeek(d.date) * cellSize)
        .attr("width", cellSize - 1)
        .attr("height", cellSize - 1)
        .attr("rx", 2)
        .attr("ry", 2)
        .attr("fill", d => colors(d.total))
        .attr("stroke", "#ccc")
        .attr("stroke-width", 0)
        .attr("opacity", 0)
        
        .on("mouseover", function(event, d) {
            d3.select(this).interrupt();
            d3.select(this).attr("opacity", 1);
            d3.select(this)
              .attr("stroke", "black")
              .attr("stroke-width", 2);
            tooltip.style("opacity", 1);
        })
  
        .on("mousemove", function(event, d) {
          const orderCount = d.details.length;
          const avgQty = d3.mean(d.details, i => i.quantity);
          const avgPrice = d3.mean(d.details, i => i.unitPrice);
  
          const aggregateNote = d.isAggregate 
            ? `<div style="color: #ff6b6b; font-weight: bold; margin-bottom: 5px;">Aggregated across ${d.count} orders from all years</div>` 
            : '';

          const tooltipDate = d.isAggregate 
            ?  d3.timeFormat("%-d.%-m.")(d.date)
            : formatDate(d.date);
  
          tooltip
            .html(`
              <div style="font-size: 10px;">
              ${formatDayName(d.date)}
              </div>
  
              <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">
              ${tooltipDate}
              </div>
  
              ${aggregateNote}
  
              <div id="sparkline-container" style="height: 50px; width: 150px; margin-bottom: 5px;"></div>
  
              <div>Revenue: <strong>${formatMoney(d.total)}</strong></div>
              <div>Orders: ${orderCount}</div>
              <div>Avg. qty: ${formatNum(avgQty)}</div>
              <div>Avg. price: ${formatMoney(avgPrice)}</div>
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 28) + "px");
          
          drawSparkline(d.details, "#sparkline-container");
        })
  
        .on("mouseout", function() {
            d3.select(this).attr("stroke-width", 0);
            tooltip.style("opacity", 0);
        })
  
        .transition()
        .duration(500)
        .delay(() => Math.random() * 1800 + 200)
        .attr("opacity", 1);
  
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
        .attr("x", d => d * cellSize + cellSize / 2)
        .attr("y", -3)
        .style("text-anchor", "middle")
        .style("font-size", "9px")
        .style("fill", "#555")
        .text(d => (d % 2 === 0) ? d + 1 : "");
    
    // Legend
    const legendData = Array.from({length: 5}, (_, i) => {
        const maxVal = colors.domain()[1]; 
        return (i / 4) * maxVal;
    });
  
    const gridHeight = cellSize * 7; 
    const legendGroup = svg.append("g")
        .attr("transform", `translate(${width - 180}, ${gridHeight + 15})`);
  
    legendGroup.append("text")
        .attr("x", -10)
        .attr("y", 10)
        .style("font-size", "12px")
        .style("fill", "#555")
        .style("text-anchor", "end")
        .text("Less");
  
    legendGroup.selectAll("rect")
        .data(legendData)
        .join("rect")
          .attr("x", (d, i) => i * (cellSize + 2))
          .attr("y", 0)
          .attr("width", cellSize)
          .attr("height", cellSize)
          .attr("rx", 2)
          .attr("fill", d => colors(d));
  
    legendGroup.append("text")
        .attr("x", 5 * (cellSize + 2) + 5)
        .attr("y", 10)
        .style("font-size", "12px")
        .style("fill", "#555")
        .style("text-anchor", "start")
        .text("More");
  }
