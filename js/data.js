export async function loadAllData() {
    const csvPromise = d3.csv("../data/online_sales_dataset.csv");
    const geoPromise = d3.json(
        "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson"
    );

    return Promise.all([csvPromise, geoPromise]).then(([rows, world]) => {
        rows.forEach(d => {
            d.Quantity = +d.Quantity;   // convert to number
            d.UnitPrice = +d.UnitPrice;
            d.Discount = +d.Discount;
            d.ShippingCost = +d.ShippingCost;
            d.InvoiceDate = d3.timeParse("%Y-%m-%d %H:%M")(d.InvoiceDate);
            d.CustomerID = +d.CustomerID;
        });

        // Fix GeoJSON country names so they match the CSV
        const geoFix = {
            "USA": "United States",
            "England": "United Kingdom"
        };

        world.features.forEach(f => {
            if (geoFix[f.properties.name]) {
                f.properties.name = geoFix[f.properties.name];
            }
        });


        return { rows, world };
    });
}