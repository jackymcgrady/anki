// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

/* eslint
@typescript-eslint/no-explicit-any: "off",
 */

import type { GraphsResponse } from "@generated/anki/stats_pb";
import * as tr from "@generated/ftl";
import { localizedNumber } from "@tslib/i18n";
import type { Bin, ScaleLinear } from "d3";
import { bin, interpolateRdYlGn, scaleLinear, scaleSequential, sum } from "d3";

import type { SearchDispatch, TableDatum } from "./graph-helpers";
import { getNumericMapBinValue, numericMap } from "./graph-helpers";
import type { HistogramData } from "./histogram-graph";

export interface GraphData {
    eases: Map<number, number>;
    average: number;
}

export function gatherData(data: GraphsResponse): GraphData {
    return { eases: numericMap(data.difficulty!.eases), average: data.difficulty!.average };
}

function makeQuery(start: number, end: number): string {
    const fromQuery = `"prop:d>=${start / 100}"`;
    let tillQuery = `"prop:d<${(end + 1) / 100}"`;
    if (end === 99) {
        tillQuery = tillQuery.replace("<", "<=");
    }
    return `${fromQuery} AND ${tillQuery}`;
}

function getAdjustedScaleAndTicks(
    min: number,
    max: number,
    desiredBars: number,
): [ScaleLinear<number, number, never>, number[]] {
    const prescale = scaleLinear().domain([min, max]).nice();
    const ticks = prescale.ticks(desiredBars);

    const predomain = prescale.domain() as [number, number];

    const minOffset = min - predomain[0];
    const tickSize = ticks[1] - ticks[0];

    if (minOffset === 0 || (minOffset % tickSize !== 0 && tickSize % minOffset !== 0)) {
        return [prescale, ticks];
    }

    const add = (n: number): number => n + minOffset;
    return [
        scaleLinear().domain(predomain.map(add) as [number, number]),
        ticks.map(add),
    ];
}

export function prepareData(
    data: GraphData,
    dispatch: SearchDispatch,
    browserLinksSupported: boolean,
): [HistogramData | null, TableDatum[]] {
    // get min/max
    const allEases = data.eases;
    if (!allEases.size) {
        return [null, []];
    }
    const xMin = 0;
    const xMax = 100;
    const desiredBars = 20;

    const [scale, ticks] = getAdjustedScaleAndTicks(xMin, xMax, desiredBars);

    const bins = bin()
        .value((m) => {
            return m[0];
        })
        .domain(scale.domain() as [number, number])
        .thresholds(ticks)(allEases.entries() as any);
    const total = sum(bins as any, getNumericMapBinValue);

    const colourScale = scaleSequential(interpolateRdYlGn).domain([100, 0]);

    function hoverText(bin: Bin<number, number>, _percent: number): string {
        const percent = `${bin.x0}%-${bin.x1}%`;
        return tr.statisticsCardDifficultyTooltip({
            cards: getNumericMapBinValue(bin as any),
            percent,
        });
    }

    function onClick(bin: Bin<number, number>): void {
        const start = bin.x0!;
        const end = bin.x1! - 1;
        const query = makeQuery(start, end);
        dispatch("search", { query });
    }

    const xTickFormat = (num: number): string => localizedNumber(num, 0) + "%";
    const tableData = [
        {
            label: tr.statisticsMedianDifficulty(),
            value: xTickFormat(data.average),
        },
    ];

    return [
        {
            scale,
            bins,
            total,
            hoverText,
            onClick: browserLinksSupported ? onClick : null,
            colourScale,
            showArea: false,
            binValue: getNumericMapBinValue,
            xTickFormat,
        },
        tableData,
    ];
}
