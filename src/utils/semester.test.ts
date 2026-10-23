import { describe, it, expect } from "vitest";
import { semesterKeyFromDate, semesterLabel, weightedGradeAverage } from "./semester";

describe("semester", () => {
  it("October belongs to the winter semester of that year", () => {
    expect(semesterKeyFromDate(new Date(2026, 9, 23))).toBe("WS2026");
  });
  it("January belongs to the previous year's winter semester", () => {
    expect(semesterKeyFromDate(new Date(2027, 0, 10))).toBe("WS2026");
  });
  it("May belongs to the summer semester", () => {
    expect(semesterKeyFromDate(new Date(2026, 4, 1))).toBe("SS2026");
  });
  it("labels winter semesters with both years", () => {
    expect(semesterLabel("WS2026")).toBe("WS 2026/27");
  });
});

describe("weightedGradeAverage", () => {
  it("weights grades by ECTS", () => {
    expect(weightedGradeAverage([{ ects: 6, grade: 1 }, { ects: 3, grade: 4 }])).toBe(2);
  });
  it("ignores courses without grade", () => {
    expect(weightedGradeAverage([{ ects: 6, grade: 2 }, { ects: 5, grade: null }])).toBe(2);
  });
});
