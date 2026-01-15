// Get initial year from URL or default to 2025
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const yearParam = params.get("year");
  return {
    provider: params.get("provider") || "All",
    country: params.get("country") || "All",
    year: yearParam === "all" ? "all" : (parseInt(yearParam) || 2025)
  };
}

export function drawBarChart(data) {

  // ---------- CONFIG ----------
  const width = 900, height = 250;
  const margins = { top: 60, right: 30, bottom: 40, left: 80 };

  const filters = getQueryParams();
  let selectedYear = filters.year;      // number or "all"
  let selectedProvider = filters.provider;
  let selectedCountry = filters.country;

  window.addEventListener("countrySelected", onCountrySelected);
  window.addEventListener("providerChanged", onProviderChange);

  // ---------- SVG ----------
  const svg = d3.select("#bar")
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

  const chartTitle = svg.append("text")
    .attr("x", width / 2)        // centered horizontally
    .attr("y", 20)               // 20px from top of SVG
    .attr("text-anchor", "middle")
    .style("font-size", "26px")
    .style("font-weight", "bold")
    .text("Annual Revenue Trend");


  const p = svg.append("p")
    .style("font-size", "12px")
    .text("Click on a year to filter the map above");


  // ---------- TOOLTIP ----------
  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  // ---------- DATA AGGREGATION ----------
  function aggregateData(providerFilter, countryFilter = "All") {
    let filtered = data;

    if (providerFilter !== "All") {
      filtered = data.filter(d => d.ShipmentProvider === providerFilter);
    }

    if (countryFilter !== "All") {
      filtered = filtered.filter(d => d.Country === countryFilter);
    }

    const yearlyData = d3.rollup(
      filtered,
      v => d3.sum(v, d => d.revenue),
      d => d.InvoiceDate.getFullYear()
    );

    console.log("Aggregated data for provider:", providerFilter, "country:", countryFilter, yearlyData);

    const result = Array.from(yearlyData, ([year, revenue]) => ({ year, revenue }))
      .sort((a, b) => a.year - b.year);
    return result;
  }

  let chartData = aggregateData(selectedProvider, selectedCountry);

  // ---------- SCALES ----------
  const xScale = d3.scaleBand()
    .domain(chartData.map(d => d.year))
    .range([margins.left, width - margins.right])
    .padding(0.3);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(chartData, d => d.revenue)])
    .nice()
    .range([height - margins.bottom, margins.top]);

  // ---------- AXES ----------
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3.axisLeft(yScale)
    .tickFormat(d => `$${d3.format(".2s")(d)}`);

  const xGroup = svg.append("g")
    .attr("transform", `translate(0,${height - margins.bottom})`)
    .call(xAxis);

  const yGroup = svg.append("g")
    .attr("transform", `translate(${margins.left},0)`)
    .call(yAxis)
    .call(g => g.select(".domain").remove());

  // ---------- AXIS LABELS ----------
  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(height / 2))
    .attr("y", margins.left - 60)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Annual Revenue ($)");

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 10)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Year");

  // ---------- MODE TEXT ----------
  const modeText = svg.append("text")
    .attr("x", width - margins.right)
    .attr("y", margins.top)
    .attr("text-anchor", "end")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#ff6b6b")
    .style("opacity", selectedYear === "all" ? 1 : 0)
    .text("ALL YEARS MODE");

  // ---------- BARS ----------
  let bars = svg.append("g")
    .selectAll("rect")
    .data(chartData, d => d.year)
    .join("rect")
    .attr("x", d => xScale(d.year))
    .attr("y", d => yScale(d.revenue))
    .attr("height", d => yScale(0) - yScale(d.revenue))
    .attr("width", xScale.bandwidth())
    .attr("fill", d =>
      selectedYear === "all"
        ? "#9e9e9e"
        : d.year === selectedYear
          ? "#08306b"
          : "#6baed6"
    )
    .attr("stroke", d =>
      selectedYear !== "all" && d.year === selectedYear ? "#000" : "none"
    )
    .attr("stroke-width", d =>
      selectedYear !== "all" && d.year === selectedYear ? 2 : 0
    )
    .style("cursor", "pointer")
    .on("click", handleYearClick)
    .on("mouseover", handleMouseOver)
    .on("mousemove", handleMouseMove)
    .on("mouseout", handleMouseOut);

  // ---------- SELECTION INDICATOR ----------
  const selectionIndicator = svg.append("rect")
    .attr("class", "year-selector")
    .attr("y", margins.top - 10)
    .attr("height", height - margins.top - margins.bottom + 10)
    .attr("fill", "none")
    .attr("stroke", "#ff6b6b")
    .attr("stroke-width", 3)
    .attr("stroke-dasharray", "5,5")
    .attr("rx", 4)
    .style("pointer-events", "none")
    .style("opacity", selectedYear === "all" ? 0 : 1)
    .attr("x", selectedYear !== "all" ? xScale(selectedYear) - 3 : 0)
    .attr("width", selectedYear !== "all" ? xScale.bandwidth() + 6 : 0);

  // ---------- FUNCTIONS ----------
  function handleYearClick(event, d) {
    selectedYear = (selectedYear === d.year) ? "all" : d.year;
    updateYearSelection();
    updateURL();

    window.dispatchEvent(new CustomEvent("yearChanged", {
      detail: { year: selectedYear }
    }));
  }

  function handleMouseOver(event, d) {
    if (selectedYear === "all" || d.year !== selectedYear) {
      d3.select(this).attr("fill", "#4292c6");
    }

    tooltip
      .style("opacity", 1)
      .html(`
        <strong>${d.year}</strong><br>
        Revenue: $${d3.format(",.2f")(d.revenue)}<br>
        <em>${selectedYear === d.year ? "Click to show all years" : "Click to filter to this year"}</em>
      `)
      .style("left", `${event.pageX + 10}px`)
      .style("top", `${event.pageY - 28}px`);
  }

  function handleMouseMove(event) {
    tooltip
      .style("left", `${event.pageX + 10}px`)
      .style("top", `${event.pageY - 28}px`);
  }

  function handleMouseOut(event, d) {
    d3.select(this).attr("fill",
      selectedYear === "all"
        ? "#9e9e9e"
        : d.year === selectedYear
          ? "#08306b"
          : "#6baed6"
    );
    tooltip.style("opacity", 0);
  }

  function updateYearSelection() {
    const isAll = selectedYear === "all";

    bars.transition().duration(300)
      .attr("fill", d =>
        isAll ? "#9e9e9e" : d.year === selectedYear ? "#08306b" : "#6baed6"
      )
      .attr("stroke", d =>
        !isAll && d.year === selectedYear ? "#000" : "none"
      )
      .attr("stroke-width", d =>
        !isAll && d.year === selectedYear ? 2 : 0
      );

    selectionIndicator.transition().duration(300)
      .style("opacity", isAll ? 0 : 1)
      .attr("x", !isAll ? xScale(selectedYear) - 3 : 0)
      .attr("width", !isAll ? xScale.bandwidth() + 6 : 0);

    modeText.transition().duration(300)
      .style("opacity", isAll ? 1 : 0);
  }

  function onCountrySelected(event) {
    selectedCountry = event.detail.country;
    chartData = aggregateData(selectedProvider, selectedCountry);
    redrawChart();
    updateTitle();
    updateURL();
  }

  function onProviderChange(event) {
    selectedProvider = event.detail.provider;
    chartData = aggregateData(selectedProvider, selectedCountry);
    redrawChart();
    updateTitle();
    updateURL();
  }

  function updateTitle() {
    let titleText = "Annual Revenue Trend";

    // Add country only if filtered
    if (selectedCountry !== "All") {
      titleText += ` for ${selectedCountry}`;
    }

    // Add provider only if filtered
    if( selectedProvider !== "All") {
      titleText += ` (${selectedProvider})`;
    }

    chartTitle.text(titleText);
  }

  function redrawChart() {
    // Update scales
    xScale.domain(chartData.map(d => d.year));
    yScale.domain([0, d3.max(chartData, d => d.revenue) || 0]).nice();

    const t = d3.transition().duration(500);
    const isAllYears = selectedYear === "all";

    // Rebind data
    bars = bars
      .data(chartData, d => d.year)
      .join(
        enter => enter.append("rect")
          .attr("x", d => xScale(d.year))
          .attr("y", yScale(0))
          .attr("height", 0)
          .attr("width", xScale.bandwidth())
          .attr("fill", isAllYears ? "#9e9e9e" : "#6baed6")
          .style("cursor", "pointer")
          .on("click", handleYearClick)
          .on("mouseover", handleMouseOver)
          .on("mousemove", handleMouseMove)
          .on("mouseout", handleMouseOut)
          .call(enter => enter.transition(t)
            .attr("y", d => yScale(d.revenue))
            .attr("height", d => yScale(0) - yScale(d.revenue))
          ),

        update => update.call(update => update.transition(t)
          .attr("x", d => xScale(d.year))
          .attr("y", d => yScale(d.revenue))
          .attr("height", d => yScale(0) - yScale(d.revenue))
          .attr("width", xScale.bandwidth())
          .attr("fill", d =>
            isAllYears
              ? "#9e9e9e"
              : d.year === selectedYear
                ? "#08306b"
                : "#6baed6"
          )
        ),

        exit => exit.transition(t)
          .attr("y", yScale(0))
          .attr("height", 0)
          .remove()
      );

    // Update axes
    xGroup.transition(t).call(xAxis);
    yGroup.transition(t).call(yAxis);

    // Update selection indicator
    if (selectedYear !== "all" && xScale(selectedYear)) {
      selectionIndicator
        .transition(t)
        .attr("x", xScale(selectedYear) - 3)
        .attr("width", xScale.bandwidth() + 6)
        .style("opacity", 1);
    } else {
      selectionIndicator.transition(t).style("opacity", 0);
    }
  }


  function updateURL() {
    const params = new URLSearchParams(window.location.search);
    params.set("year", selectedYear);
    params.set("provider", selectedProvider);
    params.set("country", selectedCountry);
    window.history.pushState({}, "", `${window.location.pathname}?${params}`);
  }

  // ---------- EXPOSE ----------
  window.getSelectedYear = () => selectedYear;
}
