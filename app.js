const REFRESH_INTERVAL_MS = 15_000;
const HISTORY_LIMIT = 240;

const CONTRACTS = {
  votingEscrow: {
    label: "Voting Escrow",
    address: "0x4d6fC15Ca6258b168225D283262743C623c13Ead",
  },
  lockNft: {
    label: "NFT Lock",
    address: "0x106F7D67Ea25Cb9eFf5064CF604ebf6259Ff296d",
  },
  vault: {
    label: "AvKAT Vault",
    address: "0x7231dbaCdFc968E07656D12389AB20De82FbfCeB",
  },
};

const EXPECTED_CHAIN_ID = 747474;
const API_STATS_ENDPOINT = "/api/stats";
const API_REFRESH_ENDPOINT = "/api/refresh";
const API_HISTORY_ENDPOINT = "/api/history";
const SCAN_BASE_URL = "https://katanascan.com/address/";
const CHART_VIEWBOX = {
  width: 560,
  height: 180,
  paddingX: 12,
  paddingTop: 12,
  paddingBottom: 28,
};
const CHART_TOOLTIP_OFFSET = 16;
const CHART_TOOLTIP_GUTTER = 10;

const dom = {
  statusPill: document.getElementById("statusPill"),
  statusText: document.getElementById("statusText"),
  refreshButton: document.getElementById("refreshButton"),
  serveWarning: document.getElementById("serveWarning"),
  totalLockedValue: document.getElementById("totalLockedValue"),
  totalLockedDetail: document.getElementById("totalLockedDetail"),
  activeNftsValue: document.getElementById("activeNftsValue"),
  activeNftsDetail: document.getElementById("activeNftsDetail"),
  avKatMintedValue: document.getElementById("avKatMintedValue"),
  avKatMintedDetail: document.getElementById("avKatMintedDetail"),
  vaultAssetsValue: document.getElementById("vaultAssetsValue"),
  externalLockedValue: document.getElementById("externalLockedValue"),
  sharePriceValue: document.getElementById("sharePriceValue"),
  masterTokenValue: document.getElementById("masterTokenValue"),
  chainIdValue: document.getElementById("chainIdValue"),
  blockNumberValue: document.getElementById("blockNumberValue"),
  lastUpdatedValue: document.getElementById("lastUpdatedValue"),
  queuedTokenIdsValue: document.getElementById("queuedTokenIdsValue"),
  uniqueHolderCountValue: document.getElementById("uniqueHolderCountValue"),
  dbPathValue: document.getElementById("dbPathValue"),
  strategyLink: document.getElementById("strategyLink"),
  katTokenLink: document.getElementById("katTokenLink"),
  lockNftLink: document.getElementById("lockNftLink"),
  integrityNote: document.getElementById("integrityNote"),
  katOverviewChart: document.getElementById("katOverviewChart"),
  katOverviewLegend: document.getElementById("katOverviewLegend"),
  katOverviewSummary: document.getElementById("katOverviewSummary"),
  avKatSupplyChart: document.getElementById("avKatSupplyChart"),
  vkatCreateCountChart: document.getElementById("vkatCreateCountChart"),
  avkatDepositCountChart: document.getElementById("avkatDepositCountChart"),
  exitQueueChart: document.getElementById("exitQueueChart"),
  avKatSupplyChartValue: document.getElementById("avKatSupplyChartValue"),
  vkatCreateCountChartValue: document.getElementById("vkatCreateCountChartValue"),
  avkatDepositCountChartValue: document.getElementById("avkatDepositCountChartValue"),
  exitQueueChartValue: document.getElementById("exitQueueChartValue"),
};

