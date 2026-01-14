const parseTime = d3.timeParse("%Y-%m-%d %H:%M");

// Get initial year from URL or default to 2025
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const yearParam = params.get("year");
  return {
    provider: params.get("provider") || "All",
    year: yearParam === "all" ? "all" : (parseInt(yearParam) || 2025)
  };
}

d3.csv("../data/online_sales_dataset.csv", d => {
  return {
    invoiceDate: parseTime(d.InvoiceDate),
    country: d.Country,
    provider: d.ShipmentProvider,
    quantity: +d.Quantity,
    unitPrice: +d.UnitPrice,
    revenue: +d.Quantity * +d.UnitPrice
  }
}).then(rawData => {
  const validData = rawData.filter(d => d.invoiceDate && !isNaN(d.revenue));
  
  createYearlyTrendChart(validData);
});

function createYearlyTrendChart(data) {
  const width = 900, height = 250;
  const margins = {top: 20, right: 30, bottom: 50, left: 80};
  
  const filters = getQueryParams();
  let selectedYear = filters.year; // Can be a number or "all"
  let selectedProvider = filters.provider;

  const svg = d3.select("#bar")
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

  // Tooltip
  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  // Aggregate by year (and optionally filter by provider)
  function aggregateData(providerFilter) {
    let filtered = data;
    if (providerFilter !== "All") {
      filtered = data.filter(d => d.provider === providerFilter);
    }
    
    const yearlyData = d3.rollup(
      filtered,
      v => d3.sum(v, d => d.revenue),
      d => d.invoiceDate.getFullYear()
    );
    
    return Array.from(yearlyData, ([year, revenue]) => ({
      year,
      revenue
    })).sort((a, b) => a.year - b.year);
  }

  let chartData = aggregateData(selectedProvider);

  // Scales
  const xScale = d3.scaleBand()
    .domain(chartData.map(d => d.year))
    .range([margins.left, width - margins.right])
    .padding(0.3);
  
  const yScale = d3.scaleLinear()
    .domain([0, d3.max(chartData, d => d.revenue)])
    .nice()
    .range([height - margins.bottom, margins.top]);

  // Axes
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3.axisLeft(yScale)
    .tickFormat(d => `$${d3.format(".2s")(d)}`);

  const xGroup = svg.append("g")
    .attr("transform", `translate(0,${height - margins.bottom})`)
    .call(xAxis);

  xGroup.selectAll("text")
    .style("font-size", "12px");

  const yGroup = svg.append("g")
    .attr("transform", `translate(${margins.left},0)`)
    .call(yAxis)
    .call(g => g.select(".domain").remove());

  // Y-axis label
  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(height / 2))
    .attr("y", margins.left - 60)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Annual Revenue ($)");

  // X-axis label
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 10)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Year");

  // Mode indicator text (shows "All Years" when in that mode)
  const modeText = svg.append("text")
    .attr("x", width - margins.right)
    .attr("y", margins.top)
    .attr("text-anchor", "end")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#ff6b6b")
    .style("opacity", selectedYear === "all" ? 1 : 0)
    .text("ALL YEARS MODE");

  // Bars
  let bars = svg.append("g")
    .selectAll("rect")
    .data(chartData, d => d.year)
    .join("rect")
    .attr("x", d => xScale(d.year))
    .attr("y", d => yScale(d.revenue))
    .attr("height", d => yScale(0) - yScale(d.revenue))
    .attr("width", xScale.bandwidth())
    .attr("fill", d => {
      if (selectedYear === "all") return "#9e9e9e"; // Gray for all years mode
      return d.year === selectedYear ? "#08306b" : "#6baed6";
    })
    .attr("stroke", d => (selectedYear !== "all" && d.year === selectedYear) ? "#000" : "none")
    .attr("stroke-width", d => (selectedYear !== "all" && d.year === selectedYear) ? 2 : 0)
    .style("cursor", "pointer")
    .on("click", function(event, d) {
      // Toggle: if clicking the same year, switch to "all"
      if (selectedYear === d.year) {
        selectedYear = "all";
      } else {
        selectedYear = d.year;
      }
      updateYearSelection();
      updateURL();
      // Trigger map update via custom event
      window.dispatchEvent(new CustomEvent('yearChanged', { 
        detail: { year: selectedYear }
      }));
    })
    .on("mouseover", function(event, d) {
      if (selectedYear === "all" || d.year !== selectedYear) {
        d3.select(this).attr("fill", "#4292c6");
      }
      const clickMsg = (selectedYear === d.year) 
        ? "<em>Click to show all years</em>" 
        : "<em>Click to filter to this year</em>";
      tooltip
        .style("opacity", 1)
        .html(`<strong>${d.year}</strong><br>Revenue: $${d3.format(",.2f")(d.revenue)}<br>${clickMsg}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mousemove", function(event) {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function(event, d) {
      if (selectedYear === "all") {
        d3.select(this).attr("fill", "#9e9e9e");
      } else if (d.year !== selectedYear) {
        d3.select(this).attr("fill", "#6baed6");
      }
      tooltip.style("opacity", 0);
    });

  // Selection indicator (sliding window visual) - only visible when a specific year is selected
  const selectionIndicator = svg.append("rect")
    .attr("class", "year-selector")
    .attr("x", selectedYear !== "all" ? xScale(selectedYear) - 3 : 0)
    .attr("y", margins.top - 10)
    .attr("width", selectedYear !== "all" ? xScale.bandwidth() + 6 : 0)
    .attr("height", height - margins.top - margins.bottom + 10)
    .attr("fill", "none")
    .attr("stroke", "#ff6b6b")
    .attr("stroke-width", 3)
    .attr("stroke-dasharray", "5,5")
    .attr("rx", 4)
    .style("pointer-events", "none")
    .style("opacity", selectedYear === "all" ? 0 : 1);

  function updateYearSelection() {
    const isAllYears = selectedYear === "all";
    
    bars.transition()
        .duration(300)
        .attr("fill", d => {
          if (isAllYears) return "#9e9e9e";
          return d.year === selectedYear ? "#08306b" : "#6baed6";
        })
        .attr("stroke", d => (!isAllYears && d.year === selectedYear) ? "#000" : "none")
        .attr("stroke-width", d => (!isAllYears && d.year === selectedYear) ? 2 : 0);
    
    if (isAllYears) {
      selectionIndicator
        .transition()
        .duration(300)
        .style("opacity", 0);
      
      modeText
        .transition()
        .duration(300)
        .style("opacity", 1);
    } else {
      selectionIndicator
        .transition()
        .duration(300)
        .attr("x", xScale(selectedYear) - 3)
        .attr("width", xScale.bandwidth() + 6)
        .style("opacity", 1);
      
      modeText
        .transition()
        .duration(300)
        .style("opacity", 0);
    }
  }

  function updateURL() {
    const params = new URLSearchParams(window.location.search);
    params.set('year', selectedYear);
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({}, '', newURL);
  }

  // Listen for provider changes from dropdown
  d3.select("#provider-filter").on("change", function() {
    selectedProvider = this.value;
    chartData = aggregateData(selectedProvider);
    
    // Update scales
    xScale.domain(chartData.map(d => d.year));
    yScale.domain([0, d3.max(chartData, d => d.revenue)]).nice();
    
    // Update bars with transition
    const t = d3.transition().duration(500);
    const isAllYears = selectedYear === "all";
    
    bars = bars.data(chartData, d => d.year)
      .join(
        enter => enter.append("rect")
          .attr("x", d => xScale(d.year))
          .attr("y", yScale(0))
          .attr("height", 0)
          .attr("width", xScale.bandwidth())
          .attr("fill", d => {
            if (isAllYears) return "#9e9e9e";
            return d.year === selectedYear ? "#08306b" : "#6baed6";
          })
          .attr("stroke", d => (!isAllYears && d.year === selectedYear) ? "#000" : "none")
          .attr("stroke-width", d => (!isAllYears && d.year === selectedYear) ? 2 : 0)
          .style("cursor", "pointer")
          .call(enter => enter.transition(t)
            .attr("y", d => yScale(d.revenue))
            .attr("height", d => yScale(0) - yScale(d.revenue))),
        update => update
          .call(update => update.transition(t)
            .attr("x", d => xScale(d.year))
            .attr("y", d => yScale(d.revenue))
            .attr("height", d => yScale(0) - yScale(d.revenue))
            .attr("width", xScale.bandwidth())
            .attr("fill", d => {
              if (isAllYears) return "#9e9e9e";
              return d.year === selectedYear ? "#08306b" : "#6baed6";
            })
            .attr("stroke", d => (!isAllYears && d.year === selectedYear) ? "#000" : "none")
            .attr("stroke-width", d => (!isAllYears && d.year === selectedYear) ? 2 : 0)),
        exit => exit.transition(t)
          .attr("y", yScale(0))
          .attr("height", 0)
          .remove()
      )
      .on("click", function(event, d) {
        if (selectedYear === d.year) {
          selectedYear = "all";
        } else {
          selectedYear = d.year;
        }
        updateYearSelection();
        updateURL();
        window.dispatchEvent(new CustomEvent('yearChanged', { 
          detail: { year: selectedYear }
        }));
      })
      .on("mouseover", function(event, d) {
        if (selectedYear === "all" || d.year !== selectedYear) {
          d3.select(this).attr("fill", "#4292c6");
        }
        const clickMsg = (selectedYear === d.year) 
          ? "<em>Click to show all years</em>" 
          : "<em>Click to filter to this year</em>";
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.year}</strong><br>Revenue: $${d3.format(",.2f")(d.revenue)}<br>${clickMsg}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", function(event) {
        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function(event, d) {
        if (selectedYear === "all") {
          d3.select(this).attr("fill", "#9e9e9e");
        } else if (d.year !== selectedYear) {
          d3.select(this).attr("fill", "#6baed6");
        }
        tooltip.style("opacity", 0);
      });
    
    // Update axes
    xGroup.transition(t).call(xAxis);
    xGroup.selectAll("text").style("font-size", "12px");
    yGroup.transition(t).call(yAxis);
    
    // Update selection indicator position
    if (selectedYear !== "all") {
      selectionIndicator
        .transition(t)
        .attr("x", xScale(selectedYear) - 3)
        .attr("width", xScale.bandwidth() + 6);
    }
  });

  // Export for external access
  window.getSelectedYear = () => selectedYear;
}
