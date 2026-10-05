import { describe, expect, it } from "vitest";
import { relevanceOf } from "../src/relevance";

// Vectors from Ratel Cloud's calibration-compare tests: relevance is each hit's
// share of the top score in its own list.
describe("relevanceOf", () => {
  it("scores each hit against the top one", () => {
    expect(relevanceOf([{ score: 8 }, { score: 2 }])).toEqual([1, 0.25]);
    expect(relevanceOf([{ score: 6 }, { score: 3 }])).toEqual([1, 0.5]);
  });

  it("is 0 when the top score is not positive", () => {
    expect(relevanceOf([{ score: 0 }, { score: 0 }])).toEqual([0, 0]);
    expect(relevanceOf([{ score: -1 }])).toEqual([0]);
  });

  it("clamps to 0..1 and handles an empty list", () => {
    expect(relevanceOf([{ score: 4 }, { score: -2 }])).toEqual([1, 0]);
    expect(relevanceOf([])).toEqual([]);
  });
});