const CHARTS = [
  {
    name: "Total avKAT",
    container: dom.avKatSupplyChart,
    valueElement: dom.avKatSupplyChartValue,
    color: "#151918",
    valueFor: (snapshot) => toBigInt(snapshot.avKatSupply),
    numericFor: (snapshot) => toTokenNumber(snapshot.avKatSupply, snapshot.decimals),
    latestLabelFor: (snapshot) => `${formatTokenDisplay(snapshot.avKatSupply, snapshot.decimals)} avKAT`,
    peakLabelFor: (snapshot) => `${formatTokenDisplay(snapshot.avKatSupply, snapshot.decimals)} peak`,
    tooltipValueFor: (snapshot) => `${formatTokenDetail(snapshot.avKatSupply, snapshot.decimals)} avKAT`,
  },
  {
    name: "vKAT create locks",
    container: dom.vkatCreateCountChart,
    valueElement: dom.vkatCreateCountChartValue,
    color: "#0037a3",
    valueFor: (snapshot) => toBigInt(snapshot.vkatCreateLockCount),
    numericFor: (snapshot) => Number(snapshot.vkatCreateLockCount),
    latestLabelFor: (snapshot) => formatCountDisplay(snapshot.vkatCreateLockCount),
    peakLabelFor: (snapshot) => `${formatCountDisplay(snapshot.vkatCreateLockCount)} total`,
    tooltipValueFor: (snapshot) => `${formatCountDetail(snapshot.vkatCreateLockCount)} events`,
  },
  {
    name: "avKAT deposits",
    container: dom.avkatDepositCountChart,
    valueElement: dom.avkatDepositCountChartValue,
    color: "#171918",
    valueFor: (snapshot) => toBigInt(snapshot.avkatDepositCount),
    numericFor: (snapshot) => Number(snapshot.avkatDepositCount),
    latestLabelFor: (snapshot) => formatCountDisplay(snapshot.avkatDepositCount),
    peakLabelFor: (snapshot) => `${formatCountDisplay(snapshot.avkatDepositCount)} total`,
    tooltipValueFor: (snapshot) => `${formatCountDetail(snapshot.avkatDepositCount)} events`,
  },
  {
    name: "vKAT exit queue",
    container: dom.exitQueueChart,
    valueElement: dom.exitQueueChartValue,
    color: "#7a6f00",
    valueFor: (snapshot) => toBigInt(snapshot.currentExitingAmount),
    numericFor: (snapshot) => toTokenNumber(snapshot.currentExitingAmount, snapshot.decimals),
    latestLabelFor: (snapshot) => `${formatTokenDisplay(snapshot.currentExitingAmount, snapshot.decimals)} KAT`,
    peakLabelFor: (snapshot) => `${formatTokenDisplay(snapshot.currentExitingAmount, snapshot.decimals)} peak`,
    tooltipValueFor: (snapshot) => `${formatTokenDetail(snapshot.currentExitingAmount, snapshot.decimals)} KAT`,
  },
];

const KAT_OVERVIEW_SERIES = [
  {
    key: "vaultAssets",
    label: "Vault-backed KAT",
    color: "#0550db",
    valueFor: (snapshot) => toBigInt(snapshot.vaultAssets),
    numericFor: (snapshot) => toTokenNumber(snapshot.vaultAssets, snapshot.decimals),
    tooltipValueFor: (snapshot) => `${formatTokenDetail(snapshot.vaultAssets, snapshot.decimals)} KAT`,
  },
  {
    key: "totalLocked",
    label: "Total locked KAT",
    color: "#9ca800",
    valueFor: (snapshot) => toBigInt(snapshot.totalLocked),
    numericFor: (snapshot) => toTokenNumber(snapshot.totalLocked, snapshot.decimals),
    tooltipValueFor: (snapshot) => `${formatTokenDetail(snapshot.totalLocked, snapshot.decimals)} KAT`,
  },
  {
    key: "externalLocked",
    label: "KAT outside avKAT",
    color: "#4d504d",
    valueFor: (snapshot) => toBigInt(snapshot.externalLocked),
    numericFor: (snapshot) => toTokenNumber(snapshot.externalLocked, snapshot.decimals),
    tooltipValueFor: (snapshot) => `${formatTokenDetail(snapshot.externalLocked, snapshot.decimals)} KAT`,
  },
];

const katOverviewVisibility = Object.fromEntries(
  KAT_OVERVIEW_SERIES.map((series) => [series.key, true])
);

let isRefreshing = false;
let latestKatOverviewHistory = [];

if (window.location.protocol === "file:") {
  dom.serveWarning.hidden = false;
}

dom.refreshButton.addEventListener("click", () => {
  refreshDashboard({ forceRefresh: true });
});

async function refreshDashboard({ forceRefresh = false } = {}) {
  if (isRefreshing) {
    return;
  }

  isRefreshing = true;
  dom.refreshButton.disabled = true;
  setStatus(
    "loading",
    forceRefresh ? "Refreshing Katana RPC, syncing logs, and writing a new SQLite snapshot..." : "Reading latest SQLite snapshot..."
  );

  try {
    const payload = await fetchPayload(forceRefresh);
    const historyPayload = await fetchHistory(HISTORY_LIMIT);
    renderDashboard(payload, historyPayload.snapshots || []);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus("error", `Dashboard refresh failed: ${message}`);
  } finally {
    isRefreshing = false;
    dom.refreshButton.disabled = false;
  }
}

