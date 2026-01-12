const parseTime = d3.timeParse("%Y-%m-%d %H:%M");
const parseYear = d3.timeParse("%Y");

d3.csv("../data/online_sales_dataset.csv", d => {
  return {
    invoiceDate: parseTime(d.InvoiceDate),
    country: d.Country,
    quantity: +d.Quantity,
    unitPrice: +d.UnitPrice,
    revenue: +d.Quantity * +d.UnitPrice
  }
}).then(rawData => {
  const validData = rawData.filter(d => d.invoiceDate && d.country && !isNaN(d.revenue));
  
  const yearlyData = d3.rollup(
    validData,
    v => d3.sum(v, d => d.revenue),
    d => d.invoiceDate.getFullYear(),
    d => d.country
  );
  
  const data = [];
  yearlyData.forEach((countries, year) => {
    countries.forEach((revenue, country) => {
      data.push({
        year: year,
        country: country,
        revenue: revenue,
        date: parseYear(year.toString())
      });
    });
  });
  
  data.sort((a, b) => d3.ascending(a.country, b.country) || d3.ascending(a.year, b.year));
  
  const countries = Array.from(new Set(data.map(d => d.country))).sort();
  const colors = d3.scaleOrdinal()
    .domain(countries)
    .range(d3.quantize(d3.interpolateRainbow, countries.length));

  createBarChart(data, colors);
  createLineChart(data, colors);
})

const createBarChart = (data, colors) => {
  const width = 900, height = 400;
  const margins = {top: 10, right: 30, bottom: 80, left: 80};

  let newData = data.filter(d => d.year == 2025);
  const svg = d3.select("#bar")
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

  const xScale = d3.scaleBand()
    .domain(newData.map(d => d.country))
    .range([margins.left, width - margins.right])
    .padding(0.2);
  
  const yScale = d3.scaleLinear()
    .domain([0, d3.max(newData, d => d.revenue)])
    .range([height - margins.bottom, margins.top]);

  let bar = svg.append("g")
    .selectAll("rect")
    .data(newData, d => d.country)
    .join("rect")
      .attr("class", d => d.country)
      .attr("x", d => xScale(d.country))
      .attr("y", d => yScale(d.revenue))
      .attr("height", d => yScale(0) - yScale(d.revenue))
      .attr("width", xScale.bandwidth())
      .attr("fill", d => colors(d.country))
      .on("mouseover", mouseover)
      .on("mouseout", mouseout);

  bar.append('title').text(d => d.country);
  const yAxis = d3.axisLeft(yScale)

  const yGroup = svg.append("g")
      .attr("transform", `translate(${margins.left},0)`)
    .call(yAxis)
    .call(g => g.select(".domain").remove());

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(height / 3))
    .attr("y", margins.left - 60)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Revenue ($)");

  const xAxis = d3.axisBottom(xScale);

  const xGroup = svg.append("g")
      .attr("transform", `translate(0,${height - margins.bottom})`)
    .call(xAxis);

  xGroup.selectAll("text")
    .style("text-anchor", "end")
    .attr("dx", "-.8em")
    .attr("dy", ".15em")
    .attr("transform", "rotate(-65)");

  function mouseover(e, d) {
    const countryClass = d.country.replace(/\s+/g, '-');
    
    d3.select(this)
      .attr("stroke", "black")
      .attr("stroke-width", 2);

    d3.select(`path.${countryClass}`)
      .style("stroke", colors(d.country))
      .style("opacity", 1);

    d3.select(`text.${countryClass}`)
      .style("visibility", "visible");
  }

  function mouseout(e, d) {
    const countryClass = d.country.replace(/\s+/g, '-');
    
    d3.select(this).attr("stroke", null);

    d3.select(`path.${countryClass}`)
      .style("stroke", "lightgrey")
      .style("opacity", 0.3);

    d3.select(`text.${countryClass}`)
      .style("visibility", "hidden");
  }

  d3.select("#yearSlider").on("change", function(e) {
    update();
  });
  d3.select("#yearText").on("change", function(e) {
    update();
  });

  d3.select("#sort").on("change", function(e) {
    update();
  });

  function update() {
    const year = +d3.select("#yearSlider").node().value;
    const sort = d3.select("#sort").node().value;

    newData = data.filter(d => d.year == year);

    if (sort == 'alphabet') {
      newData = newData.sort((a, b) => d3.ascending(a.country, b.country));
    }
    else if (sort == 'revenueAsc') {
      newData = newData.sort((a, b) => d3.ascending(a.revenue, b.revenue));
    }
    else {
      newData = newData.sort((a, b) => d3.descending(a.revenue, b.revenue));
    }

    const xScale = d3.scaleBand()
      .domain(newData.map(d => d.country))
      .range([margins.left, width - margins.right])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(newData, d => d.revenue)])
      .range([height - margins.bottom, margins.top]);

    const t = d3.transition()
      .duration(1000)
      .ease(d3.easeLinear);

    bar = bar.data(newData, d => d.country)
      .join(
        enter => enter.append("rect")
          .attr("class", d => d.country)
          .attr("x", d => xScale(d.country))
          .attr("y", d => yScale(0))
          .attr("height", 0)
          .attr("width", xScale.bandwidth())
          .attr("fill", d => colors(d.country))
          .on("mouseover", mouseover)
          .on("mouseout", mouseout)
          .call(enter => enter.transition(t)
              .attr("height", d => yScale(0) - yScale(d.revenue))
              .attr("y", d => yScale(d.revenue))),
        update => update.transition(t)
          .attr("x", d => xScale(d.country))
          .attr("y", d => yScale(d.revenue))
          .attr("height", d => yScale(0) - yScale(d.revenue))
          .attr("width", xScale.bandwidth()),
        exit => exit.transition(t)
          .attr("y", yScale(0))
          .attr("height", 0)
          .remove()
      );

    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => `$${d3.format(".2s")(d)}`);

    xGroup.transition(t)
      .call(xAxis);

    xGroup.selectAll("text")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-65)");

    yGroup.transition(t)
      .call(yAxis)
      .selection()
      .call(g => g.select(".domain").remove());
  }
}

