# Group Assignment 2

In this assignment, multiple visualizations were implemented from an [Online Sales Dataset](https://www.kaggle.com/datasets/yusufdelikkaya/online-sales-dataset).

In order to map an interactive choropleth map, a [geoJson dataset](https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson) was also required.

### Animations and Interactions

An initial fade-in animation of the map was implemented. To see it, just refresh the page at any time.

As for interactions, the user can zoom in on the map using the wheel scroll, hover a country, generating a line around the country's shape to highlight it, as well as displaying a tooltip that provides the number of sold products and the country's name. A user can click in whatever country they wish to check the shipping flow for said country.

### Hosting and Deployment

This project's source code is available [here](https://github.com/gcsam11/InfoVisG2).

The live visualization can be seen [here](gcsam11.github.io).

If the live visualization is not working, please open this folder in VSCode and run the [LiveServer](https://github.com/ritwickdey/vscode-live-server) plugin (be careful with https issues! use http if it does not work out of the box).

### Disclaimer

This project used Generative AI to generate code and debug. 

Code from example implementations for Choropleth maps was also used:

- [Background Map](https://d3-graph-gallery.com/graph/backgroundmap_basic.html)
- [Choropleth Map](https://d3-graph-gallery.com/graph/choropleth_hover_effect.html)