function renderDashboard(payload, historySnapshots) {
  const { snapshot, meta } = payload;
  const totalLocked = toBigInt(snapshot.totalLocked);
  const activeNfts = toBigInt(snapshot.activeNfts);
  const avKatSupply = toBigInt(snapshot.avKatSupply);
  const vaultAssets = toBigInt(snapshot.vaultAssets);
  const externalLocked = toBigInt(snapshot.externalLocked);
  const decimals = snapshot.decimals;
  const currentExitingAmount = toBigInt(snapshot.currentExitingAmount);
  const normalizedHistory = normalizeHistory(snapshot, historySnapshots);

  updateText(dom.totalLockedValue, `${formatTokenDisplay(totalLocked, decimals)} KAT`);
  updateText(
    dom.totalLockedDetail,
    `${formatTokenDetail(totalLocked, decimals)} KAT currently locked across Katana governance.`
  );

  updateText(dom.activeNftsValue, formatCountDisplay(activeNfts));
  updateText(
    dom.activeNftsDetail,
    `${formatCountDetail(activeNfts)} outstanding veNFT positions tracked by the Lock contract.`
  );

  updateText(dom.avKatMintedValue, `${formatTokenDisplay(avKatSupply, decimals)} avKAT`);
  updateText(
    dom.avKatMintedDetail,
    `${formatTokenDetail(avKatSupply, decimals)} live avKAT shares outstanding from the vault.`
  );

  updateText(dom.vaultAssetsValue, `${formatTokenDetail(vaultAssets, decimals)} KAT`);
  updateText(dom.externalLockedValue, `${formatTokenDetail(externalLocked, decimals)} KAT`);
  updateText(dom.sharePriceValue, snapshot.sharePrice ? `${snapshot.sharePrice} KAT / avKAT` : "No shares minted");
  updateText(dom.masterTokenValue, `#${formatInteger(snapshot.masterTokenId)}`);

  updateText(dom.chainIdValue, String(snapshot.chainId));
  updateText(dom.blockNumberValue, formatInteger(snapshot.blockNumber));
  updateText(dom.lastUpdatedValue, formatTimestamp(snapshot.recordedAt));
  updateText(dom.queuedTokenIdsValue, formatCountDetail(snapshot.queuedTokenIds));
  updateText(dom.uniqueHolderCountValue, formatCountDetail(snapshot.uniqueHolderCount));
  updateText(dom.dbPathValue, meta.dbPath);

  updateLink(dom.strategyLink, snapshot.strategyAddress);
  updateLink(dom.katTokenLink, snapshot.katTokenAddress);

  if (snapshot.integrityOk) {
    dom.integrityNote.textContent =
      "Integrity check passed: VotingEscrow.lockNFT() matches the expected Katana mainnet NFT Lock proxy.";
    dom.integrityNote.style.color = "var(--success)";
  } else {
    dom.integrityNote.textContent =
      `Integrity warning: VotingEscrow.lockNFT() returned ${shortAddress(snapshot.lockNftAddress)} instead of the expected lock address.`;
    dom.integrityNote.style.color = "var(--danger)";
  }

  if (
    normalizeAddress(snapshot.lockNftAddress) !==
    normalizeAddress(dom.lockNftLink.dataset.address || CONTRACTS.lockNft.address)
  ) {
    updateLink(dom.lockNftLink, snapshot.lockNftAddress);
  }

  latestKatOverviewHistory = normalizedHistory;
  renderKatOverviewChart(normalizedHistory);
  renderCharts(normalizedHistory);

  const syncMode = meta.refreshedFromRpc ? "Synced RPC to SQLite" : "SQLite cache";
  const queueText = currentExitingAmount > 0n ? ` · queue ${formatTokenDisplay(currentExitingAmount, decimals)} KAT` : "";
  const chainText =
    snapshot.chainId === EXPECTED_CHAIN_ID
      ? `${syncMode} · block ${formatInteger(snapshot.blockNumber)}${queueText}`
      : `Unexpected chain ${snapshot.chainId} · block ${formatInteger(snapshot.blockNumber)}`;

  setStatus(snapshot.chainId === EXPECTED_CHAIN_ID ? "ok" : "error", chainText);
}

