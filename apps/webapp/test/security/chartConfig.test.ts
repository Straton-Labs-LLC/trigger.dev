import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryWidgetConfig } from "~/components/metrics/QueryWidget";
import {
  ChartContainer,
  type ChartConfig,
} from "~/components/primitives/charts/Chart";

const chartConfig = {
  type: "chart",
  chartType: "line",
  xAxisColumn: null,
  yAxisColumns: ["value"],
  groupByColumn: null,
  stacked: false,
  sortByColumn: null,
  sortDirection: "asc",
  aggregation: "sum",
} as const;

describe("persisted chart configuration", () => {
  it("accepts palette hex colors", () => {
    const result = QueryWidgetConfig.safeParse({
      ...chartConfig,
      seriesColors: { value: "#f43f5e" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects colors that can contain CSS or markup", () => {
    for (const color of [
      "red;}</style><script>alert(1)</script><style>",
      "url(https://attacker.invalid/pixel)",
      "var(--user-controlled)",
    ]) {
      const result = QueryWidgetConfig.safeParse({
        ...chartConfig,
        seriesColors: { value: color },
      });

      expect(result.success).toBe(false);
    }
  });

  it("never serializes series names or colors into style markup", () => {
    const payload = "</style><script>alert(1)</script>";
    const config: ChartConfig = { [payload]: { color: payload } };
    const markup = renderToStaticMarkup(
      React.createElement(ChartContainer, {
        config,
        children: React.createElement("div"),
      })
    );

    expect(markup).not.toContain("<style");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain(payload);
  });
});