const createLineChart = (data, colors) => {
  const width = 900, height = 400;
  const margins = {top: 10, right: 100, bottom: 40, left: 80};

  const svg = d3.select("#line")
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

  const xScale = d3.scaleTime()
    .domain(d3.extent(data, d => d.date))
    .range([margins.left, width - margins.right]);
  
  const yScale = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.revenue)])
    .range([height - margins.bottom, margins.top]);

  const line = d3.line()
    .curve(d3.curveLinear)
    .x(d => xScale(d.date))
    .y(d => yScale(d.revenue));

  const group = d3.group(data, d => d.country);

  const path = svg.append("g")
      .selectAll('path')
      .data(group)
      .join("path")
        .attr("class", ([country, d]) => country.replace(/\s+/g, '-'))
        .attr("d", ([country, d]) => line(d))
        .style("stroke", "lightgrey")
        .style("stroke-width", 2)
        .style("fill", "transparent")
        .style("opacity", 0.3);

  path.append('title').text(([country, d]) => country);

  const xAxis = d3.axisBottom(xScale);

  svg.append("g")
    .attr("transform", `translate(0,${height - margins.bottom})`)
    .call(xAxis);

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Year");

  const yAxis = d3.axisLeft(yScale)

  svg.append("g")
    .attr("transform", `translate(${margins.left},0)`)
    .call(yAxis)
    .call(g => g.select(".domain").remove());

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(height / 2))
    .attr("y", margins.left - 60)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Revenue ($)");

  const years = Array.from(new Set(data.map(d => d.year)));
  const maxYear = d3.max(years);
  const dataMaxYear = data.filter(d => d.year == maxYear);
  
  const labels = svg.append("g")
    .selectAll("text.label")
    .data(dataMaxYear)
    .join("text")
      .attr("class", d => d.country.replace(/\s+/g, '-'))
      .attr("x", width - margins.right + 5)
      .attr("y", d => yScale(d.revenue))
      .attr("dy", "0.35em")
      .style("font-family", "sans-serif")
      .style("font-size", 12)
      .style("fill", d => colors(d.country))
      .text(d => d.country);

  labels.style("visibility", "hidden");
}