function renderCharts(history) {
  for (const chart of CHARTS) {
    chart.valueElement.style.color = chart.color;
    chart.container.closest(".chart-card")?.style.setProperty("--chart-accent", chart.color);

    const latestSnapshot = history[history.length - 1];
    if (latestSnapshot) {
      updateText(chart.valueElement, chart.latestLabelFor(latestSnapshot));
    }

    if (history.length < 2) {
      chart.container.innerHTML =
        '<div class="chart-empty">Need at least two cached snapshots before this trend becomes meaningful.</div>';
      continue;
    }

    const series = history.map((snapshot) => ({
      timestamp: snapshot.recordedAt,
      rawValue: chart.valueFor(snapshot),
      numericValue: chart.numericFor(snapshot),
      snapshot,
    }));

    const builtChart = buildLineChartMarkup(series, chart);
    chart.container.innerHTML = builtChart.markup;
    attachChartTooltip(chart.container, builtChart.points, chart, builtChart.viewBox);
  }
}

function renderKatOverviewChart(history) {
  renderKatOverviewLegend();

  const activeSeries = KAT_OVERVIEW_SERIES.filter((series) => katOverviewVisibility[series.key]);
  const latestSnapshot = history[history.length - 1];

  if (!latestSnapshot) {
    updateText(dom.katOverviewSummary, "--");
    dom.katOverviewChart.innerHTML =
      '<div class="chart-empty">Waiting for the first cached snapshots before the KAT overlay can render.</div>';
    return;
  }

  if (activeSeries.length === 0) {
    updateText(dom.katOverviewSummary, "No series active");
    dom.katOverviewChart.innerHTML =
      '<div class="chart-empty">Turn on at least one KAT series to render the overlay chart.</div>';
    return;
  }

  if (activeSeries.length === 1) {
    updateText(
      dom.katOverviewSummary,
      `${activeSeries[0].label} · ${formatTokenDisplay(activeSeries[0].valueFor(latestSnapshot), latestSnapshot.decimals)} KAT`
    );
  } else {
    updateText(dom.katOverviewSummary, `${activeSeries.length} active lines`);
  }

  if (history.length < 2) {
    dom.katOverviewChart.innerHTML =
      '<div class="chart-empty">Need at least two cached snapshots before this trend becomes meaningful.</div>';
    return;
  }

  const builtChart = buildMultiLineChartMarkup(history, activeSeries);
  dom.katOverviewChart.innerHTML = builtChart.markup;
  attachMultiChartTooltip(dom.katOverviewChart, builtChart.pointsByIndex, activeSeries, builtChart.viewBox);
}

function renderKatOverviewLegend() {
  dom.katOverviewLegend.innerHTML = KAT_OVERVIEW_SERIES.map((series) => {
    const isActive = katOverviewVisibility[series.key];
    return `
      <button
        class="chart-toggle${isActive ? " is-active" : ""}"
        type="button"
        data-series-key="${series.key}"
        style="--toggle-color:${series.color}"
        aria-pressed="${String(isActive)}"
      >
        <span class="chart-toggle-swatch" aria-hidden="true"></span>
        <span>${series.label}</span>
      </button>
    `;
  }).join("");

  for (const button of dom.katOverviewLegend.querySelectorAll("[data-series-key]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.seriesKey;
      if (!key) {
        return;
      }

      const activeCount = Object.values(katOverviewVisibility).filter(Boolean).length;
      if (katOverviewVisibility[key] && activeCount === 1) {
        return;
      }

      katOverviewVisibility[key] = !katOverviewVisibility[key];
      renderKatOverviewChart(latestKatOverviewHistory);
    });
  }
}

