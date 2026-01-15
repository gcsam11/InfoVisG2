export function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const yearParam = params.get("year");
    return {
        provider: params.get("provider") || "All",
        year: yearParam === "all" ? "all" : (parseInt(yearParam) || 2025)
    };
}

export function drawChoropleth(rows, world) {
    const width = 1200;
    const height = 500;

    let selectedCountry = "All";  // default: no country filter

    const svg = d3.select("#world_map")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("max-width", "100%")
        .style("height", "auto");

    // projection that fits map into SVG
    const projection = d3.geoNaturalEarth1()
        .fitSize([width, height], world);
    const path = d3.geoPath().projection(projection);
    const g = svg.append("g");

    // tooltip
    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    // add zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .translateExtent([[0, 0], [width, height]])
        .extent([[0, 0], [width, height]])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

    svg.call(zoom)
        .on("dblclick.zoom", null); // disable zoom on double click

    // Set up legend
    const legend = svg.append("g")
        .attr("transform", `translate(20, ${height - 80})`);
    const legendSteps = 6;
    const legendWidth = 200;
    const legendHeight = 10;

    const providers = Array.from(new Set(rows.map(d => d.ShipmentProvider))).sort();
    const selectProvider = d3.select("#provider-filter");
    selectProvider
        .selectAll("option.provider")
        .data(["All", ...providers])
        .join("option")
        .attr("value", d => d)
        .attr("class", "provider")
        .text(d => d);

    // Set initial filter from URL
    const filters = getQueryParams();
    const initialProvider = filters.provider || "All";
    let currentYear = filters.year; // Can be a number or "all"
    let currentProvider = initialProvider;

    selectProvider.property("value", initialProvider);

    const countries = g.selectAll("path")
        .data(world.features)
        .join("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5)
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            if (d.properties.name === selectedCountry) {
                d3.select(this).attr("stroke-width", 3); // thicker for selected + hover
            } else {
                d3.select(this).attr("stroke", "black").attr("stroke-width", 2);
            }

            const yearText = currentYear === "all" ? "all years" : currentYear;
            tooltip
                .style("opacity", 1)
                .html(`<strong>${d.properties.name}</strong><br>
                       Nº of Products Sold (${yearText}): ${d.properties.filteredSales || 0}<br>
                       <em>Double Click to view logistics flow</em>`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function (event, d) {
            if (d.properties.name === selectedCountry) {
                // Selected country → normal red border
                d3.select(this)
                    .attr("stroke", "red")
                    .attr("stroke-width", 2);
            } else {
                // Non-selected → normal white border
                d3.select(this)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 0.5);
            }
            tooltip.style("opacity", 0);
        })
        .on("click", function (event, d) {
            const countryName = d.properties.name;

            // Toggle logic: deselect if same country clicked
            if (selectedCountry === countryName) {
                selectedCountry = "All";  // remove filter
            } else {
                selectedCountry = countryName;  // select new country
            }
            updateCountrySelection(); // redraw borders
            window.dispatchEvent(new CustomEvent('countrySelected', { detail: { country: selectedCountry } }));
        })
        .on("dblclick", function (event, d) {
            const countryName = d.properties.name;
            const provider = selectProvider.property("value");

            // Pass the actual current year state, including "all"
            const yearForDetails = currentYear;

            window.location.href = `html/details.html?country=${encodeURIComponent(countryName)}&provider=${encodeURIComponent(provider)}&year=${yearForDetails}`;
        });

    function updateMap(providerFilter, yearFilter) {
        //console.log("Updating map with provider:", providerFilter, "year:", yearFilter);

        // Filter rows by provider
        let filteredRows = rows;

        if (providerFilter !== "All") {
            filteredRows = filteredRows.filter(d => d.ShipmentProvider === providerFilter);
        }

        // Filter by year (if not "all")
        if (yearFilter !== "all") {
            filteredRows = filteredRows.filter(d =>
                d.InvoiceDate && d.InvoiceDate.getFullYear() === yearFilter
            );
        }

        // Aggregate sales by country
        const salesByCountry = d3.rollup(
            filteredRows,
            v => d3.sum(v, d => d.Quantity),
            d => d.Country
        );

        // Attach to GeoJSON
        world.features.forEach(f => {
            f.properties.filteredSales = salesByCountry.get(f.properties.name) || 0;
        });

        // Recompute color scale
        const values = world.features.map(f => f.properties.filteredSales).filter(v => v > 0);
        const min = d3.min(values) || 0;
        const max = d3.max(values) || 1;

        const colorScale = d3.scaleSequential()
            .domain([min, max])
            .interpolator(d3.interpolateRgb("#deebf7", "#08306b"));

        // Update country fills
        countries.transition()
            .duration(500)
            .attr("fill", d => d.properties.filteredSales > 0 ? colorScale(d.properties.filteredSales) : "#eee");

        // Update legend
        const stepValues = d3.range(legendSteps).map(i => min + (i / (legendSteps - 1)) * (max - min));
        const rects = legend.selectAll("rect").data(stepValues);

        rects.join("rect")
            .attr("x", (d, i) => i * (legendWidth / (legendSteps - 1)))
            .attr("y", 0)
            .attr("width", legendWidth / (legendSteps - 1) + 1)
            .attr("height", legendHeight)
            .attr("fill", d => colorScale(d));

        // Legend min/max text
        const minLabel = legend.selectAll(".min-label").data([min]);
        minLabel.join("text")
            .attr("class", "min-label")
            .attr("x", 0)
            .attr("y", legendHeight + 15)
            .attr("font-size", 10)
            .text(d => d.toLocaleString());

        const maxLabel = legend.selectAll(".max-label").data([max]);
        maxLabel.join("text")
            .attr("class", "max-label")
            .attr("x", legendWidth + 40)
            .attr("y", legendHeight + 15)
            .attr("text-anchor", "end")
            .attr("font-size", 10)
            .text(d => d.toLocaleString());

        // Legend title - update to show year mode
        const yearText = yearFilter === "all" ? " (All Years)" : ` (${yearFilter})`;
        const title = legend.selectAll(".legend-title").data([`Products sold${yearText}`]);
        title.join("text")
            .attr("class", "legend-title")
            .attr("x", 0)
            .attr("y", -5)
            .attr("font-size", 12)
            .attr("font-weight", "bold")
            .text(d => d);
    }

    // Initial Map Update
    updateMap(currentProvider, currentYear);

    // Listen for year changes from bar chart
    window.addEventListener('yearChanged', (e) => {
        currentYear = e.detail.year;
        updateMap(currentProvider, currentYear);
    });

    // Update provider dropdown listener
    selectProvider.on("change", function () {
        const selected = this.value;
        currentProvider = selected;

        // Update the map immediately with the new provider
        updateMap(currentProvider, currentYear);

        // Also notify bar chart that provider changed
        window.dispatchEvent(new CustomEvent('providerChanged', {
            detail: { provider: selected }
        }));
    });

    function updateCountrySelection() {
        countries
            .attr("stroke", d => d.properties.name === selectedCountry ? "#ff6b6b" : "#fff")
            .attr("stroke-width", d => d.properties.name === selectedCountry ? 2 : 0.5);
    }

}
