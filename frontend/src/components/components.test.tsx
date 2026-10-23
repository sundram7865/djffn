import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DataQuality, Preset } from "../api/types";
import { CutoffPicker } from "./controls";
import { DataQualityPanel, InsightPanel } from "./panels";
import { StatTile } from "./ui";

const presets: Preset[] = [
  { id: "epex-da-60", label: "EPEX GB day-ahead (hourly)", time: "09:20", description: "" },
  { id: "n2ex-da", label: "Nord Pool N2EX GB day-ahead", time: "09:50", description: "" },
];

describe("CutoffPicker", () => {
  it("marks the active preset and switches on click", async () => {
    const onChange = vi.fn();
    render(<CutoffPicker value="09:20" presets={presets} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /09:20/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /09:50/ }));
    expect(onChange).toHaveBeenCalledWith("09:50");
  });
});

describe("InsightPanel", () => {
  it("renders the computed headline and every point", () => {
    render(
      <InsightPanel
        insights={{
          headline:
            "At a 09:20 cutoff on D-1, the wind forecast was typically off by 2.02 GW (MAE).",
          buffer_mw: 4154,
          points: [
            { id: "direction", tone: "warning", text: "The forecast ran high in 85% of hours." },
            { id: "buffer", tone: "action", text: "Plan with wind at forecast − 4.15 GW." },
          ],
        }}
      />,
    );
    expect(screen.getByText(/typically off by 2.02 GW/)).toBeInTheDocument();
    expect(screen.getByText(/ran high in 85%/)).toBeInTheDocument();
    expect(screen.getByLabelText("Recommendation")).toBeInTheDocument();
  });
});

describe("DataQualityPanel", () => {
  it("surfaces warnings instead of hiding them", () => {
    const dq: DataQuality = {
      status: "warning",
      expected_hours: 24,
      forecast_hours: 22,
      actual_hours: 24,
      scored_hours: 22,
      runs_used: [],
      checks: [
        {
          id: "forecast-coverage",
          label: "Forecast coverage",
          status: "warning",
          detail: "22/24 target hours",
        },
        {
          id: "actual-coverage",
          label: "Actual generation coverage",
          status: "ok",
          detail: "48/48",
        },
      ],
    };
    render(<DataQualityPanel dq={dq} />);
    expect(screen.getByText(/review the warnings/)).toBeInTheDocument();
    expect(screen.getByLabelText("Warning")).toBeInTheDocument();
    expect(screen.getByText(/22\/24 target hours/)).toBeInTheDocument();
  });
});

describe("StatTile", () => {
  it("shows a skeleton while loading and the value afterwards", () => {
    const { rerender, container } = render(<StatTile label="MAE" value="2.02 GW" loading />);
    expect(container.querySelector(".skeleton")).not.toBeNull();
    rerender(<StatTile label="MAE" value="2.02 GW" sub="18% of wind output" />);
    expect(screen.getByText("2.02 GW")).toBeInTheDocument();
    expect(screen.getByText("18% of wind output")).toBeInTheDocument();
  });
});