function buildLineChartMarkup(series, chart) {
  const { width, height, paddingX, paddingTop, paddingBottom } = CHART_VIEWBOX;
  const baseline = height - paddingBottom;
  const chartWidth = width - paddingX * 2;
  const chartHeight = baseline - paddingTop;
  const values = series.map((point) => point.numericValue);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const hasSpread = maxValue !== minValue;
  const range = hasSpread ? maxValue - minValue : 1;

  const points = series.map((point, index) => {
    const x = paddingX + (chartWidth * index) / Math.max(series.length - 1, 1);
    const normalizedY = hasSpread ? (point.numericValue - minValue) / range : 0.5;
    const y = baseline - normalizedY * chartHeight;
    return { ...point, x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(2)} ${baseline.toFixed(2)} L${points[0].x.toFixed(2)} ${baseline.toFixed(2)} Z`;
  const peakPoint = points.reduce((best, point) => (point.numericValue >= best.numericValue ? point : best), points[0]);
  const lastPoint = points[points.length - 1];
  const gridLines = new Array(4).fill(null).map((_, index) => {
    const y = paddingTop + (chartHeight * index) / 3;
    return `<line class="chart-grid-line" x1="${paddingX}" y1="${y.toFixed(2)}" x2="${(width - paddingX).toFixed(2)}" y2="${y.toFixed(2)}" />`;
  });

  return {
    points,
    viewBox: CHART_VIEWBOX,
    markup: `
      <div
        class="chart-interactive"
        tabindex="0"
        role="img"
        aria-label="${chart.name} history chart. Use left and right arrow keys to inspect snapshots."
      >
        <svg viewBox="0 0 ${width} ${height}" class="chart-svg" aria-hidden="true" preserveAspectRatio="none">
          ${gridLines.join("")}
          <path class="chart-area" fill="${chart.color}" d="${areaPath}" />
          <path class="chart-line" stroke="${chart.color}" d="${linePath}" />
          <circle class="chart-endpoint" fill="${chart.color}" cx="${lastPoint.x.toFixed(2)}" cy="${lastPoint.y.toFixed(2)}" r="4.5" />
          <circle class="chart-endpoint" fill="${chart.color}" cx="${peakPoint.x.toFixed(2)}" cy="${peakPoint.y.toFixed(2)}" r="3.5" />
        </svg>
        <div class="chart-hover-line" aria-hidden="true"></div>
        <div class="chart-hover-dot" aria-hidden="true" style="background:${chart.color}"></div>
        <div class="chart-hover-tooltip" aria-hidden="true">
          <p class="chart-tooltip-label"></p>
          <p class="chart-tooltip-value"></p>
        </div>
      </div>
      <div class="chart-footer">
        <span>${formatChartTime(points[0].timestamp)}</span>
        <span>${chart.peakLabelFor(peakPoint.snapshot)}</span>
        <span>${formatChartTime(lastPoint.timestamp)}</span>
      </div>
    `,
  };
}

function buildMultiLineChartMarkup(history, activeSeries) {
  const { width, height, paddingX, paddingTop, paddingBottom } = CHART_VIEWBOX;
  const baseline = height - paddingBottom;
  const chartWidth = width - paddingX * 2;
  const chartHeight = baseline - paddingTop;
  const values = history.flatMap((snapshot) =>
    activeSeries.map((series) => series.numericFor(snapshot))
  );
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const hasSpread = maxValue !== minValue;
  const range = hasSpread ? maxValue - minValue : 1;

  const pointsByIndex = history.map((snapshot, index) => {
    const x = paddingX + (chartWidth * index) / Math.max(history.length - 1, 1);
    const entries = activeSeries.map((series) => {
      const numericValue = series.numericFor(snapshot);
      const normalizedY = hasSpread ? (numericValue - minValue) / range : 0.5;
      return {
        ...series,
        rawValue: series.valueFor(snapshot),
        numericValue,
        y: baseline - normalizedY * chartHeight,
      };
    });

    return {
      x,
      timestamp: snapshot.recordedAt,
      snapshot,
      entries,
    };
  });

  const gridLines = new Array(4).fill(null).map((_, index) => {
    const y = paddingTop + (chartHeight * index) / 3;
    return `<line class="chart-grid-line" x1="${paddingX}" y1="${y.toFixed(2)}" x2="${(width - paddingX).toFixed(2)}" y2="${y.toFixed(2)}" />`;
  });

  const linePaths = activeSeries.map((series) => {
    const path = pointsByIndex
      .map((point, index) => {
        const entry = point.entries.find((candidate) => candidate.key === series.key);
        return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${entry.y.toFixed(2)}`;
      })
      .join(" ");

    return `<path class="chart-line" stroke="${series.color}" d="${path}" />`;
  });

  const lastPoint = pointsByIndex[pointsByIndex.length - 1];
  const latestDots = lastPoint.entries.map((entry) => {
    return `<circle class="chart-endpoint" fill="${entry.color}" cx="${lastPoint.x.toFixed(2)}" cy="${entry.y.toFixed(2)}" r="4.5" />`;
  });

  return {
    pointsByIndex,
    viewBox: CHART_VIEWBOX,
    markup: `
      <div
        class="chart-interactive"
        tabindex="0"
        role="img"
        aria-label="Overlaid KAT position chart. Use the toggle buttons to switch series and the left and right arrow keys to inspect snapshots."
      >
        <svg viewBox="0 0 ${width} ${height}" class="chart-svg" aria-hidden="true" preserveAspectRatio="none">
          ${gridLines.join("")}
          ${linePaths.join("")}
          ${latestDots.join("")}
        </svg>
        <div class="chart-hover-line" aria-hidden="true"></div>
        <div class="chart-hover-series" aria-hidden="true">
          ${activeSeries
            .map(
              (series) =>
                `<div class="chart-hover-dot" data-series-key="${series.key}" style="background:${series.color}"></div>`
            )
            .join("")}
        </div>
        <div class="chart-hover-tooltip chart-hover-tooltip-wide" aria-hidden="true">
          <p class="chart-tooltip-label"></p>
          <div class="chart-tooltip-list"></div>
        </div>
      </div>
      <div class="chart-footer">
        <span>${formatChartTime(pointsByIndex[0].timestamp)}</span>
        <span>${activeSeries.length} active series</span>
        <span>${formatChartTime(lastPoint.timestamp)}</span>
      </div>
    `,
  };
}

