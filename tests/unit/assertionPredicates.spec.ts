import { describe, it, expect } from "vitest";
import {
  matchesRegex,
  isOneOf,
  lengthOf,
  containsValue,
  bodyStartsWithBytes,
} from "../../src/interpreter/assertionPredicates.js";

describe("matchesRegex", () => {
  it("tests the value coerced to a string against the pattern", () => {
    expect(matchesRegex("booked", "^book")).toBe(true);
    expect(matchesRegex("booked", "^ship")).toBe(false);
    expect(matchesRegex(42, "^4")).toBe(true);
  });
});

describe("isOneOf", () => {
  it("matches primitives by value", () => {
    expect(isOneOf("booked", ["booked", "in_transit"])).toBe(true);
    expect(isOneOf("cancelled", ["booked", "in_transit"])).toBe(false);
  });

  it("matches objects/arrays by deep equality, not reference", () => {
    expect(isOneOf({ a: 1 }, [{ a: 1 }, { a: 2 }])).toBe(true);
    expect(isOneOf({ a: 1 }, [{ a: 2 }])).toBe(false);
  });
});

describe("containsValue", () => {
  it("does substring containment on a string value", () => {
    expect(containsValue("application/json; charset=utf-8", "json")).toBe(true);
    expect(containsValue("application/json; charset=utf-8", "xml")).toBe(false);
  });

  it("does array membership on an array value, not substring matching", () => {
    expect(containsValue(["a", "b", "c"], "b")).toBe(true);
    expect(containsValue(["a", "b", "c"], "z")).toBe(false);
  });

  it("matches array elements by deep equality for objects", () => {
    expect(containsValue([{ id: 1 }, { id: 2 }], { id: 2 })).toBe(true);
    expect(containsValue([{ id: 1 }], { id: 2 })).toBe(false);
  });
});

describe("bodyStartsWithBytes", () => {
  it("matches an ASCII prefix like a PDF magic number", () => {
    const pdfLike = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), Buffer.from([0x25, 0x25, 0x45, 0x4f, 0x46])]);
    expect(bodyStartsWithBytes(pdfLike, "%PDF-")).toBe(true);
    expect(bodyStartsWithBytes(pdfLike, "GIF89a")).toBe(false);
  });

  it("round-trips non-printable bytes losslessly via latin1", () => {
    const zipLike = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const magic = zipLike.subarray(0, 4).toString("latin1");
    expect(bodyStartsWithBytes(zipLike, magic)).toBe(true);
  });
});

describe("lengthOf", () => {
  it("returns string length", () => {
    expect(lengthOf("Rex")).toBe(3);
  });
  it("returns array length", () => {
    expect(lengthOf([1, 2, 3])).toBe(3);
  });
  it("returns undefined for values without a meaningful length", () => {
    expect(lengthOf(42)).toBeUndefined();
    expect(lengthOf(undefined)).toBeUndefined();
    expect(lengthOf({ length: "not a real length" })).toBeUndefined();
  });
});
