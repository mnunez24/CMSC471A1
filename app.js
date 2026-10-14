const seasons = ["winter", "spring", "summer", "fall"];
const expected = { annual: 264, winter: 59, spring: 92, summer: 92, fall: 21 };
const seasonOf = (day) => {
    const month = new Date(Date.UTC(2017, 0, day + 1)).getUTCMonth();
    return seasons[Math.floor(((month + 1) % 12) / 3)];
};

function stats(values, period) {
    const n = values.length;
    if (!n) return { n, sd: null, eligible: false };
    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n);
    return { n, sd, eligible: n >= Math.ceil(expected[period] * 0.8) };
}

const select = document.getElementById("season");

// D3 draws the SVG chart and updates station rows when the season changes.
const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", "0 0 900 550")
    .attr("role", "group")
    .attr("aria-label", "Ranked temperature stability chart");
const margin = { top: 10, right: 55, bottom: 40, left: 285 };
const width = 900 - margin.left - margin.right;
const height = 550 - margin.top - margin.bottom;
const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
const axis = plot.append("g").attr("transform", `translate(0,${height})`);
const xScale = d3.scaleLinear().range([0, width]);
const yScale = d3.scaleBand().range([0, height]).padding(0.25);
let stations = [];
let scaleMax = 1;
const stationKey = (station) => JSON.stringify([station.name, station.state, station.lat, station.lon]);

function setupSelector() {
    d3.select("#season").on("change", updateVis);
}

function updateAxes() {
    xScale.domain([0, scaleMax]);
    axis.attr("class", "x-axis").call(
        d3
            .axisBottom(xScale)
            .ticks(5)
            .tickFormat((value) => `${value}°F`)
    );
}

const tooltip = d3.select("#tooltip");
const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400;

function updateVis() {
    tooltip.style("display", "none");
    const period = select.value;
    const eligible = stations
        .filter((station) => station.stats[period].eligible)
        .sort((a, b) => d3.ascending(a.stats[period].sd, b.stats[period].sd) || d3.ascending(a.name, b.name));
    const top = eligible.slice(0, 15);
    yScale.domain(top.map(stationKey));

    d3.select("#chart-title").text(`Most stable stations — ${select.selectedOptions[0].text}`);

    d3.select("#status").text(
        `${eligible.length.toLocaleString()} stations meet the 80% coverage requirement. Showing the top ${top.length}.`
    );

    d3.select("#detail").text("Hover over a bar or focus it with Tab to see details.");
    const description = (station) => {
        const result = station.stats[period];
        return `${station.name}, ${station.state}: ${result.sd.toFixed(2)} °F standard deviation; ${result.n} of ${expected[period]} available days.`;
    };

    const rows = plot
        .selectAll("g.station")
        .data(top, stationKey)
        .join((enter) => {
            const row = enter
                .append("g")
                .attr("class", "station")
                .attr("transform", (station) =>
                `translate(0,${yScale(stationKey(station))})`
                )
                .style("opacity", 0);
            row.append("title");
            row.append("rect").attr("class", "row-background");
            row.append("rect").attr("class", "bar").attr("width", 0);
            row.append("text").attr("class", "station-name").attr("text-anchor", "end");
            row.append("text").attr("class", "value");
            return row;
        },
        update => update,
        exit => exit
                .transition()
                .duration(duration)
                .style("opacity",0)
                .remove()
        );

    rows
        .attr("tabindex", 0)
        .attr("aria-label", description)
        .on("mouseenter", function (event, station) {
            d3.select("#detail").text(description(station));
            tooltip
                .text(description(station))
                .style("display", "block")
                .style(
                    "left",
                    `${Math.min(event.pageX + 12, window.scrollX + document.documentElement.clientWidth - 300)}px`
                )
                .style("top", `${event.pageY + 16}px`);
            d3.select(this).select(".bar").style("stroke", "black");
        })
        .on("mouseleave", function () {
            tooltip.style("display", "none");
            d3.select(this).select(".bar").style("stroke", null);
        })
        .on("focus click", (event, station) => d3.select("#detail").text(description(station)));
    
    rows
        .transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .attr("transform", (station) =>
            `translate(0,${yScale(stationKey(station))})`
    )
    .style("opacity",1);
    rows.select("title").text(description);
    rows.select(".row-background")
        .attr("x", -margin.left)
        .attr("y", -3)
        .attr("width", 900)
        .attr("height", yScale.bandwidth() + 6);
    rows.select(".bar")
        .interrupt()
        .attr("height", yScale.bandwidth())
        .transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .attr("width", (station) => xScale(station.stats[period].sd));
    rows.select(".station-name")
        .transition()
        .duration(duration)
        .attr("x", -10)
        .duration(duration)
        .attr("y", yScale.bandwidth() / 2)
        .attr("dy", "0.35em")
        .text((station) => `${station.name}, ${station.state}`);
    rows.select(".value")
        .transition()
        .duration(duration)
        .attr("x", (station) => xScale(station.stats[period].sd) + 7)
        .attr("y", yScale.bandwidth() / 2)
        .attr("dy", "0.35em")
        .text((station) => station.stats[period].sd.toFixed(2));
}

// Load the data once; calculate seasonal metrics before drawing the chart.
function init() {
    d3.json("data/weather-2017.json", { cache: "no-store" })
        .then((data) => {
            stations = data.map((station) => {
                const groups = { annual: [], winter: [], spring: [], summer: [], fall: [] };
                for (const [day, value] of station.days) {
                    groups.annual.push(value);
                    groups[seasonOf(day)].push(value);
                }
                return {
                    ...station,
                    stats: Object.fromEntries(
                        Object.entries(groups).map(([period, values]) => [period, stats(values, period)])
                    ),
                };
            });
            // Use one scale for the displayed top 15 across every period.
            const displayedValues = Object.keys(expected).flatMap((period) =>
                stations
                    .filter((station) => station.stats[period].eligible)
                    .map((station) => station.stats[period].sd)
                    .sort((a, b) => a - b)
                    .slice(0, 15)
            );
            scaleMax = Math.max(1, Math.ceil(Math.max(...displayedValues)));
            setupSelector();
            updateAxes();
            updateVis();
        })
        .catch((error) => {
            document.getElementById("status").textContent =
                `${error.message}. Serve this folder with python3 -m http.server 8000.`;
        });
}
window.addEventListener("load", init);