function attachChartTooltip(container, points, chart, viewBox) {
  const interactive = container.querySelector(".chart-interactive");
  const hoverLine = container.querySelector(".chart-hover-line");
  const hoverDot = container.querySelector(".chart-hover-dot");
  const hoverTooltip = container.querySelector(".chart-hover-tooltip");
  const hoverTooltipLabel = container.querySelector(".chart-tooltip-label");
  const hoverTooltipValue = container.querySelector(".chart-tooltip-value");

  if (!interactive || !hoverLine || !hoverDot || !hoverTooltip || !hoverTooltipLabel || !hoverTooltipValue) {
    return;
  }

  let activeIndex = points.length - 1;

  const showPoint = (index) => {
    activeIndex = clamp(index, 0, points.length - 1);
    const point = points[activeIndex];
    const rect = interactive.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const x = (point.x / viewBox.width) * rect.width;
    const y = (point.y / viewBox.height) * rect.height;

    hoverTooltipLabel.textContent = formatTimestamp(point.timestamp);
    hoverTooltipValue.textContent = chart.tooltipValueFor(point.snapshot);
    interactive.classList.add("is-active");

    const clampedX = clamp(x, CHART_TOOLTIP_GUTTER, rect.width - CHART_TOOLTIP_GUTTER);
    const clampedY = clamp(y, CHART_TOOLTIP_GUTTER, rect.height - CHART_TOOLTIP_GUTTER);
    hoverLine.style.left = `${clampedX}px`;
    hoverDot.style.left = `${clampedX}px`;
    hoverDot.style.top = `${clampedY}px`;

    const tooltipRect = hoverTooltip.getBoundingClientRect();
    let tooltipLeft = clampedX + CHART_TOOLTIP_OFFSET;
    let tooltipTop = clampedY - tooltipRect.height - CHART_TOOLTIP_OFFSET;

    if (tooltipLeft + tooltipRect.width > rect.width - CHART_TOOLTIP_GUTTER) {
      tooltipLeft = clampedX - tooltipRect.width - CHART_TOOLTIP_OFFSET;
    }

    if (tooltipLeft < CHART_TOOLTIP_GUTTER) {
      tooltipLeft = CHART_TOOLTIP_GUTTER;
    }

    if (tooltipTop < CHART_TOOLTIP_GUTTER) {
      tooltipTop = Math.min(
        clampedY + CHART_TOOLTIP_OFFSET,
        rect.height - tooltipRect.height - CHART_TOOLTIP_GUTTER
      );
    }

    hoverTooltip.style.left = `${tooltipLeft}px`;
    hoverTooltip.style.top = `${Math.max(tooltipTop, CHART_TOOLTIP_GUTTER)}px`;
  };

  const showClosestPoint = (clientX) => {
    const rect = interactive.getBoundingClientRect();
    if (!rect.width) {
      return;
    }

    const relativeX = clamp(clientX - rect.left, 0, rect.width);
    const targetX = (relativeX / rect.width) * viewBox.width;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [index, point] of points.entries()) {
      const distance = Math.abs(point.x - targetX);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }

    showPoint(nearestIndex);
  };

  const hidePoint = () => {
    interactive.classList.remove("is-active");
  };

  interactive.addEventListener("pointerenter", (event) => {
    showClosestPoint(event.clientX);
  });

  interactive.addEventListener("pointermove", (event) => {
    showClosestPoint(event.clientX);
  });

  interactive.addEventListener("pointerdown", (event) => {
    showClosestPoint(event.clientX);
  });

  interactive.addEventListener("pointerleave", hidePoint);
  interactive.addEventListener("pointercancel", hidePoint);
  interactive.addEventListener("blur", hidePoint);
  interactive.addEventListener("focus", () => {
    showPoint(activeIndex);
  });

  interactive.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPoint(activeIndex - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showPoint(activeIndex + 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      showPoint(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      showPoint(points.length - 1);
      return;
    }

    if (event.key === "Escape") {
      interactive.blur();
    }
  });
}

function attachMultiChartTooltip(container, pointsByIndex, activeSeries, viewBox) {
  const interactive = container.querySelector(".chart-interactive");
  const hoverLine = container.querySelector(".chart-hover-line");
  const hoverTooltip = container.querySelector(".chart-hover-tooltip");
  const hoverTooltipLabel = container.querySelector(".chart-tooltip-label");
  const hoverTooltipList = container.querySelector(".chart-tooltip-list");

  if (!interactive || !hoverLine || !hoverTooltip || !hoverTooltipLabel || !hoverTooltipList) {
    return;
  }

  const hoverDots = new Map(
    Array.from(container.querySelectorAll(".chart-hover-dot")).map((dot) => [dot.dataset.seriesKey, dot])
  );

  let activeIndex = pointsByIndex.length - 1;

  const showPoint = (index) => {
    activeIndex = clamp(index, 0, pointsByIndex.length - 1);
    const point = pointsByIndex[activeIndex];
    const rect = interactive.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const x = (point.x / viewBox.width) * rect.width;
    const clampedX = clamp(x, CHART_TOOLTIP_GUTTER, rect.width - CHART_TOOLTIP_GUTTER);

    hoverTooltipLabel.textContent = formatTimestamp(point.timestamp);
    hoverTooltipList.innerHTML = point.entries
      .map(
        (entry) => `
          <div class="chart-tooltip-row">
            <span class="chart-tooltip-series">
              <span class="chart-tooltip-series-dot" style="background:${entry.color}"></span>
              <span>${entry.label}</span>
            </span>
            <span>${entry.tooltipValueFor(point.snapshot)}</span>
          </div>
        `
      )
      .join("");
    interactive.classList.add("is-active");

    hoverLine.style.left = `${clampedX}px`;

    for (const entry of point.entries) {
      const dot = hoverDots.get(entry.key);
      if (!dot) {
        continue;
      }

      const y = (entry.y / viewBox.height) * rect.height;
      dot.style.left = `${clampedX}px`;
      dot.style.top = `${clamp(y, CHART_TOOLTIP_GUTTER, rect.height - CHART_TOOLTIP_GUTTER)}px`;
    }

    const tooltipRect = hoverTooltip.getBoundingClientRect();
    let tooltipLeft = clampedX + CHART_TOOLTIP_OFFSET;
    let tooltipTop = CHART_TOOLTIP_GUTTER;

    if (tooltipLeft + tooltipRect.width > rect.width - CHART_TOOLTIP_GUTTER) {
      tooltipLeft = clampedX - tooltipRect.width - CHART_TOOLTIP_OFFSET;
    }

    if (tooltipLeft < CHART_TOOLTIP_GUTTER) {
      tooltipLeft = CHART_TOOLTIP_GUTTER;
    }

    hoverTooltip.style.left = `${tooltipLeft}px`;
    hoverTooltip.style.top = `${tooltipTop}px`;
  };

  const showClosestPoint = (clientX) => {
    const rect = interactive.getBoundingClientRect();
    if (!rect.width) {
      return;
    }

    const relativeX = clamp(clientX - rect.left, 0, rect.width);
    const targetX = (relativeX / rect.width) * viewBox.width;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [index, point] of pointsByIndex.entries()) {
      const distance = Math.abs(point.x - targetX);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }

    showPoint(nearestIndex);
  };

  const hidePoint = () => {
    interactive.classList.remove("is-active");
  };

  interactive.addEventListener("pointerenter", (event) => {
    showClosestPoint(event.clientX);
  });

  interactive.addEventListener("pointermove", (event) => {
    showClosestPoint(event.clientX);
  });

  interactive.addEventListener("pointerdown", (event) => {
    showClosestPoint(event.clientX);
  });

  interactive.addEventListener("pointerleave", hidePoint);
  interactive.addEventListener("pointercancel", hidePoint);
  interactive.addEventListener("blur", hidePoint);
  interactive.addEventListener("focus", () => {
    showPoint(activeIndex);
  });

  interactive.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPoint(activeIndex - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showPoint(activeIndex + 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      showPoint(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      showPoint(pointsByIndex.length - 1);
      return;
    }

    if (event.key === "Escape") {
      interactive.blur();
    }
  });
}

function normalizeHistory(latestSnapshot, historySnapshots) {
  const merged = [latestSnapshot, ...historySnapshots];
  const seen = new Set();
  const deduped = [];

  for (const snapshot of merged) {
    const key = `${snapshot.recordedAt}-${snapshot.blockNumber}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(snapshot);
  }

  return deduped
    .sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime())
    .slice(-HISTORY_LIMIT);
}

function updateLink(element, address) {
  element.href = `${SCAN_BASE_URL}${address}`;
  element.textContent = shortAddress(address);
  element.dataset.address = address;
}

function updateText(element, nextValue) {
  if (element.textContent === nextValue) {
    return;
  }

  element.textContent = nextValue;
  element.classList.remove("is-live");
  void element.offsetWidth;
  element.classList.add("is-live");
}

function setStatus(state, text) {
  dom.statusPill.dataset.state = state;
  dom.statusText.textContent = text;
}

async function fetchPayload(forceRefresh) {
  if (forceRefresh) {
    return fetchJson(API_REFRESH_ENDPOINT, { method: "POST" });
  }

  return fetchJson(API_STATS_ENDPOINT, { method: "GET" });
}

async function fetchHistory(limit) {
  return fetchJson(`${API_HISTORY_ENDPOINT}?limit=${limit}`, { method: "GET" });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}`);
  }
  return response.json();
}

function normalizeAddress(address) {
  return address.toLowerCase();
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(isoString) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(isoString));
}

function formatChartTime(isoString) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function formatInteger(value) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function toBigInt(value) {
  return typeof value === "bigint" ? value : BigInt(value);
}

function toTokenNumber(value, decimals) {
  const amount = toBigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const scale = 1_000_000n;
  const scaled = whole * scale + (fraction * scale) / divisor;
  return Number(scaled) / Number(scale);
}

function formatUnits(value, decimals, precision) {
  const amount = toBigInt(value);
  const negative = amount < 0n;
  const absoluteValue = negative ? -amount : amount;
  const divisor = 10n ** BigInt(decimals);
  const whole = absoluteValue / divisor;
  const fraction = absoluteValue % divisor;

  let fractionText = fraction.toString().padStart(decimals, "0");
  fractionText = fractionText.slice(0, precision).replace(/0+$/, "");

  const wholeText = formatInteger(whole);
  const prefix = negative ? "-" : "";
  return fractionText ? `${prefix}${wholeText}.${fractionText}` : `${prefix}${wholeText}`;
}

function formatCompactToken(value, decimals, divisorWhole, suffix) {
  const amount = toBigInt(value);
  const unit = 10n ** BigInt(decimals);
  const divisor = divisorWhole * unit;
  const scaled = (amount * 100n) / divisor;
  const whole = scaled / 100n;
  const fraction = (scaled % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}${suffix}` : `${whole}${suffix}`;
}

function formatTokenDisplay(value, decimals) {
  const amount = toBigInt(value);
  const whole = amount / 10n ** BigInt(decimals);

  if (whole >= 1_000_000_000n) {
    return formatCompactToken(amount, decimals, 1_000_000_000n, "B");
  }

  if (whole >= 1_000_000n) {
    return formatCompactToken(amount, decimals, 1_000_000n, "M");
  }

  if (whole >= 1_000n) {
    return formatInteger(whole);
  }

  if (whole >= 1n) {
    return formatUnits(amount, decimals, 2);
  }

  if (amount === 0n) {
    return "0";
  }

  return formatUnits(amount, decimals, 4);
}

function formatTokenDetail(value, decimals) {
  const amount = toBigInt(value);
  const whole = amount / 10n ** BigInt(decimals);

  if (whole >= 1_000n) {
    return formatInteger(whole);
  }

  if (whole >= 1n) {
    return formatUnits(amount, decimals, 2);
  }

  if (amount === 0n) {
    return "0";
  }

  return formatUnits(amount, decimals, 4);
}

function formatCompactCount(value, divisor, suffix) {
  const count = toBigInt(value);
  const scaled = (count * 10n) / divisor;
  const whole = scaled / 10n;
  const fraction = (scaled % 10n).toString().replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}${suffix}` : `${whole}${suffix}`;
}

function formatCountDisplay(value) {
  const count = toBigInt(value);

  if (count >= 1_000_000_000n) {
    return formatCompactCount(count, 1_000_000_000n, "B");
  }

  if (count >= 1_000_000n) {
    return formatCompactCount(count, 1_000_000n, "M");
  }

  return formatInteger(count);
}

function formatCountDetail(value) {
  return formatInteger(toBigInt(value));
}

refreshDashboard();
window.setInterval(() => {
  refreshDashboard();
}, REFRESH_INTERVAL_MS);
